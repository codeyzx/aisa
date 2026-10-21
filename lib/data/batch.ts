/**
 * Firestore's write-batching arithmetic, kept apart from Firestore.
 *
 * No imports — not even `server-only`, not even a firebase type. That is the
 * whole reason this file exists: `lib/repos/*` reaches `lib/firebase/admin` and
 * the server credential boundary behind it, which a unit test can only cross
 * because vitest stubs `server-only` and supplies a public env fixture. A
 * constant that is only reachable through that scaffolding is one config change
 * away from being unfalsifiable — and the cap below is a hard external limit
 * that fails at RUNTIME, on a destructive operation, if it is ever wrong.
 *
 * So the number and the chunking live where a test can reach them, and the repo
 * keeps only the part that genuinely needs a database handle.
 *
 * WHAT IS NOT CLAIMED: that both are called. `FIRESTORE_BATCH_LIMIT` is —
 * `deleteAssets` refuses more ids than it allows — but `chunk` has NO production
 * caller today, because the reference feature caps its bulk delete at the batch
 * limit and commits once rather than splitting. It is kept because it is the
 * piece a fork needs the moment it raises that cap, which is the one change that
 * turns a single commit into several, and writing it under time pressure is how
 * the off-by-one below ships. Delete it if your fork will never raise the cap.
 */

/**
 * Firestore's hard cap on writes in a single `WriteBatch`.
 *
 * NOT a tuning knob. Exceed it and `commit()` throws — there is no degraded
 * mode, and on a bulk delete that means the reader is told the operation failed
 * after some chunks already landed. `runTransaction` is no escape: transactions
 * carry the same cap.
 */
export const FIRESTORE_BATCH_LIMIT = 500

/**
 * Split `items` into runs of at most `size`.
 *
 * Pure, and separate from the write loop for the usual reason: this is the
 * off-by-one-shaped part. A `<=` where `<` belongs silently drops the last
 * element of every chunk, and on a delete that reads as "some rows just would
 * not go away" rather than as an error.
 *
 * An empty input yields no chunks, so a caller loops zero times rather than
 * committing an empty batch.
 *
 * `size` must be a finite positive INTEGER, and that is checked rather than
 * assumed: a bare `size < 1` lets `NaN` through (`NaN < 1` is `false`), and a
 * `NaN` step makes `start += size` never advance past 0, so the loop condition
 * fails immediately and the function returns `[]` — no chunks, no error, and on
 * a bulk delete the whole operation is silently dropped. A fractional size is
 * rejected for the same reason it is nonsense here: you cannot commit 2.5 writes.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunk size must be a positive integer, got ${size}`)
  }
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}
