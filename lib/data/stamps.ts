/**
 * The SERVER-OWNED fields every standard entity write sets, and nothing else.
 *
 * ── WHY THESE ARE SHARED AND THE TRANSACTION AROUND THEM IS NOT ──────────────
 * Every entity's `create` mints `id` + `createdAt` + `updatedAt`, and every
 * `update` re-stamps `updatedAt` over a merge. That literal was the copied part.
 * The transaction it sits inside was never the copied part: `createAsset` reads a
 * counter before it writes, `updateAsset` checks a precondition between the read
 * and the write, and both must stay visible in the feature file. So these are
 * PURE — they take values and return values, they never touch Firestore, open a
 * transaction, or decide anything — and the repo keeps calling `runTransaction`,
 * `tx.get` and `tx.set` itself.
 *
 * Dependency-free on purpose, for the reason `batch.ts` and `deadline.ts` already
 * state: a rule reachable only through the credential boundary is unfalsifiable.
 * These are the fields the whole data path agrees on, so a test must be able to
 * reach them with no emulator and no `server-only` stub.
 *
 * ── WHY `now` IS A PARAMETER AND NOT `new Date()` INSIDE ─────────────────────
 * Two reasons, both load-bearing. A caller writing several documents in one
 * transaction needs ONE instant across them, not N. And these values are RETURNED
 * to the caller and asserted by value against a pinned clock in the integration
 * suite — so the clock has to be injectable rather than captured.
 *
 * Deliberately a real `Date` and NOT `FieldValue.serverTimestamp()`: the repos
 * here return the object they wrote, a sentinel is not a `Date`, and it would
 * fail the entity schema on the way back out. The one module that does use a
 * server sentinel casts it away for exactly this reason; do not generalise one
 * convention over both.
 */

/**
 * The timestamps the server owns on every entity document. Named once and
 * derived from below rather than respelled per signature — two copies of a field
 * set are two places for it to drift, and this one is load-bearing on the read
 * path (the entity schemas parse it back).
 */
export interface ServerTimestamps {
  createdAt: Date
  updatedAt: Date
}

/** Everything the server owns on a NEWLY created document. */
export interface ServerCreatedFields extends ServerTimestamps {
  id: string
}

/**
 * What an UPDATE re-stamps. Derived with `Pick` rather than written out, so a
 * change to `ServerTimestamps` cannot leave the two halves disagreeing.
 */
export type ServerTouchedFields = Pick<ServerTimestamps, 'updatedAt'>

/**
 * The server-owned fields of a newly created document.
 *
 * `id` is passed in rather than generated here because the ref must be minted by
 * the caller — the document reference is what the transaction writes to, and
 * inventing an id here would leave the caller holding a different one.
 */
export function stampCreated<T extends object>(
  id: string,
  input: T,
  now: Date = new Date(),
): T & ServerCreatedFields {
  return { ...input, id, createdAt: now, updatedAt: now }
}

/**
 * The merge every standard update writes: current document, then the patch, then
 * a fresh `updatedAt`.
 *
 * A PLAIN SPREAD, and that is a decision rather than the obvious implementation.
 * It does NOT strip `undefined` from the patch, because a present-but-undefined
 * key is how this codebase CLEARS an optional field: the value travels as
 * `'' -> undefined`, overwrites the current value here, and is then dropped from
 * the stored document by the driver's ignore-undefined behaviour on a full
 * `set`. A "smarter" merge that filtered those keys out — or a caller that
 * switched to a partial/merge write — would silently turn every field-clearing
 * edit into a no-op, with nothing throwing and the UI reporting success.
 *
 * It also does not write, so a caller that must check a precondition between its
 * read and its write still has somewhere to put it.
 */
export function stampUpdated<T extends object, P extends object>(
  current: T,
  patch: P,
  now: Date = new Date(),
): T & P & ServerTouchedFields {
  return { ...current, ...patch, updatedAt: now }
}
