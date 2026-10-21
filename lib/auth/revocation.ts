import 'server-only'

/**
 * The server-owned half of session revocation: read the marker, and move it
 * forward. The arithmetic and the document shape live in the pure
 * `revocation.contract.ts`, which Firestore Rules and the client watcher answer
 * to as well; this module is only the Admin-SDK access.
 *
 * ONE writer, on purpose. Every account operation that must end a session —
 * role change, disable, admin password reset, explicit sign-out-everywhere —
 * calls `advanceRevokedAfterEpoch`. Nothing writes the marker with a bare
 * `set()`, because the marker is MONOTONIC: two operations racing with a blind
 * write would let the later-landing, earlier-cutoff one silently un-revoke
 * sessions the first had already killed.
 *
 * This is the Firestore-specific piece the PostgreSQL fork replaces (a row plus
 * a `GREATEST(...)` update); the contract module and every caller are shared.
 */
import { withDeadline } from '@/lib/data/deadline'
import { adminDb } from '@/lib/firebase/admin-db'
import { rawCollection, typedCollection } from '@/lib/firebase/collections'

import {
  AUTH_SESSIONS_COLLECTION,
  AuthSessionSchema,
  REVOKED_AFTER_EPOCH_FIELD,
  revocationCutoff,
} from './revocation.contract'

/** The typed marker collection — validated reads through the schema converter. */
const authSessionsCollection = () =>
  typedCollection(AUTH_SESSIONS_COLLECTION, AuthSessionSchema)

/**
 * What one marker read found. The three cases are kept apart because they mean
 * opposite things at the session boundary: `absent` is the normal state of an
 * account that has never been revoked and must NOT deny; `unreadable` is an
 * unanswered question and must fail CLOSED.
 */
export type MarkerRead =
  | { kind: 'absent' }
  | { kind: 'value'; epoch: number }
  | { kind: 'unreadable'; error: unknown }

/**
 * Read the marker for `uid`.
 *
 * Never throws — the session boundary calls this on every request, and an
 * exception there would surface as a 500 on an ordinary page load. The failure
 * is returned instead, so the caller decides (and it decides: deny).
 *
 * A schema-violating document lands in `unreadable` rather than `absent`: the
 * converter throws on it, and treating "the marker is corrupt" as "there is no
 * marker" would turn tampering into a bypass. So does an unreachable Firestore,
 * and that is deliberate too — see `getSession` for the availability trade.
 */
export async function readRevocationMarker(uid: string): Promise<MarkerRead> {
  try {
    const snap = await withDeadline(
      authSessionsCollection().doc(uid).get(),
      `read revocation marker for ${uid}`,
    )
    const data = snap.data()
    if (!data) return { kind: 'absent' }
    return { kind: 'value', epoch: data.revokedAfterEpoch }
  } catch (error) {
    return { kind: 'unreadable', error }
  }
}

/**
 * Move `uid`'s marker forward to at least `cutoff`, and return the value now
 * stored.
 *
 * A transaction, not a conditional write, because the read and the max must be
 * atomic: two concurrent revocations that both read `10` and write their own
 * cutoff would leave whichever landed last, which may be the LOWER one.
 *
 * Reads RAW rather than through the schema converter — the one place that is
 * correct. A corrupt marker is exactly the document most in need of being
 * overwritten with a valid cutoff, and a converted read would throw on it,
 * making a tampered account permanently un-revokable. An unusable existing value
 * is therefore treated as no floor at all; the write can only ever raise the
 * marker, so this cannot lower a valid one.
 */
export async function advanceRevokedAfterEpoch(
  uid: string,
  cutoff: number,
): Promise<number> {
  const ref = rawCollection(AUTH_SESSIONS_COLLECTION).doc(uid)
  return withDeadline(
    adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const existing = snap.get(REVOKED_AFTER_EPOCH_FIELD)
      const floor =
        typeof existing === 'number' &&
        Number.isInteger(existing) &&
        existing > 0
          ? existing
          : 0
      const next = Math.max(floor, cutoff)
      tx.set(ref, { [REVOKED_AFTER_EPOCH_FIELD]: next })
      return next
    }),
    `advance revocation marker for ${uid}`,
  )
}

/** Revoke every session for `uid` as of NOW. The one impure step lives here. */
export async function revokeSessionsNow(uid: string): Promise<number> {
  return advanceRevokedAfterEpoch(uid, revocationCutoff(Date.now()))
}
