/**
 * The pure half of a sequential human-readable code (`INV-0001`).
 *
 * No imports, same reason as `batch.ts` and `deadline.ts`: `lib/repos/*` reaches
 * `lib/firebase/admin` and the server credential boundary behind it, so a test
 * only gets there through the runner's scaffolding. The formatting is the part
 * with an off-by-one and an overflow in it, so it lives where a test can reach
 * it unconditionally; the transaction, which genuinely needs a database handle,
 * lives in `lib/repos/counter.repo.ts`.
 */

/** The counter infrastructure's private top-level Firestore collection. */
export const COUNTERS_COLLECTION = 'counters'

/**
 * The rendered form of counter `value`, e.g. `('INV-', 4, 1)` -> `INV-0001`.
 *
 * `width` is the ZERO-PADDING width, not a maximum. Past it the code simply gets
 * longer: `INV-9999` -> `INV-10000`. That is deliberate — the alternative is
 * throwing, or truncating to `INV-0000` and colliding with a code minted 10000
 * mints ago. A longer code sorts oddly in a spreadsheet; a duplicate code is a
 * corrupt ledger. This is also exactly why the width is stored ON the counter
 * document rather than passed per call: two call sites disagreeing about the
 * width of one sequence produces a bug that stays invisible until the sequence
 * crosses its first power of ten, long after either call site was written.
 */
export function formatCode(
  prefix: string,
  width: number,
  value: number,
): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `counter value must be a non-negative integer, got ${value}`,
    )
  }
  if (!Number.isInteger(width) || width < 1) {
    throw new RangeError(`counter width must be an integer >= 1, got ${width}`)
  }
  return `${prefix}${String(value).padStart(width, '0')}`
}
