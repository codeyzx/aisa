/**
 * The safe account DTO — the ONE shape a Firebase Auth `UserRecord` is allowed to
 * become before it crosses to the browser, and the mapper that produces it.
 *
 * A raw `UserRecord` is not a DTO. It carries `passwordHash`, `passwordSalt`,
 * `customClaims`, `providerData`, `phoneNumber`, `multiFactor`, `tokensValidAfterTime`
 * and `toJSON()` — none of which a UI needs and several of which are credential
 * material. Because an RSC payload serializes whatever is passed to a `'use client'`
 * component, "just pass the record" is a leak, not a shortcut. So this module owns
 * the allowlist: `toAccountSummary` names every field that may travel, and anything
 * it does not name cannot reach a client by accident.
 *
 * This is a `*.contract.ts`, so it stays pure — the `UserRecord` import is
 * TYPE-ONLY and erased at build, and `contract-purity` enforces that it stays so.
 * A client component may therefore name an `AccountSummary` without dragging
 * `firebase-admin` into the browser bundle.
 *
 * See `session.contract.ts` for the sibling rule on `Session`, the other type that
 * crosses this boundary.
 */
import type { UserRecord } from 'firebase-admin/auth'
import * as z from 'zod'

import { ROLES, roleFromClaims, type Role } from './rbac'

/**
 * One account as an admin surface may see it: identity, authority, and access
 * state. Every field is either already visible to the account's own user or is
 * administrative state an admin is entitled to read — never a secret, never a
 * provider blob, never the raw claims bag.
 */
export interface AccountSummary {
  uid: string
  email: string | null
  displayName: string | null
  /** Resolved through `roleFromClaims`, so an absent/forged claim reads as `user`. */
  role: Role
  /** Firebase Auth's `disabled` — the ONE authority on whether an account may sign in. */
  disabled: boolean
  emailVerified: boolean
  /**
   * ISO 8601 UTC, or null when the account has never signed in (or Auth returned
   * an unparseable timestamp). Serialized as a STRING rather than a `Date` because
   * this shape crosses the RSC boundary, where a `Date` survives but an invalid one
   * becomes a silent `Invalid Date` in the UI.
   */
  lastSignInAt: string | null
}

/**
 * Firebase hands back a UTC date string (`metadata.lastSignInTime`) that is empty
 * for an account that has never signed in. Normalize to ISO-8601 or null; never
 * emit `Invalid Date`, and never guess a timestamp that Auth did not give us.
 */
function toIsoOrNull(value: string | undefined): string | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/**
 * Project a live `UserRecord` onto the safe DTO. Pure and total — no I/O, no
 * throw, no dependence on who is asking. AUTHORIZATION is the caller's job: this
 * decides WHAT may travel, never WHETHER this caller may see it.
 */
export function toAccountSummary(record: UserRecord): AccountSummary {
  return {
    uid: record.uid,
    email: record.email ?? null,
    displayName: record.displayName ?? null,
    role: roleFromClaims(record.customClaims),
    disabled: record.disabled,
    emailVerified: record.emailVerified,
    lastSignInAt: toIsoOrNull(record.metadata?.lastSignInTime),
  }
}

/**
 * ── THE ACCOUNT-MUTATION INPUT SCHEMAS ───────────────────────────────────────
 *
 * They live in the CONTRACT, not beside the actions, for the same reason the DTO
 * does: a `'use server'` module may only export async functions, so a schema
 * declared there could never be shared, and forms would end up restating the
 * field rules client-side. One declaration, validated for real at the server
 * boundary and reusable for client-side hints.
 *
 * They are the only place these bounds are spelled. `displayName`'s 200 matches
 * `AccountStateSchema` in `account-audit.contract.ts` on purpose — a name longer
 * than the audit event can record would make the trail lie about what was saved,
 * so it is refused at the boundary instead of truncated.
 */

/**
 * A Firebase uid as it arrives from a client. UNTRUSTED — the caller re-reads the
 * account live regardless; this only bounds the string so a hostile value cannot
 * ride into a document id or a log line. Firebase uids are ≤128 characters.
 */
export const AccountUidSchema = z.string().trim().min(1).max(128)

/**
 * Trim FIRST, then validate — the order is the point, and it is why this is a
 * `.pipe()` rather than `z.email().trim()`. Zod applies string checks in
 * declaration order, so trimming after the email check would reject a pasted
 * address with a trailing space before ever cleaning it, with an error the reader
 * cannot see on their own screen. 320 is RFC 5321's maximum address length.
 */
