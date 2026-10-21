import 'server-only'

/**
 * The ONE module that reaches Firebase Auth for account administration.
 *
 * ── THE BOUNDARY IT HOLDS ────────────────────────────────────────────────────
 * A raw `UserRecord` never leaves here. Every function that resolves an account
 * maps it through `toAccountSummary` first, so `passwordHash`, `passwordSalt`,
 * the raw `customClaims` bag, `providerData`, `phoneNumber` and `multiFactor`
 * have no path out of this file — see `account.contract.ts` for why "just pass
 * the record" is a leak rather than a shortcut. The two places that genuinely
 * need a raw field read it INSIDE this module and return a scalar:
 * `revokeAccountRefreshTokens` (which returns a cutoff, not a record) and
 * `countAdmins` (which returns a number).
 *
 * ── ABSENCE VS OUTAGE, THE RULE THAT REPEATS ─────────────────────────────────
 * A lookup returns `null` ONLY for a DEFINITIVE Firebase answer ("no account has
 * this uid/email"). Every other failure — an unreachable Admin SDK, a timeout, a
 * quota rejection — THROWS. An outage that reads as "no such user" is the worst
 * available failure here: it would let an admin conclude an account is gone, and
 * it would let a caller conclude there are zero administrators. This is the same
 * fail-safe rule the impersonation overlay (`session.ts`) and the admin user
 * picker apply, and `isDefinitiveLookupMiss` below is the shared predicate.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ────────────────────────────────
 * It does not authorize, audit, revoke sessions, or take the final-admin lease.
 * Those are the ACTION layer's ordered responsibilities and they must stay
 * visible in one place (`lib/actions/account.action.ts`), not be smuggled into
 * the calls that happen to touch Auth.
 *
 * It also holds no general account deletion. The only removal here is
 * `deleteAccountForFailedCreate`, and its name is the contract.
 */
import { adminAuth } from '@/lib/firebase/admin-auth'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { log } from '@/lib/log'

import { toAccountSummary, type AccountSummary } from './account.contract'
import { setAccountClaims } from './claims'
import { isRetainedAdministrator, type Role } from './rbac'
import { revocationCutoff } from './revocation.contract'
import { generateTemporaryPassword } from './temporary-password'

/**
 * A DEFINITIVE Admin-Auth answer to a lookup — the account does not exist, or the
 * email could never identify one — as opposed to the directory being unreachable.
 * Only these two may be reported as absence; see the header.
 *
 * Shared with `app/(app)/admin/_components/user-picker.tsx`, which asks the same
 * question about its exact-email lookup. One predicate, because a second copy of
 * a fail-safe rule is a second place for it to be relaxed by half.
 */
export function isDefinitiveLookupMiss(error: unknown): boolean {
  const code = firebaseErrorCode(error)
  return code === 'auth/user-not-found' || code === 'auth/invalid-email'
}

/** Read one account by uid, or `null` when Firebase says it does not exist. */
export async function getAccount(uid: string): Promise<AccountSummary | null> {
  try {
    return toAccountSummary(await adminAuth().getUser(uid))
  } catch (error) {
    if (isDefinitiveLookupMiss(error)) return null
    throw error
  }
}

/** Exact-email lookup. `null` only for a definitive miss — never for an outage. */
export async function findAccountByEmail(
  email: string,
): Promise<AccountSummary | null> {
  try {
    return toAccountSummary(await adminAuth().getUserByEmail(email))
  } catch (error) {
    if (isDefinitiveLookupMiss(error)) return null
    throw error
  }
}

/** One forward page of the directory. `nextPageToken` is absent on the last page. */
export interface AccountPage {
  accounts: AccountSummary[]
  nextPageToken?: string
}

/**
 * Forward-only directory page. Firebase's `listUsers` has no backward cursor and
 * no total, so neither is invented here — a caller that wants "previous" uses
 * browser history or restarts from the first page.
 */
export async function listAccounts(args: {
  limit: number
  pageToken?: string
}): Promise<AccountPage> {
  const page = await adminAuth().listUsers(args.limit, args.pageToken)
  return {
    accounts: page.users.map(toAccountSummary),
    ...(page.pageToken && { nextPageToken: page.pageToken }),
  }
}

/** Firebase's maximum, and its own hard cap on `listUsers`. */
const ADMIN_COUNT_PAGE_SIZE = 1000

/**
 * How many pages `countAdmins` will walk before refusing to answer. 50 pages ×
 * 1000 = 50,000 accounts. Past that the count would be a guess, and a guess is
 * the one answer this function must never return — see below.
 */
const ADMIN_COUNT_MAX_PAGES = 50

