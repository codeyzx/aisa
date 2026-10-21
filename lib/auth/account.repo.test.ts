import { describe, expect, it } from 'vitest'

import { isDefinitiveLookupMiss } from './account.repo'

/**
 * The fail-safe rule that decides absence from outage, driven at both edges. ONLY
 * a definitive Firebase "no such account" answer may be read as absence; every
 * other failure — an unreachable Admin SDK, a timeout, a quota rejection — must
 * NOT be, or an outage would read as "no such user" and let a caller conclude an
 * account is gone, or that there are zero administrators. `getAccount` /
 * `findAccountByEmail` return null only when this is true and re-throw otherwise,
 * so this predicate is exactly the classification the finding asked to prove.
 */
describe('isDefinitiveLookupMiss', () => {
  const definitive: [string, unknown][] = [
    ['user-not-found', { code: 'auth/user-not-found' }],
    ['invalid-email', { code: 'auth/invalid-email' }],
  ]
  for (const [label, error] of definitive) {
    it(`treats ${label} as a definitive miss (absence)`, () => {
      expect(isDefinitiveLookupMiss(error)).toBe(true)
    })
  }

  // Everything else is an OUTAGE and must be re-thrown, never swallowed as absence.
  const outages: [string, unknown][] = [
    ['a network failure', { code: 'auth/network-request-failed' }],
    ['an internal error', { code: 'auth/internal-error' }],
    ['a quota rejection', { code: 'auth/quota-exceeded' }],
    ['a gRPC deadline', { code: 'DEADLINE_EXCEEDED' }],
    ['an unavailable service', { code: 'UNAVAILABLE' }],
    ['a plain Error with no code', new Error('boom')],
    ['a non-string code', { code: 500 }],
    ['a bare string that merely looks like a code', 'auth/user-not-found'],
    ['null', null],
    ['undefined', undefined],
  ]
  for (const [label, error] of outages) {
    it(`does NOT treat ${label} as a miss`, () => {
      expect(isDefinitiveLookupMiss(error)).toBe(false)
    })
  }
})
