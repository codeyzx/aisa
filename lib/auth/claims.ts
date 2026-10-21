import 'server-only'

/**
 * The ONE writer of Firebase custom claims.
 *
 * ── WHY IT EXISTS: `setCustomUserClaims` IS A REPLACE, NOT A PATCH ────────────
 * The Admin SDK's `setCustomUserClaims(uid, claims)` overwrites the WHOLE claims
 * object. So the natural-looking call at a role-change site —
 * `setCustomUserClaims(uid, { role })` — silently deletes `mustChangePassword`,
 * and a password-state site's `setCustomUserClaims(uid, { mustChangePassword })`
 * silently deletes `role`, which `roleFromClaims` then resolves to `user`. Both
 * typecheck, both succeed, and both are only visible on the target's NEXT sign-in
 * — an admin quietly demoted, or a temporary password quietly made permanent.
 *
 * Nothing else in this repo may call `setCustomUserClaims`. `rg setCustomUserClaims`
 * is the audit: the only other hit is `scripts/seed-emulator.ts`, which writes a
 * brand-new account's first claims (there is nothing to preserve) and cannot
 * import this module anyway — it deliberately avoids the server-only Firebase
 * layer, as its own header explains.
 *
 * ── HOW THE READ-MODIFY-WRITE IS MADE SAFE ───────────────────────────────────
 * Firebase Auth offers no compare-and-set on claims, so this read-modify-write is
 * not atomic on its own: two concurrent writers can lose one another's patch, and
 * `admin-lease.ts` did NOT close this — it serializes demotion and disablement
 * against each other, but promotion, password reset, and the user's own password
 * change write claims WITHOUT that lease, so one could clobber a demotion. So
 * `setAccountClaims` holds a PER-UID lease (`claims-lock.ts`) across its whole
 * read-merge-write: the live read, the merge, and the write all happen while this
 * operation exclusively owns the uid's claims, and every writer inherits it by
 * going through this one function. Do not add a second claims writer that skips
 * `setAccountClaims`.
 */
import { adminAuth } from '@/lib/firebase/admin-auth'

import { assertClaimsLeaseHeld, withClaimsLease } from './claims-lock'
import type { Role } from './rbac'

/**
 * A claims change, expressed as a PATCH over whatever the account already has.
 *
 * THE DELETION CONVENTION, and it is the one thing to get right here:
 *
 *  - a key that is ABSENT (or `undefined`) is LEFT ALONE;
 *  - `null` DELETES the claim;
 *  - any other value SETS it.
 *
 * `null` rather than `undefined` for deletion because `{ mustChangePassword: undefined }`
 * and `{}` are indistinguishable to `Object.entries`, and to most readers — a
 * deletion that can be produced by an accidental `undefined` is a deletion that
 * will happen by accident. `null` cannot be produced by forgetting a value.
 *
 * `mustChangePassword` is `true | null` and NOT `boolean`: `rbac.ts` reads it as
 * `=== true`, so storing `false` would mean carrying a permanently meaningless
 * key on every future token. Clearing the requirement is a DELETE.
 */
export interface AccountClaimsPatch {
  role?: Role
  mustChangePassword?: true | null
}

/**
 * Apply `patch` over `existing` and return the claims bag to store.
 *
 * Pure, and separated from the I/O on purpose: the merge is the whole invariant
 * this module exists for, and keeping it callable with no Firebase handle is what
 * lets a unit test prove "a role update preserves `mustChangePassword`" without
 * an emulator. Unrelated claims a project has added ride through untouched — the
 * patch names only the keys it changes.
 */
export function mergeAccountClaims(
  existing: Record<string, unknown> | undefined,
  patch: AccountClaimsPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key]
    } else if (value !== undefined) {
      next[key] = value
    }
  }
  return next
}

/**
 * Read the target's live claims, merge `patch` over them, and store the result.
 * Returns the stored bag so a caller can audit or assert on what actually landed.
 *
 * The read is LIVE every time — never a bag the caller happened to be holding.
 * A caller's copy can be seconds old, and applying a patch over a stale bag
 * re-writes whatever changed in between, which is the same silent clobber the
 * whole module exists to prevent.
 *
 * The read AND the write happen under the per-uid claims lease, so a concurrent
 * writer for the same account cannot read the bag between this read and this
 * write. `assertClaimsLeaseHeld` re-checks ownership immediately before the
 * external write, so a stall past the lease TTL aborts rather than clobbers.
 */
export async function setAccountClaims(
  uid: string,
  patch: AccountClaimsPatch,
): Promise<Record<string, unknown>> {
  return withClaimsLease(uid, async (lease) => {
    const auth = adminAuth()
    const record = await auth.getUser(uid)
    const next = mergeAccountClaims(record.customClaims, patch)
    await assertClaimsLeaseHeld(lease)
    await auth.setCustomUserClaims(uid, next)
    return next
  })
}
