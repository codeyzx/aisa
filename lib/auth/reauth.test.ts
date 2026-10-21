import { describe, expect, it } from 'vitest'

import {
  isReauthenticationFresh,
  REAUTH_MAX_AGE_SECONDS,
  REAUTH_MAX_SKEW_SECONDS,
} from './reauth'

/**
 * The freshness boundary for a reauthentication proof, driven at every edge. The
 * cases that matter are the ones a stale tab, a clock-skewed server, or a forged
 * `auth_time` can produce — each must fail CLOSED, because this is the check that
 * gates the one action allowed to clear a mandatory password change.
 */
describe('isReauthenticationFresh', () => {
  // A fixed "now" so the arithmetic is deterministic — no wall clock in the test.
  const NOW_MS = 1_700_000_000_000
  const nowSeconds = Math.floor(NOW_MS / 1000)

  it('accepts a proof minted just now', () => {
    expect(isReauthenticationFresh(nowSeconds, NOW_MS)).toBe(true)
  })

  it('accepts a proof at the far edge of the max age', () => {
    expect(
      isReauthenticationFresh(nowSeconds - REAUTH_MAX_AGE_SECONDS, NOW_MS),
    ).toBe(true)
  })

  it('rejects a proof one second past the max age', () => {
    expect(
      isReauthenticationFresh(nowSeconds - REAUTH_MAX_AGE_SECONDS - 1, NOW_MS),
    ).toBe(false)
  })

  it('rejects a proof dated in the future beyond the skew tolerance', () => {
    // The bug this guards: a future auth_time makes the age negative, which
    // slides straight past the max-age upper bound and reads as maximally fresh.
    expect(
      isReauthenticationFresh(nowSeconds + REAUTH_MAX_SKEW_SECONDS + 1, NOW_MS),
    ).toBe(false)
  })

  it('tolerates a small future skew between the app server and Firebase', () => {
    // Just inside the tolerance: a legitimate user on a slightly-fast clock must
    // not be locked out of the screen that clears their password gate.
    expect(
      isReauthenticationFresh(nowSeconds + REAUTH_MAX_SKEW_SECONDS, NOW_MS),
    ).toBe(true)
  })

  const malformed: [string, number][] = [
    ['NaN (a missing auth_time claim)', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ]
  for (const [label, authTime] of malformed) {
    it(`rejects ${label}`, () => {
      expect(isReauthenticationFresh(authTime, NOW_MS)).toBe(false)
    })
  }
})
