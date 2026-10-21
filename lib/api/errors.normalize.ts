import * as z from 'zod'

import { toApiError, type ApiError, type ApiErrorCode } from './errors.contract'

/**
 * The PROVIDER side of the error taxonomy: normalising an unknown throw (Firebase
 * string codes, raw gRPC status numbers, Zod) into the wire `ApiError` defined in
 * `errors.contract.ts`. This is where all the SDK-specific knowledge lives, kept
 * OUT of the contract so a client — or a fork on a different backend — depends on
 * the codes without importing Firebase's error vocabulary.
 *
 * The dependency is one-way (normalize -> contract, never back), which is why
 * there is no circular-import dance.
 */

/**
 * Firestore / Auth string codes -> our taxonomy.
 *
 * `failed-precondition` maps to INTERNAL, NOT to INVALID_ARGUMENT: in this
 * codebase its overwhelmingly common cause is a MISSING COMPOSITE INDEX (see
 * docs/reference/contracts/data.md), which is an operator mistake, not a caller
 * mistake. Answering 400 would blame the client for our undeployed index and
 * hide the fault from anyone reading status codes.
 */
const FIREBASE_ERROR_CODES: Record<string, ApiErrorCode> = {
  // Firestore
  'permission-denied': 'PERMISSION_DENIED',
  'not-found': 'NOT_FOUND',
  'already-exists': 'ALREADY_EXISTS',
  'invalid-argument': 'INVALID_ARGUMENT',
  'out-of-range': 'INVALID_ARGUMENT',
  'failed-precondition': 'INTERNAL',
  'resource-exhausted': 'RESOURCE_EXHAUSTED',
  'deadline-exceeded': 'DEADLINE_EXCEEDED',
  unauthenticated: 'UNAUTHENTICATED',
  // Contention that survived the SDK's own retries, and a server that is simply
  // down, are both "try again later" to a caller — not a bad request.
  aborted: 'UNAVAILABLE',
  cancelled: 'UNAVAILABLE',
  unavailable: 'UNAVAILABLE',
  internal: 'INTERNAL',
  unimplemented: 'INTERNAL',
  'data-loss': 'INTERNAL',
  // Admin Auth: every way a token can be unusable is one answer to the caller —
  // sign in again. Which of them it was stays in the server log.
  'auth/id-token-expired': 'UNAUTHENTICATED',
  'auth/id-token-revoked': 'UNAUTHENTICATED',
  'auth/invalid-id-token': 'UNAUTHENTICATED',
  'auth/session-cookie-expired': 'UNAUTHENTICATED',
  'auth/session-cookie-revoked': 'UNAUTHENTICATED',
  'auth/invalid-session-cookie': 'UNAUTHENTICATED',
  'auth/user-disabled': 'UNAUTHENTICATED',
  'auth/invalid-user-token': 'UNAUTHENTICATED',
  // AMBIGUOUS — the one code the Admin SDK overloads with two meanings: "the uid
  // you looked up does not exist" (getUser/getUserByEmail) and "the token's own
  // subject is gone" (verifyIdToken with checkRevoked). Mapped to NOT_FOUND
  // because the lookup is by far the common path, and being wrong that way is
  // the cheaper mistake: a wrong 401 tells a signed-in caller to sign in again,
  // and they will — to the same error. The token case is already covered by
  // id-token-revoked / session-cookie-revoked, so this reaching auth is an edge.
  'auth/user-not-found': 'NOT_FOUND',
  'auth/insufficient-permission': 'PERMISSION_DENIED',
  'auth/email-already-exists': 'ALREADY_EXISTS',
  'auth/uid-already-exists': 'ALREADY_EXISTS',
  'auth/phone-number-already-exists': 'ALREADY_EXISTS',
  'auth/invalid-email': 'INVALID_ARGUMENT',
  'auth/invalid-password': 'INVALID_ARGUMENT',
  'auth/argument-error': 'INVALID_ARGUMENT',
  'auth/too-many-requests': 'RESOURCE_EXHAUSTED',
  'auth/quota-exceeded': 'RESOURCE_EXHAUSTED',
  'auth/internal-error': 'INTERNAL',
}

/**
 * gRPC status numbers -> our taxonomy.
 *
 * Needed because the ADMIN SDK is what runs server-side here, and its Firestore
 * errors surface `code` as a NUMBER (the raw gRPC status), not as the hyphenated
 * string the client SDK uses. A mapper that only knew the string form would
 * silently funnel every real server-side Firestore failure into INTERNAL.
 */
const GRPC_STATUS_CODES: Record<number, ApiErrorCode> = {
  1: 'UNAVAILABLE', // CANCELLED
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'INTERNAL', // FAILED_PRECONDITION — see FIREBASE_ERROR_CODES
  10: 'UNAVAILABLE', // ABORTED
  11: 'INVALID_ARGUMENT', // OUT_OF_RANGE
  12: 'INTERNAL', // UNIMPLEMENTED
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'INTERNAL', // DATA_LOSS
  16: 'UNAUTHENTICATED',
}

/** Read a Firebase-style `code` off an unknown throw, if it has one. */
function errorCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  const code: unknown = (error as { code: unknown }).code
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

/**
 * Normalise ANY thrown value into the taxonomy.
 *
 * Order matters: Zod first (a validation failure is the caller's fault and must
 * not be shadowed by a stray `code` property), then Firebase codes, then a
 * catch-all INTERNAL.
 *
 * Anything unrecognised is INTERNAL — never a passthrough of the thrown message.
 * The caller of this function is responsible for logging the raw error.
 */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof z.ZodError) return toApiError('INVALID_ARGUMENT')

  const code = errorCode(error)
  // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so a code of
  // 'constructor' / 'toString' would match and return a garbage (non-code)
  // mapping. Own-keys only.
  if (typeof code === 'string' && Object.hasOwn(FIREBASE_ERROR_CODES, code)) {
    return toApiError(FIREBASE_ERROR_CODES[code])
  }
  if (typeof code === 'number' && Object.hasOwn(GRPC_STATUS_CODES, code)) {
    return toApiError(GRPC_STATUS_CODES[code])
  }

  return toApiError('INTERNAL')
}
