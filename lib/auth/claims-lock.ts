import 'server-only'

/**
 * A per-UID Firestore lease that serializes EVERY custom-claim read-modify-write
 * for one account, across processes.
 *
 * ── WHY IT EXISTS: THE LEASE ALONE DID NOT CLOSE THE RACE ────────────────────
 * `setCustomUserClaims` is a REPLACE, and `setAccountClaims` reads-merges-writes
 * to keep unrelated claims. `admin-lease.ts` serializes the two operations that
 * can strip authority — role demotion and disablement — against EACH OTHER. But
 * promotion, admin password reset, and the user's own password change also write
 * claims and do NOT take that lease, so a concurrent one can clobber a demotion:
 * a reset reads `{role:admin}` before the demote commits, and its merge-write
 * lands `{role:admin, …}` on top — the demoted admin is silently restored. The
 * admin-lease gives no protection against a writer that skips it.
 *
 * The fix is to serialize the claims WRITE ITSELF, per uid, so it does not matter
 * which action calls it: every writer goes through `setAccountClaims`, and
 * `setAccountClaims` holds this lease across its whole read-merge-write.
 *
 * ── WHY PER-UID AND FIRESTORE, NOT GLOBAL OR IN-PROCESS ──────────────────────
 * Per-uid because the clobber is on ONE account's claims bag — a global lock
 * would needlessly serialize unrelated accounts, including a user's own password
 * change behind an admin op. Firestore rather than an in-process mutex for the
 * same reason `admin-lease` is Firestore-backed: Firebase Auth offers no
 * compare-and-set on claims, so the only cross-process serialization available is
 * an external lock, and an in-process one would be a weaker guarantee than the
 * lease beside it already holds.
 *
 * ── WHAT IT CANNOT DO, STATED SO NOBODY CLAIMS OTHERWISE ─────────────────────
 * It bounds writers that go through THIS application. It cannot make a Firebase
 * Console change, a `gcloud` call, or another Admin-SDK process atomic with
 * anything here — exactly the residual `admin-lease` declares. The PostgreSQL
 * fork replaces this with a per-key advisory lock; the caller is shared.
 *
 * ── RELATION TO admin-lease ──────────────────────────────────────────────────
 * Same generation+TTL shape, deliberately a separate module: this one is keyed by
 * uid and WAITS briefly for a contended lock (concurrent claim writers should
 * serialize, not fail), where `admin-lease` is a single global lock that REFUSES
 * (an admin mid-operation is a "try again" the caller surfaces). Two different
 * locks, not one duplicated. If a THIRD keyed lease appears, extract the generic
 * primitive both can build on rather than adding a fourth copy of this shape.
 */
import * as z from 'zod'

import { withDeadline } from '@/lib/data/deadline'
import { adminDb } from '@/lib/firebase/admin-db'
import { rawCollection } from '@/lib/firebase/collections'

/** One document per account, keyed by uid. Server-only: no client rule grants it. */
export const CLAIMS_LOCKS_COLLECTION = 'claimsLocks'

/**
 * How long a lease is honored. Short — it bounds how long a crashed process can
 * block the next claim writer, and the critical section it guards is two Auth
 * calls (`getUser` + `setCustomUserClaims`). The read-merge-write must finish
 * inside this, which `assertClaimsLeaseHeld` proves before the write.
 */
export const CLAIMS_LEASE_TTL_MS = 15_000

/**
 * How long a contended acquire waits before giving up. Bounded well BELOW the TTL
 * so a caller waiting on a live writer returns quickly once that writer releases;
 * a crashed holder is not waited out here (its TTL clears it for a LATER request
 * instead of hanging this one). Same-uid contention is rare — two admins acting
 * on one account at once, or an admin and that user's own password change.
 */
const ACQUIRE_MAX_WAIT_MS = 4_000

/** Poll interval while waiting for a contended lock. */
const ACQUIRE_POLL_MS = 50

const LeaseDocSchema = z.object({
  ownerOperationId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative(),
})

/** Proof of holding the lease for one uid. Opaque except as a token to re-check. */
export interface ClaimsLease {
  uid: string
  ownerOperationId: string
  generation: number
  expiresAtMs: number
}

/** Thrown when a contended lock could not be acquired within the wait bound. */
export class ClaimsLockContendedError extends Error {
  constructor(uid: string) {
    super(
      `claims lease for ${uid} was contended beyond ${ACQUIRE_MAX_WAIT_MS}ms`,
    )
    this.name = 'ClaimsLockContendedError'
  }
}

/** Thrown when the lease is no longer held — the caller must NOT keep writing. */
export class ClaimsLeaseLostError extends Error {
  constructor(uid: string, detail: string) {
    super(`claims lease for ${uid} lost: ${detail}`)
    this.name = 'ClaimsLeaseLostError'
  }
}

