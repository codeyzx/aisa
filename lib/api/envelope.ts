import {
  API_ERROR_CODES,
  type ApiError,
  type ApiErrorCode,
} from './errors.contract'

/**
 * The HTTP response envelope — the wire shape every route handler answers
 * with and every `apiFetch` caller receives.
 *
 * NOT a second `ActionResult`. `ActionResult` (lib/data/action-result.ts) is the
 * RSC-boundary contract for server actions; this is the HTTP-boundary contract
 * for route handlers. See docs/reference/contracts/http-api.md for where the line falls — the
 * short version is that this one carries a status code and a cid because a
 * `fetch` caller and a log reader need them, and a server action has neither.
 *
 * Pure data: this module builds and inspects envelopes. It never touches
 * `Response` (that is response.ts) and never touches `fetch` (that is client.ts),
 * which is what lets it be used on both sides of the wire.
 */

export interface ApiSuccess<T> {
  ok: true
  cid: string
  data: T
}

export interface ApiFailure {
  ok: false
  cid: string
  error: ApiError
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

/**
 * Build a success envelope. `data` is always present — a no-content success
 * passes `null` rather than growing an overload for the void case.
 */
export function ok<T>(cid: string, data: T): ApiSuccess<T> {
  return { ok: true, cid, data }
}

/** Build a failure envelope around an already-normalised `ApiError`. */
export function fail(cid: string, error: ApiError): ApiFailure {
  return { ok: false, cid, error }
}

/**
 * Thrown by `unwrap`. Carries the `code` and `cid` so a caller can branch on the
 * former and quote the latter in a bug report — a bare `Error(message)` would
 * throw both away, which is most of what the envelope is for.
 */
export class ApiCallError extends Error {
  readonly code: ApiErrorCode
  readonly cid: string
  readonly details: unknown

  constructor(error: ApiError, cid: string) {
    super(error.message)
    this.name = 'ApiCallError'
    this.code = error.code
    this.cid = cid
    this.details = error.details
  }
}

/**
 * Structural check that an unknown JSON body is one of our envelopes.
 *
 * Needed because a response can come from something that is not our route at all
 * — a proxy's HTML 502, a CDN error page — and the client must not read `.data`
 * off it. Checks the discriminant and the cid only; the payload beyond that is
 * the route's own contract, validated by the caller if it cares.
 */
export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as {
    ok?: unknown
    cid?: unknown
    error?: unknown
    data?: unknown
  }
  if (typeof candidate.cid !== 'string') return false
  // `data` must be PRESENT, not merely truthy — `ok()` always sets it (null for
  // a no-content success), so its absence means this is not our envelope.
  // Checking only `ok === true` would pass `{ ok: true, cid }` straight through
  // and hand the caller `undefined` as if it were the payload, which is the one
  // thing this guard exists to prevent.
  if (candidate.ok === true) return 'data' in candidate
  if (candidate.ok !== false) return false
  // A failure envelope must carry a REAL error, not just an object. `{ ok:false,
  // cid, error:{} }` would otherwise pass — `error` is an object, non-null —
  // and then `unwrap` built an `ApiCallError` whose `.code` was `undefined` and
  // whose `.message` was empty, a "failure" a caller cannot branch on or quote.
  // So validate the payload the caller will actually read: a `code` from the
  // closed taxonomy and a non-empty `message`. Anything short of that is not our
  // contract and is rejected here, exactly like a foreign body.
  const error = candidate.error as { code?: unknown; message?: unknown } | null
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof error.code === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(error.code) &&
    typeof error.message === 'string' &&
    error.message.length > 0
  )
}

/**
 * Return `data` on success, THROW `ApiCallError` on failure.
 *
 * For callers whose control flow is exception-based and who would otherwise
 * hand-roll the same `if (!res.ok) throw` — a TanStack Query `queryFn` /
 * `mutationFn` being the canonical one, since Query decides loading/error state
 * from a thrown rejection.
 *
 * MUST NOT be used to make a route's failure "disappear" at a call site that has
 * no error boundary above it: that converts a handled failure into an unhandled
 * rejection. If you have somewhere to show the error, branch on the envelope.
 */
export function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.ok) throw new ApiCallError(response.error, response.cid)
  return response.data
}
