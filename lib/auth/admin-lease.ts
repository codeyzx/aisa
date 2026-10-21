import 'server-only'

/**
 * A short, expiring Firestore lease that serializes the account mutations which
 * can REMOVE administrator capability — role demotion and account disablement.
 *
 * ── WHAT IT ACTUALLY PREVENTS ────────────────────────────────────────────────
 * Two administrators demote each other at the same moment. Each re-reads the
 * directory, each sees two admins, each concludes its own demotion is safe, and
 * the application is left with none. A live count is not enough on its own,
 * because the count and the mutation are not atomic — the lease is what makes
 * "count, then mutate" one operation with respect to OTHER IN-APP operations.
 *
 * ── WHAT IT CANNOT PREVENT, STATED SO NOBODY CLAIMS OTHERWISE ────────────────
 * It bounds operations initiated by THIS application. It cannot make a Firebase
 * Console change, a `gcloud` call, or another Admin-SDK process atomic with
 * anything here — there is no cross-system transaction to hold, and a lease that
 * implied one would be worse than none. That residual risk is declared in the
 * module handoff and must stay in the completion report.
 *
 * ── WHY EXPIRY, AND WHY A GENERATION ─────────────────────────────────────────
 * A process can die mid-operation holding the lease. Without expiry, one crash
 * locks out every future admin mutation with no unlock action a UI could offer.
 * With expiry alone, a stalled operation that wakes up after its lease lapsed
 * would resume mutating while a SECOND operation legitimately holds the lock.
 * The generation counter is what closes that: it increments on every acquire, so
 * a stale holder can prove it is stale rather than guess from a clock.
 *
 * The PostgreSQL fork replaces this whole module with an advisory lock; the
 * callers and the operation envelope are shared.
 */
import * as z from 'zod'

import { withDeadline } from '@/lib/data/deadline'
import { adminDb } from '@/lib/firebase/admin-db'
import { rawCollection } from '@/lib/firebase/collections'

/**
 * One document, one lock. Server-only: no client rule grants it anything.
 *
 * Exported so the integration suite addresses the SAME document this module
 * does. A second spelling in the test would still pass on the day the lock
 * moved — it would create and assert its own document while the production
 * lease used another, and the suite would go on reporting that mutual
 * exclusion works.
 */
export const ADMIN_LOCKS_COLLECTION = 'adminLocks'
export const ACCOUNT_MUTATION_LOCK = 'accountMutation'

/**
 * How long a lease is honored. Deliberately SHORT — it bounds how long a crashed
 * process can block the next administrator, and every operation it guards is a
 * handful of Auth and Firestore calls.
 *
 * The operation lifetime must stay BELOW this (`isLeaseExpiring` is how a caller
 * checks), so an operation that overruns reports
 * `lease_expired_reconciliation_required` rather than mutating outside its lock.
 */
export const ADMIN_LEASE_TTL_MS = 15_000

const LeaseDocSchema = z.object({
  ownerOperationId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative(),
})

/** Proof of holding the lease. Opaque to callers except as a token to re-check. */
export interface AdminLease {
  ownerOperationId: string
  generation: number
  expiresAtMs: number
}

/** Thrown when a lease is no longer held — the caller must NOT keep mutating. */
export class LeaseLostError extends Error {
  readonly code = 'lease_expired_reconciliation_required'

  constructor(detail: string) {
    super(`admin mutation lease lost: ${detail}`)
    this.name = 'LeaseLostError'
  }
}

const lockRef = () =>
  rawCollection(ADMIN_LOCKS_COLLECTION).doc(ACCOUNT_MUTATION_LOCK)

/**
 * Acquire the lease for `operationId`, or return null if another operation holds
 * an unexpired one.
 *
 * Reads RAW rather than through a converter, for the same reason
 * `advanceRevokedAfterEpoch` does: a corrupt lock document is exactly the one
 * that must remain acquirable, or a single bad write locks out administration
 * permanently. An unparseable document is treated as no lease at all — safe,
 * because acquiring always writes a fresh, valid one.
 *
 * `nowMs` is a parameter so expiry is testable without sleeping.
 */