/**
 * How many accounts are BOTH a retained administrator and enabled — where
 * "retained administrator" is decided by `isRetainedAdministrator` (the holder of
 * `admin:users:manage`), never by the `admin` role spelling, so a deployment that
 * splits `ROLES` keeps the final-administrator guarantee. See `rbac.ts`.
 *
 * ⚠️ THIS IS A FULL DIRECTORY SCAN, and there is no cheaper way to get it.
 * Firebase Auth has no claim index and no aggregate query — `listUsers` is the
 * only enumeration it offers — so the cost is one Auth list call per 1000
 * accounts, paid on every role demotion and every disable. That is the price of
 * the final-admin guarantee, and it is why the callers take the lease first and
 * skip this entirely when the target is not an active admin (disabling a
 * `user` cannot reduce the admin count, so the count is not needed to prove it
 * safe).
 *
 * `disabled` accounts are excluded deliberately: a disabled administrator cannot
 * sign in, so counting them would let the last USABLE admin be demoted while the
 * count still read 2.
 *
 * It THROWS rather than truncating past the page bound. Truncation would produce
 * an UNDERcount, which happens to fail safe today (fewer admins → more refusals)
 * — but it fails safe by accident, and the day a caller uses this number for
 * anything else the accident becomes a hole. A loud refusal is honest; a quiet
 * approximation is not.
 */
export async function countAdmins(): Promise<number> {
  const auth = adminAuth()
  let count = 0
  let pageToken: string | undefined
  for (let page = 0; page < ADMIN_COUNT_MAX_PAGES; page += 1) {
    const result = await auth.listUsers(ADMIN_COUNT_PAGE_SIZE, pageToken)
    for (const record of result.users) {
      const account = toAccountSummary(record)
      if (isRetainedAdministrator(account.role) && !account.disabled) count += 1
    }
    if (!result.pageToken) return count
    pageToken = result.pageToken
  }
  throw new Error(
    `countAdmins refused to answer: the directory exceeds ${ADMIN_COUNT_MAX_PAGES * ADMIN_COUNT_PAGE_SIZE} accounts, ` +
      'so any count it returned would be a truncation rather than a fact',
  )
}

export interface CreateAccountInput {
  email: string
  displayName: string
  role: Role
}

/**
 * Create an account with a server-generated temporary password.
 *
 * `emailVerified: false` is EXPLICIT and load-bearing. An admin typing an address
 * into a form is not proof that the person at that address asked for the account,
 * and a `true` here would let a mistyped domain hand a verified identity to
 * whoever owns it. Verification is the target's own act, never an admin's
 * assumption.
 *
 * The claims write is REQUIRED INITIALIZATION, not a follow-up: an account that
 * exists with a temporary password but WITHOUT `mustChangePassword` can sign in
 * and stay signed in on a credential an admin has seen. If it fails, the account
 * is compensatingly removed — the account this call just created, in the same
 * call, which is the only removal this module permits.
 *
 * The returned password is the ONLY copy. It is not stored anywhere and cannot
 * be re-read; a lost one is replaced by `resetAccountPassword`, never recovered.
 */
export async function createAccount(
  input: CreateAccountInput,
): Promise<{ uid: string; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword()
  const record = await adminAuth().createUser({
    email: input.email,
    displayName: input.displayName,
    password: temporaryPassword,
    emailVerified: false,
    disabled: false,
  })
  try {
    await setAccountClaims(record.uid, {
      role: input.role,
      mustChangePassword: true,
    })
  } catch (error) {
    await deleteAccountForFailedCreate(record.uid)
    throw error
  }
  return { uid: record.uid, temporaryPassword }
}

/**
 * Remove an account THIS operation just created, because its required
 * initialization or its first audit write failed.
 *
 * ⚠️ THIS IS NOT A USER-DELETION FEATURE, and the name is deliberately unusable
 * as one. The module handoff forbids application account deletion; what it
 * permits is compensating cleanup of an orphan that exists only because a
 * multi-step create failed halfway. The distinction is the uid: it is one this
 * call site minted moments ago, never one a caller chose.
 *
 * Never throws. The caller is already unwinding a failure and must surface THAT
 * error, not this one — a compensation that masks the original cause turns a
 * diagnosable bug into a mystery. A failed compensation leaves an account with no
 * claims, which cannot sign in usefully (no role resolves to `user`, no
 * `mustChangePassword` set) and is visible in the directory; it is logged loudly
 * for exactly that reason.
 */
export async function deleteAccountForFailedCreate(uid: string): Promise<void> {
  try {
    await adminAuth().deleteUser(uid)
  } catch (error) {
    log.error('[account] failed to compensate a half-created account', {
      uid,
      error,
    })
  }
}

