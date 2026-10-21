import { describe, expect, it } from 'vitest'
import * as z from 'zod'

import { API_ERROR_MESSAGE } from './errors.contract'
import { normalizeError } from './errors.normalize'

/** A Firebase-shaped throw: what the SDKs actually give us is an Error with a `code`. */
function firebaseError(
  code: string | number,
  message = 'raw sdk detail',
): Error {
  return Object.assign(new Error(message), { code })
}

describe('normalizeError — Firebase string codes', () => {
  it('maps Firestore codes', () => {
    expect(normalizeError(firebaseError('permission-denied')).code).toBe(
      'PERMISSION_DENIED',
    )
    expect(normalizeError(firebaseError('not-found')).code).toBe('NOT_FOUND')
    expect(normalizeError(firebaseError('already-exists')).code).toBe(
      'ALREADY_EXISTS',
    )
    expect(normalizeError(firebaseError('invalid-argument')).code).toBe(
      'INVALID_ARGUMENT',
    )
    expect(normalizeError(firebaseError('resource-exhausted')).code).toBe(
      'RESOURCE_EXHAUSTED',
    )
    expect(normalizeError(firebaseError('deadline-exceeded')).code).toBe(
      'DEADLINE_EXCEEDED',
    )
    expect(normalizeError(firebaseError('unavailable')).code).toBe(
      'UNAVAILABLE',
    )
    expect(normalizeError(firebaseError('unauthenticated')).code).toBe(
      'UNAUTHENTICATED',
    )
  })

  it("treats a missing composite index as OUR fault, not the caller's", () => {
    // failed-precondition is overwhelmingly a missing index here (see
    // docs/reference/contracts/data.md). 400 would blame the client for an
    // undeployed index and hide the fault from anyone reading status codes.
    expect(normalizeError(firebaseError('failed-precondition')).code).toBe(
      'INTERNAL',
    )
  })

  it('treats contention as retry-later rather than a bad request', () => {
    expect(normalizeError(firebaseError('aborted')).code).toBe('UNAVAILABLE')
  })

  it('collapses every unusable-token case to UNAUTHENTICATED', () => {
    for (const code of [
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/invalid-id-token',
      'auth/session-cookie-expired',
      'auth/session-cookie-revoked',
      'auth/user-disabled',
    ]) {
      expect(normalizeError(firebaseError(code)).code, code).toBe(
        'UNAUTHENTICATED',
      )
    }
  })

  it('answers NOT_FOUND for a user lookup miss, not UNAUTHENTICATED', () => {
    // `auth/user-not-found` is overloaded: getUser/getUserByEmail throw it for a
    // uid that does not exist, and that caller is signed in. Telling them to
    // sign in again sends them round a loop back to the same error.
    expect(normalizeError(firebaseError('auth/user-not-found')).code).toBe(
      'NOT_FOUND',
    )
  })

  it('maps the rest of the Admin Auth codes we care about', () => {
    expect(
      normalizeError(firebaseError('auth/insufficient-permission')).code,
    ).toBe('PERMISSION_DENIED')
    expect(
      normalizeError(firebaseError('auth/email-already-exists')).code,
    ).toBe('ALREADY_EXISTS')
    expect(normalizeError(firebaseError('auth/too-many-requests')).code).toBe(
      'RESOURCE_EXHAUSTED',
    )
    expect(normalizeError(firebaseError('auth/internal-error')).code).toBe(
      'INTERNAL',
    )
  })
})

describe('normalizeError — gRPC numeric codes', () => {
  it('maps the Admin SDK numeric status', () => {
    // The Admin SDK is what runs server-side, and its Firestore errors surface
    // `code` as a raw gRPC NUMBER, not the hyphenated string. A string-only
    // mapper would funnel all of these into INTERNAL.
    expect(normalizeError(firebaseError(5)).code).toBe('NOT_FOUND')
    expect(normalizeError(firebaseError(6)).code).toBe('ALREADY_EXISTS')
    expect(normalizeError(firebaseError(7)).code).toBe('PERMISSION_DENIED')
    expect(normalizeError(firebaseError(8)).code).toBe('RESOURCE_EXHAUSTED')
    expect(normalizeError(firebaseError(16)).code).toBe('UNAUTHENTICATED')
    expect(normalizeError(firebaseError(3)).code).toBe('INVALID_ARGUMENT')
    expect(normalizeError(firebaseError(4)).code).toBe('DEADLINE_EXCEEDED')
    expect(normalizeError(firebaseError(14)).code).toBe('UNAVAILABLE')
  })

  it('maps numeric FAILED_PRECONDITION the same way as its string twin', () => {
    expect(normalizeError(firebaseError(9)).code).toBe('INTERNAL')
  })

  it('does not confuse gRPC OK with a mapped code', () => {
    // 0 is falsy and 2 (UNKNOWN) is unmapped — neither may fall through to a
    // wrong code via a truthiness check.
    expect(normalizeError(firebaseError(0)).code).toBe('INTERNAL')
    expect(normalizeError(firebaseError(2)).code).toBe('INTERNAL')
  })
})

describe('normalizeError — everything else', () => {
  it('maps a Zod failure to INVALID_ARGUMENT', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 })
    expect(result.success).toBe(false)
    expect(normalizeError(result.error).code).toBe('INVALID_ARGUMENT')
  })

  it('prefers Zod over a stray code property', () => {
    // Order matters: a validation failure is the caller's fault and must not be
    // shadowed by something that merely looks Firebase-shaped.
    const error = Object.assign(new z.ZodError([]), { code: 'not-found' })
    expect(normalizeError(error).code).toBe('INVALID_ARGUMENT')
  })

  it('does not treat a prototype-chain key as a mapped code', () => {
    // With `code in TABLE`, an error code of 'constructor'/'toString' would be
    // TRUE (inherited from Object.prototype) and return a garbage mapping.
    // `Object.hasOwn` guards it — every one of these is an unmapped INTERNAL.
    for (const code of [
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
    ]) {
      expect(normalizeError(firebaseError(code)).code, code).toBe('INTERNAL')
    }
  })

  it('falls back to INTERNAL for unrecognised throws', () => {
    expect(normalizeError(new Error('boom')).code).toBe('INTERNAL')
    expect(
      normalizeError(firebaseError('auth/some-code-we-never-mapped')).code,
    ).toBe('INTERNAL')
    expect(normalizeError('a bare string').code).toBe('INTERNAL')
    expect(normalizeError(undefined).code).toBe('INTERNAL')
    expect(normalizeError(null).code).toBe('INTERNAL')
    expect(normalizeError({ code: { nested: true } }).code).toBe('INTERNAL')
  })

  it('NEVER leaks the thrown error into the client-visible payload', () => {
    // The load-bearing promise of this module, and the same one runAction makes:
    // an SDK message can carry a document path, a query shape, or a bucket name.
    // The raw error goes to the log keyed by cid; the client gets the code.
    const secret = 'projects/p/databases/(default)/documents/private/doc-1'
    for (const thrown of [
      firebaseError('failed-precondition', secret),
      firebaseError(9, secret),
      new Error(secret),
      secret,
    ]) {
      const normalized = normalizeError(thrown)
      expect(JSON.stringify(normalized)).not.toContain(secret)
      expect(normalized.details).toBeUndefined()
      expect(normalized.message).toBe(API_ERROR_MESSAGE[normalized.code])
    }
  })
})