export async function acquireAdminLease(
  operationId: string,
  nowMs: number = Date.now(),
): Promise<AdminLease | null> {
  return withDeadline(
    adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(lockRef())
      const held = LeaseDocSchema.safeParse(snap.data())

      if (
        held.success &&
        held.data.expiresAtMs > nowMs &&
        held.data.ownerOperationId !== operationId
      ) {
        return null
      }

      const lease: AdminLease = {
        ownerOperationId: operationId,
        // Monotonic across acquires, INCLUDING a takeover of an expired lease —
        // that is what lets the previous holder recognise it has been replaced.
        generation: (held.success ? held.data.generation : 0) + 1,
        expiresAtMs: nowMs + ADMIN_LEASE_TTL_MS,
      }
      tx.set(lockRef(), lease)
      return lease
    }),
    'acquire admin mutation lease',
  )
}

/**
 * Re-assert the lease immediately before and after every external mutation.
 *
 * Throws `LeaseLostError` rather than returning false, because the only correct
 * response is to stop: a caller that could ignore a boolean is a caller that
 * will. Checking the GENERATION as well as the owner is what distinguishes "I
 * still hold it" from "it expired, someone else took it, and my own
 * operationId happens to be back on the document after a retry".
 */
export async function assertLeaseHeld(
  lease: AdminLease,
  nowMs: number = Date.now(),
): Promise<void> {
  if (lease.expiresAtMs <= nowMs) {
    throw new LeaseLostError('the local lease deadline has already passed')
  }
  const snap = await withDeadline(lockRef().get(), 'read admin mutation lease')
  const held = LeaseDocSchema.safeParse(snap.data())
  if (!held.success) {
    throw new LeaseLostError('the lock document is missing or unreadable')
  }
  if (held.data.generation !== lease.generation) {
    throw new LeaseLostError(
      `superseded by generation ${held.data.generation} (held ${lease.generation})`,
    )
  }
  if (held.data.ownerOperationId !== lease.ownerOperationId) {
    throw new LeaseLostError('owned by another operation')
  }
}

/**
 * Release the lease, if this operation still holds it.
 *
 * Deliberately DELETES rather than expiring in place, so the next administrator
 * does not wait out a TTL for a lock nobody holds. Guarded on the generation:
 * releasing a lease that has already been taken over would unlock someone else's
 * live operation.
 *
 * Never throws. A release failure leaves a lease that simply expires on its own,
 * which is the whole point of having a TTL — turning it into an error would make
 * a successful mutation report failure.
 */
export async function releaseAdminLease(lease: AdminLease): Promise<void> {
  try {
    await withDeadline(
      adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(lockRef())
        const held = LeaseDocSchema.safeParse(snap.data())
        if (!held.success) return
        if (held.data.generation !== lease.generation) return
        if (held.data.ownerOperationId !== lease.ownerOperationId) return
        tx.delete(lockRef())
      }),
      'release admin mutation lease',
    )
  } catch {
    // Intentionally swallowed — see the docblock. The TTL is the backstop.
  }
}

/**
 * Run `operation` under the lease, releasing it whatever happens.
 *
 * Returns null when the lease could not be acquired, so the caller can report a
 * typed "another administrator is mid-operation" rather than queueing behind it.
 * The `lease` is handed to the operation precisely so it can `assertLeaseHeld`
 * around each external call — holding a lease is not the same as still holding
 * it three network round trips later.
 */
export async function withAdminLease<T>(
  operationId: string,
  operation: (lease: AdminLease) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const lease = await acquireAdminLease(operationId)
  if (!lease) return { acquired: false }
  try {
    return { acquired: true, value: await operation(lease) }
  } finally {
    await releaseAdminLease(lease)
  }
}