/** Update the display name. Email is IMMUTABLE in this module, by contract. */
export async function updateAccountProfile(
  uid: string,
  patch: { displayName: string },
): Promise<AccountSummary> {
  return toAccountSummary(
    await adminAuth().updateUser(uid, { displayName: patch.displayName }),
  )
}

/**
 * Move the account's role, through the one claims helper so `mustChangePassword`
 * and any project-added claim survive. Returns the account as it now stands.
 *
 * Re-reads rather than trusting the claims write's own return: `setAccountClaims`
 * knows what it stored, not what the record looks like afterwards, and the
 * caller audits the whole `after` state.
 */
export async function updateAccountRole(
  uid: string,
  role: Role,
): Promise<AccountSummary> {
  await setAccountClaims(uid, { role })
  return toAccountSummary(await adminAuth().getUser(uid))
}

/**
 * Set Firebase Auth's `disabled` flag — the ONE authority on whether an account
 * may sign in. There is deliberately no second Firestore `active` field to drift
 * from it.
 *
 * Setting the state it is already in is a successful no-op, not an error: the
 * caller still audits the result, so "the admin pressed disable on an already
 * disabled account" stays a recorded fact rather than a failure to explain.
 */
export async function setAccountDisabled(
  uid: string,
  disabled: boolean,
): Promise<AccountSummary> {
  return toAccountSummary(await adminAuth().updateUser(uid, { disabled }))
}

/**
 * Replace the password with a fresh temporary one and re-arm the mandatory
 * change. The role claim survives because the write goes through the merge
 * helper — a `setCustomUserClaims(uid, { mustChangePassword: true })` here would
 * demote the target to `user` as a side effect of resetting their password.
 *
 * The password is returned once and never persisted. It must not reach an audit
 * event, a log line, or a URL — see `temporary-password.ts`.
 */
export async function resetAccountPassword(
  uid: string,
): Promise<{ temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword()
  await adminAuth().updateUser(uid, { password: temporaryPassword })
  await setAccountClaims(uid, { mustChangePassword: true })
  return { temporaryPassword }
}

/**
 * Replace the password with one the ACCOUNT HOLDER chose, and clear the mandatory
 * -change requirement in the same call.
 *
 * ⚠️ THIS IS THE ONLY PLACE `mustChangePassword` IS EVER CLEARED, and the two
 * halves must stay in this function rather than becoming two exports. Split
 * them and the second one becomes a way to drop the requirement WITHOUT setting
 * a password — which is the whole bypass the mandatory-change flow exists to
 * prevent. There is deliberately no `clearMustChangePassword(uid)` here for an
 * action to reach for; the claim is cleared as a consequence of the password
 * actually changing, or not at all.
 *
 * `null` is the DELETE in `AccountClaimsPatch`'s convention, not `false` — see
 * `claims.ts`: `rbac.ts` reads the claim as `=== true`, so a stored `false`
 * would be a permanently meaningless key riding on every future token.
 *
 * The order is password FIRST, then claim. Reversed, a failed password write
 * would leave an account that has been released from the requirement while still
 * holding the temporary credential an administrator has seen. This way the worst
 * case is the opposite and it is safe: the password changed but the claim
 * survived, so the user is asked to change it again — annoying, never a hole.
 *
 * It does NOT authorize, audit, or revoke. Those are the caller's ordered
 * responsibilities, exactly as with every other mutation in this module.
 */
export async function changeAccountPassword(
  uid: string,
  newPassword: string,
): Promise<void> {
  await adminAuth().updateUser(uid, { password: newPassword })
  await setAccountClaims(uid, { mustChangePassword: null })
}

/**
 * Revoke every refresh token for `uid`, and return the marker cutoff Firebase's
 * own decision implies — `floor(tokensValidAfterTime / 1000) + 1`, computed with
 * the SAME `revocationCutoff` the marker uses, so the two enforcement points
 * cannot disagree by a second.
 *
 * Returns `null` when Firebase gives back no parseable `tokensValidAfterTime`.
 * The caller must treat that as "nothing to reconcile the marker WITH", never as
 * "reconcile it to zero": the marker is monotonic and a null must never lower it.
 *
 * The re-read is required — `revokeRefreshTokens` resolves with nothing, and the
 * cutoff it chose is only observable on the record afterwards.
 */
export async function revokeAccountRefreshTokens(
  uid: string,
): Promise<number | null> {
  const auth = adminAuth()
  await auth.revokeRefreshTokens(uid)
  const record = await auth.getUser(uid)
  const validAfterMs = Date.parse(record.tokensValidAfterTime ?? '')
  return Number.isNaN(validAfterMs) ? null : revocationCutoff(validAfterMs)
}