const lockRef = (uid: string) => rawCollection(CLAIMS_LOCKS_COLLECTION).doc(uid)

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * One acquire attempt. Returns the lease, or null if another operation holds an
 * unexpired one. Reads RAW: a corrupt lock document is treated as no lease, so a
 * single bad write cannot lock an account's claims permanently — acquiring always
 * writes a fresh, valid document.
 */
async function tryAcquire(
  uid: string,
  operationId: string,
  nowMs: number,
): Promise<ClaimsLease | null> {
  return withDeadline(
    adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(lockRef(uid))
      const held = LeaseDocSchema.safeParse(snap.data())

      if (
        held.success &&
        held.data.expiresAtMs > nowMs &&
        held.data.ownerOperationId !== operationId
      ) {
        return null
      }

      const lease: ClaimsLease = {
        uid,
        ownerOperationId: operationId,
        // Monotonic across acquires, INCLUDING takeover of an expired lease — how
        // a previous holder's `assertClaimsLeaseHeld` learns it was superseded.
        generation: (held.success ? held.data.generation : 0) + 1,
        expiresAtMs: nowMs + CLAIMS_LEASE_TTL_MS,
      }
      tx.set(lockRef(uid), {
        ownerOperationId: lease.ownerOperationId,
        generation: lease.generation,
        expiresAtMs: lease.expiresAtMs,
      })
      return lease
    }),
    'acquire claims lease',
  )
}

/**
 * Re-assert the lease before the external write. Throws `ClaimsLeaseLostError`
 * rather than returning false — the only correct response to a lost lease is to
 * stop. Checking the GENERATION distinguishes "I still hold it" from "it expired,
 * someone else took it": if the process stalled past the TTL between acquiring and
 * writing, a second writer may hold the lock, and writing now would be the very
 * clobber this module prevents.
 */
export async function assertClaimsLeaseHeld(
  lease: ClaimsLease,
  nowMs: number = Date.now(),
): Promise<void> {
  if (lease.expiresAtMs <= nowMs) {
    throw new ClaimsLeaseLostError(
      lease.uid,
      'the local lease deadline has passed',
    )
  }
  const snap = await withDeadline(lockRef(lease.uid).get(), 'read claims lease')
  const held = LeaseDocSchema.safeParse(snap.data())
  if (!held.success) {
    throw new ClaimsLeaseLostError(
      lease.uid,
      'the lock document is missing or unreadable',
    )
  }
  if (held.data.generation !== lease.generation) {
    throw new ClaimsLeaseLostError(
      lease.uid,
      `superseded by generation ${held.data.generation} (held ${lease.generation})`,
    )
  }
  if (held.data.ownerOperationId !== lease.ownerOperationId) {
    throw new ClaimsLeaseLostError(lease.uid, 'owned by another operation')
  }
}

/**
 * Release the lease, if this operation still holds it. Deletes rather than
 * expiring in place so the next writer does not wait out the TTL. Guarded on the
 * generation and owner: releasing a lease already taken over would unlock someone
 * else's live write. Never throws — a release failure leaves a lease that simply
 * expires, which is what the TTL is for.
 */
async function release(lease: ClaimsLease): Promise<void> {
  try {
    await withDeadline(
      adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(lockRef(lease.uid))
        const held = LeaseDocSchema.safeParse(snap.data())
        if (!held.success) return
        if (held.data.generation !== lease.generation) return
        if (held.data.ownerOperationId !== lease.ownerOperationId) return
        tx.delete(lockRef(lease.uid))
      }),
      'release claims lease',
    )
  } catch {
    // Intentionally swallowed — the TTL is the backstop.
  }
}

/**
 * Run `operation` while holding the per-uid claims lease, waiting briefly for a
 * contended lock and releasing whatever happens. `operation` receives the lease
 * so it can `assertClaimsLeaseHeld` immediately before its external write.
 *
 * Throws `ClaimsLockContendedError` if the lock stays held past the wait bound —
 * the caller surfaces it as a "try again" rather than clobbering.
 */
export async function withClaimsLease<T>(
  uid: string,
  operation: (lease: ClaimsLease) => Promise<T>,
): Promise<T> {
  const operationId = crypto.randomUUID()
  const deadlineMs = Date.now() + ACQUIRE_MAX_WAIT_MS

  let lease = await tryAcquire(uid, operationId, Date.now())
  while (!lease) {
    if (Date.now() >= deadlineMs) throw new ClaimsLockContendedError(uid)
    await delay(ACQUIRE_POLL_MS)
    lease = await tryAcquire(uid, operationId, Date.now())
  }

  try {
    return await operation(lease)
  } finally {
    await release(lease)
  }
}
