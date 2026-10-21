import { describe, expect, it } from 'vitest'

import { firebaseErrorCode } from './error-code'

/** A Firebase-shaped rejection: an Error with a string `code`. */
function authError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

describe('firebaseErrorCode', () => {
  it('reads the string code off a Firebase-shaped error', () => {
    expect(firebaseErrorCode(authError('auth/user-not-found'))).toBe(
      'auth/user-not-found',
    )
  })

  it('is undefined when there is no code, so a caller cannot mistake absence for a match', () => {
    // The load-bearing case for the fail-safe callers: an outage error with no
    // recognizable code must read as `undefined`, NOT as some definitive code —
    // so it falls through to the "unavailable" branch rather than "not found".
    expect(firebaseErrorCode(new Error('network down'))).toBeUndefined()
    expect(firebaseErrorCode('a bare string')).toBeUndefined()
    expect(firebaseErrorCode(null)).toBeUndefined()
    expect(firebaseErrorCode(undefined)).toBeUndefined()
  })

  it('ignores a non-string code (e.g. a raw gRPC number)', () => {
    // Numeric gRPC codes are the API normalizer's job; this reads strings only,
    // so a numeric code is `undefined` here rather than a spurious string match.
    expect(
      firebaseErrorCode(Object.assign(new Error(), { code: 5 })),
    ).toBeUndefined()
  })

  it('does not read an inherited prototype key as the code', () => {
    expect(firebaseErrorCode({})).toBeUndefined()
  })
})
