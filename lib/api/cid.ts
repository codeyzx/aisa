/**
 * The envelope owns the correlation ID: every `ApiResponse` carries one, every
 * route echoes it on `x-correlation-id`, and `lib/log` binds the same value.
 * Nothing else in the codebase may mint a parallel request identifier.
 *
 * This module uses the builtin `crypto.randomUUID`, so it needs no dependency.
 */

/** The wire header. Lower-case because `Headers.get` is case-insensitive but the value we SET should be canonical. */
export const CORRELATION_ID_HEADER = 'x-correlation-id'

/** Max accepted length of an inbound cid. A UUID is 36; this leaves room for a caller's own scheme without letting it grow unbounded. */
const MAX_CORRELATION_ID_LENGTH = 128

/** Conservative charset: what survives a log line, a URL, and a header without quoting. */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export function newCorrelationId(): string {
  return crypto.randomUUID()
}

/**
 * True when `value` is safe to adopt as a cid.
 *
 * An inbound cid is UNTRUSTED input that lands straight in log lines, so it is
 * validated rather than trusted: an attacker-supplied newline would forge log
 * entries, and an unbounded string would bloat every record of the request.
 */
export function isCorrelationId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_CORRELATION_ID_LENGTH &&
    CORRELATION_ID_PATTERN.test(value)
  )
}

/**
 * The cid for this request: adopt the caller's if it is well-formed, else mint
 * one. Adopting is what stitches a client-side trace to its server-side half —
 * `apiFetch` always sends one, so a same-app call keeps a single id end to end.
 * A malformed one is REPLACED, never rejected: a bad trace header must not fail
 * an otherwise valid request.
 */
export function resolveCorrelationId(request: Request): string {
  const inbound = request.headers.get(CORRELATION_ID_HEADER)?.trim()
  return inbound && isCorrelationId(inbound) ? inbound : newCorrelationId()
}
