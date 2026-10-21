import { describe, expect, it } from 'vitest'

import { isDefinitiveTokenRejection } from './token-rejection'

/**
 * The fail-safe rule that decides a bad TOKEN from an unreachable PROVIDER,
 * driven at both edges. Only a definitive Firebase rejection may sign a caller
 * out; every other failure — an unreachable Admin SDK, a timeout, a quota
 * rejection — must NOT, or a Google-side outage would report itself as "invalid
 * credentials" and bounce every validly-signed-in user to /login.
 *
 * `getSession`, `changeOwnPasswordAction` and the session-mint route all branch
 * on this predicate, so this table is the whole classification.
 */
describe('isDefinitiveTokenRejection', () => {
  // The token itself is unusable. Remedy: sign in again.
  const definitive: [string, unknown][] = [
    ['an expired ID token', { code: 'auth/id-token-expired' }],
    ['a revoked ID token', { code: 'auth/id-token-revoked' }],
    ['an invalid ID token', { code: 'auth/invalid-id-token' }],
    ['an expired session cookie', { code: 'auth/session-cookie-expired' }],
    ['a revoked session cookie', { code: 'auth/session-cookie-revoked' }],
    ['an invalid session cookie', { code: 'auth/invalid-session-cookie' }],
    ['an invalid user token', { code: 'auth/invalid-user-token' }],
    ['a disabled account', { code: 'auth/user-disabled' }],
    ['a subject that no longer exists', { code: 'auth/user-not-found' }],
    ['a malformed token argument', { code: 'auth/argument-error' }],
  ]
  for (const [label, error] of definitive) {
    it(`treats ${label} as a definitive rejection`, () => {
      expect(isDefinitiveTokenRejection(error)).toBe(true)
    })
  }

  // We never got an answer ABOUT THE TOKEN. Signing the caller out here is the
  // defect this predicate exists to prevent; every one must read as an outage.
  const outages: [string, unknown][] = [
    ['an internal provider error', { code: 'auth/internal-error' }],
    ['a network failure', { code: 'auth/network-request-failed' }],
    ['provider backpressure', { code: 'auth/too-many-requests' }],
    ['a quota rejection', { code: 'auth/quota-exceeded' }],
    ['an unavailable service', { code: 'UNAVAILABLE' }],
    ['a gRPC deadline', { code: 'DEADLINE_EXCEEDED' }],
    ['a numeric gRPC status', { code: 14 }],
    ['a plain Error with no code', new Error('boom')],
    ['a non-string code', { code: 500 }],
    ['a bare string that merely looks like a code', 'auth/id-token-expired'],
    ['null', null],
    ['undefined', undefined],
  ]
  for (const [label, error] of outages) {
    it(`does NOT treat ${label} as a rejection`, () => {
      expect(isDefinitiveTokenRejection(error)).toBe(false)
    })
  }

  // An unrecognised auth/* code must fall to the SAFE side. A future SDK code
  // this allow-list has not seen must not be able to sign users out.
  it('treats an unknown auth code as an outage, not a rejection', () => {
    expect(isDefinitiveTokenRejection({ code: 'auth/some-future-code' })).toBe(
      false,
    )
  })
})
