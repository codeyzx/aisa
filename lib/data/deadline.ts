/**
 * A wall-clock bound on a Firestore write, kept apart from Firestore.
 *
 * No imports, for the same reason `lib/data/batch.ts` has none: `lib/repos/*`
 * reaches `lib/firebase/admin` and the server credential boundary behind it, so
 * a test only gets there through the runner's `server-only` stub and public env
 * fixture. A timeout constant living in a repo is unfalsifiable — the same trap
 * `batch.ts`'s header describes, where a BATCH_LIMIT in the repo passes every
 * gate and throws at runtime, mid-delete. So the number and the race live here;
 * the repo keeps only the part that genuinely needs a database handle.
 *
 * ⚠️ WHAT THIS DOES NOT DO: it bounds the AWAIT, not the WRITE. There is no
 * cancellation in the Firestore SDK — a write that loses the race may still land
 * afterwards, and nothing here can stop it. That is acceptable for the writes
 * this guards because every one of them is an idempotent `set`/`delete` keyed on
 * an id the server already chose: landing late is indistinguishable from landing
 * on time. Do NOT read this as cancellation, and do NOT wrap a non-idempotent
 * accumulating write (an increment, an array-union) in it — for those, a late
 * landing after the caller was told "timed out" is a double-apply.
 *
 * A deadline is NOT a retry, and the two are deliberately different concerns. The
 * Admin SDK already retries `runTransaction` attempts (default 5, unconfigured
 * here) — but an attempt count is not a wall-clock bound, and 5 slow attempts
 * take unboundedly long. A retry re-runs a call that had no retry of its own;
 * this deadline bounds every write, retried or not.
 */

/**
 * How long any single Firestore write may take before it is reported as failed.
 *
 * A tuning knob, unlike `FIRESTORE_BATCH_LIMIT` — but a load-bearing one, which
 * is why it lives where a test can reach it. It is the promise made to a user
 * watching a spinner: past this, they are told the truth instead of waiting for
 * the SDK's own (much longer, and undocumented) internal timeout.
 *
 * 10s is chosen to sit ABOVE Firestore's normal p99 write latency by a wide
 * margin — this must fire on a database that is not answering, never on one that
 * is merely slow. A deadline that trips under ordinary contention converts a
 * slow write into a failed one and is worse than none.
 */
export const FIRESTORE_WRITE_TIMEOUT_MS = 10_000

/**
 * Thrown when a write outlives its deadline.
 *
 * `code` is `'deadline-exceeded'` — the Firebase string code, NOT a new one.
 * That is the whole seam: `lib/api/errors.normalize.ts:FIREBASE_ERROR_CODES` already maps
 * that exact string to the `DEADLINE_EXCEEDED` taxonomy code (and its 504), so a
 * timeout raised here normalises identically to one raised by the SDK itself. A
 * bespoke code would have meant teaching the taxonomy a second word for a thing
 * it already names — the parallel-taxonomy trap, in miniature.
 */
export class DeadlineExceededError extends Error {
  /** The Firebase string code `normalizeError` already understands. */
  readonly code = 'deadline-exceeded'

  constructor(label: string, timeoutMs: number) {
    super(`${label} did not complete within ${timeoutMs}ms`)
    this.name = 'DeadlineExceededError'
  }
}

/**
 * Reject with `DeadlineExceededError` if `operation` has not settled in
 * `timeoutMs`.
 *
 * `label` names the call site and is the only thing that makes a timeout
 * actionable in a log — "a write timed out" is not a bug report.
 *
 * The timer is always cleared, including on the success path. Without that, an
 * unref'd `setTimeout` per write keeps the Node event loop alive for the full
 * timeout after the work is done, which turns a fast script into one that hangs
 * for 10s at exit and reads as "the migration froze at the end".
 *
 * `timerFn` exists so a test can drive this without waiting real seconds — the
 * same injectable-clock reason a retry helper would take an injectable `sleepFn`.
 * A timeout you can only test by sleeping is a timeout nobody tests.
 */
export function withDeadline<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs: number = FIRESTORE_WRITE_TIMEOUT_MS,
  timerFn: typeof setTimeout = setTimeout,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = timerFn(() => {
      reject(new DeadlineExceededError(label, timeoutMs))
    }, timeoutMs)
  })

  // `race` attaches a handler to BOTH promises, so whichever loses is still
  // "handled" — a rejection arriving after the race settles cannot surface as an
  // unhandled rejection and crash the process.
  return Promise.race([operation, deadline]).finally(() => {
    clearTimeout(timer)
  })
}
