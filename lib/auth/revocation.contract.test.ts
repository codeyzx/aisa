/**
 * The arithmetic three enforcement points share. Firestore Rules re-implement
 * `isTokenRevoked` in a language that cannot import this file, so these tests
 * are also the written statement Rules are checked against.
 */
import { describe, expect, it } from 'vitest'

import {
  AuthSessionSchema,
  isTokenRevoked,
  REVOKED_AFTER_EPOCH_FIELD,
  revocationCutoff,
} from './revocation.contract'

describe('revocationCutoff', () => {
  it('rounds up to the NEXT whole second, closing the same-second window', () => {
    // A token minted anywhere in second 1000 carries auth_time 1000. The cutoff
    // must exceed it, or `isTokenRevoked` (which admits equality) lets it live.
    for (const ms of [1_000_000, 1_000_001, 1_000_500, 1_000_999]) {
      const cutoff = revocationCutoff(ms)
      expect(cutoff).toBe(1001)
      expect(isTokenRevoked(1000, cutoff)).toBe(true)
    }
  })

  it('differs from Math.ceil exactly at a second boundary — the case that matters', () => {
    // At an exact boundary Math.ceil returns the CURRENT second, so a token
    // minted in that second would survive. This is why the formula is stated as
    // floor + 1 and not written as a ceil anywhere.
    const ms = 1_000_000
    expect(Math.ceil(ms / 1000)).toBe(1000)
    expect(revocationCutoff(ms)).toBe(1001)
    expect(isTokenRevoked(1000, Math.ceil(ms / 1000))).toBe(false)
  })

  it('always returns a positive integer', () => {
    for (const ms of [0, 1, 999, 1_700_000_000_123]) {
      const cutoff = revocationCutoff(ms)
      expect(Number.isInteger(cutoff)).toBe(true)
      expect(cutoff).toBeGreaterThan(0)
    }
  })
})

describe('isTokenRevoked', () => {
  it('treats an absent marker as never revoked', () => {
    // Every account predates its first revocation. Reading absence as revocation
    // would sign out the entire user base the moment this feature ships.
    for (const authTime of [0, 1, 1_700_000_000]) {
      expect(isTokenRevoked(authTime, null)).toBe(false)
    }
  })

  it('revokes a token minted strictly before the cutoff', () => {
    expect(isTokenRevoked(999, 1000)).toBe(true)
    expect(isTokenRevoked(0, 1000)).toBe(true)
  })

  it('allows a token minted AT the cutoff — equality is a fresh login', () => {
    expect(isTokenRevoked(1000, 1000)).toBe(false)
  })

  it('allows a token minted after the cutoff', () => {
    expect(isTokenRevoked(1001, 1000)).toBe(false)
  })
})

describe('AuthSessionSchema', () => {
  it('names the field the field-name constant names', () => {
    expect(REVOKED_AFTER_EPOCH_FIELD).toBe('revokedAfterEpoch')
    expect(AuthSessionSchema.parse({ revokedAfterEpoch: 5 })).toEqual({
      revokedAfterEpoch: 5,
    })
  })

  it('rejects every non-integer-second shape a tampered document could hold', () => {
    for (const bad of [
      {},
      { revokedAfterEpoch: null },
      { revokedAfterEpoch: '1000' },
      { revokedAfterEpoch: 1000.5 },
      { revokedAfterEpoch: -1 },
      { revokedAfterEpoch: Number.NaN },
      { revokedAfterEpoch: true },
    ]) {
      expect(AuthSessionSchema.safeParse(bad).success).toBe(false)
    }
  })
})
