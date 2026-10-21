/**
 * The WIRE contract of the HTTP API's error taxonomy: the closed list of codes,
 * the ONE user-safe message per code, the ONE HTTP status per code, and the
 * builder that pairs a code with its message. Pure and provider-agnostic — it
 * knows nothing about Firebase, gRPC, Zod, or `Response`. Turning a raw throw
 * INTO this taxonomy is the separate job of `errors.normalize.ts`.
 *
 * Keeping the wire shape here, free of any provider import, is what lets a client
 * (or a fork on a different backend) depend on the codes/messages/statuses without
 * dragging the server-side normalizer — and its Firebase/gRPC knowledge — along.
 */

/**
 * Every error this API can report. Deliberately closed and deliberately small:
 * a code is a CONTRACT with clients, so adding one is a contract change.
 * Modelled on the gRPC/Firestore status names the Firebase SDKs already speak,
 * so the normalizer's mapping is a rename rather than a re-interpretation.
 */
export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'RESOURCE_EXHAUSTED',
  'DEADLINE_EXCEEDED',
  'UNAVAILABLE',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/**
 * The serialized error inside a failure envelope.
 *
 * `details` is OPTIONAL and CALLER-CHOSEN — see `API_ERROR_MESSAGE` for why
 * nothing puts a raw error in here.
 */
export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: unknown
}

/**
 * The single user-safe message per code.
 *
 * Messages are derived from the code and NEVER from the thrown error. This is
 * the same call `runAction` makes ("Something went wrong" for any unhandled
 * throw) and the same one `app/api/storage/upload-url` makes: an exception
 * message can carry a document path, a query shape, or a bucket name, and the
 * client is not entitled to any of it. The raw error goes to the server log,
 * keyed by cid; the client gets the code.
 */
export const API_ERROR_MESSAGE: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'Anda harus masuk terlebih dahulu',
  PERMISSION_DENIED: 'Anda tidak memiliki izin',
  INVALID_ARGUMENT: 'Permintaan tidak valid',
  NOT_FOUND: 'Tidak ditemukan',
  ALREADY_EXISTS: 'Sudah ada',
  RESOURCE_EXHAUSTED: 'Terlalu banyak permintaan',
  DEADLINE_EXCEEDED: 'Permintaan melebihi batas waktu',
  UNAVAILABLE: 'Layanan sementara tidak tersedia',
  INTERNAL: 'Terjadi kesalahan',
}

/**
 * The single HTTP status per code. This is the whole reason the HTTP envelope
 * exists next to `ActionResult`: a `fetch` caller acts on the status line.
 */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  INVALID_ARGUMENT: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  RESOURCE_EXHAUSTED: 429,
  DEADLINE_EXCEEDED: 504,
  UNAVAILABLE: 503,
  INTERNAL: 500,
}

/** Build an `ApiError` from a code, taking the canonical message for it. */
export function toApiError(code: ApiErrorCode, details?: unknown): ApiError {
  return details === undefined
    ? { code, message: API_ERROR_MESSAGE[code] }
    : { code, message: API_ERROR_MESSAGE[code], details }
}