export const AccountEmailSchema = z
  .string()
  .trim()
  .max(320)
  .pipe(z.email('Email tidak valid'))

export const AccountDisplayNameSchema = z.string().trim().min(1).max(200)

/**
 * Why an admin replaced someone's password. REQUIRED — the module handoff makes
 * this the one operation that demands a reason, because it is the one that hands
 * a working credential to a human, and "who authorised this" is the question the
 * audit trail must be able to answer months later. 500 matches the audit event's
 * own `reason` bound.
 */
export const AccountReasonSchema = z.string().trim().min(1).max(500)

export const CreateAccountSchema = z.object({
  email: AccountEmailSchema,
  displayName: AccountDisplayNameSchema,
  role: z.enum(ROLES),
})
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>

export const UpdateAccountNameSchema = z.object({
  uid: AccountUidSchema,
  displayName: AccountDisplayNameSchema,
})

export const UpdateAccountRoleSchema = z.object({
  uid: AccountUidSchema,
  role: z.enum(ROLES),
})

export const ResetAccountPasswordSchema = z.object({
  uid: AccountUidSchema,
  reason: AccountReasonSchema,
})

/** The shape of every mutation that names only a target — enable, disable, sign-out. */
export const AccountTargetSchema = z.object({ uid: AccountUidSchema })

/**
 * ── THE SELF-SERVICE PASSWORD TRANSITION ─────────────────────────────────────
 *
 * The one account mutation whose actor is the account's own user. It carries a
 * PROOF — a Firebase ID token the browser has just minted by re-entering the
 * current password — beside the new password, because the server has no other
 * way to know the person at the keyboard is the account holder rather than
 * whoever found the laptop with a live session cookie on it.
 *
 * The token is bounded at 4096 characters so a hostile body cannot make the
 * server pay for a megabyte-long "JWT" before Firebase rejects it. The bound is
 * not a validity check — `verifyIdToken` is — it only caps the work.
 */
export const IdTokenProofSchema = z.string().trim().min(1).max(4096)

/**
 * The permanent password a user chooses for themselves.
 *
 * 12 is deliberate and is the one number here worth arguing about. The
 * credential this replaces is a 20-character CSPRNG temporary password
 * (`temporary-password.ts`), so accepting Firebase's own 6-character floor would
 * let the mandatory change be a DOWNGRADE — the flow that exists to strengthen
 * an account would be its weakest moment. 128 caps the work a single hash costs.
 *
 * No composition rules (an uppercase, a digit, a symbol): they push people
 * toward `Password1!` and are worth less than the four extra characters length
 * buys. NIST SP 800-63B says the same thing.
 */
export const NewPasswordSchema = z
  .string()
  .min(12, 'Kata sandi baru minimal 12 karakter')
  .max(128, 'Kata sandi baru maksimal 128 karakter')

export const ChangeOwnPasswordSchema = z.object({
  idToken: IdTokenProofSchema,
  newPassword: NewPasswordSchema,
})

/**
 * ── THE TWO BOOLEAN ACCOUNT STATES, SPELLED ONCE ─────────────────────────────
 *
 * `role` has `ROLE_LABEL` in `rbac.ts`; these are the other two facts an admin
 * surface renders about an account, and they get the same treatment for the same
 * reason. The directory row and the detail page BOTH show them, and a second
 * spelling is how "Nonaktif" on one screen and "Dinonaktifkan" on the other end
 * up describing the same account.
 *
 * They are functions rather than bare `Record<boolean, string>` maps because the
 * mapping — WHICH boolean means which word — is the part that must not be
 * restated. `disabled: true` reading as "Aktif" on one surface is precisely the
 * bug a shared label map alone would not prevent.
 */
export const ACCOUNT_STATUS_LABEL = {
  active: 'Aktif',
  disabled: 'Dinonaktifkan',
} as const

export const ACCOUNT_VERIFICATION_LABEL = {
  verified: 'Terverifikasi',
  unverified: 'Belum terverifikasi',
} as const

/** Whether the account may sign in at all, in words. */
export function accountStatusLabel(account: Pick<AccountSummary, 'disabled'>) {
  return account.disabled
    ? ACCOUNT_STATUS_LABEL.disabled
    : ACCOUNT_STATUS_LABEL.active
}

/** Whether the account's email address has been proven, in words. */
export function accountVerificationLabel(
  account: Pick<AccountSummary, 'emailVerified'>,
) {
  return account.emailVerified
    ? ACCOUNT_VERIFICATION_LABEL.verified
    : ACCOUNT_VERIFICATION_LABEL.unverified
}
