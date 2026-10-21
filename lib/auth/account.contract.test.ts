/**
 * The mapper is an ALLOWLIST, and that is what these tests hold. The interesting
 * failure is not "a field is wrong" — it is a future edit widening what may cross
 * to the browser, so the central assertion pins the whole key set rather than
 * probing for the absence of one name a leak might not use.
 */
import { describe, expect, it } from 'vitest'
import type { UserRecord } from 'firebase-admin/auth'

import { toAccountSummary, type AccountSummary } from './account.contract'

const SUMMARY_KEYS: (keyof AccountSummary)[] = [
  'uid',
  'email',
  'displayName',
  'role',
  'disabled',
  'emailVerified',
  'lastSignInAt',
]

/**
 * A record shaped like the real thing, INCLUDING the credential and provider
 * material Firebase actually hands back — the point of the test is that none of
 * it survives the mapping.
 */
function record(overrides: Record<string, unknown> = {}): UserRecord {
  return {
    uid: 'uid-1',
    email: 'user@example.test',
    displayName: 'Contoh Pengguna',
    emailVerified: true,
    disabled: false,
    customClaims: { role: 'admin', mustChangePassword: true },
    passwordHash: 'hashed-secret',
    passwordSalt: 'salt-secret',
    phoneNumber: '+628123456789',
    photoURL: 'https://example.test/avatar.png',
    tenantId: null,
    tokensValidAfterTime: 'Mon, 01 Jan 2024 00:00:00 GMT',
    providerData: [
      {
        uid: 'user@example.test',
        providerId: 'password',
        email: 'user@example.test',
      },
    ],
    multiFactor: { enrolledFactors: [] },
    metadata: {
      creationTime: 'Mon, 01 Jan 2024 00:00:00 GMT',
      lastSignInTime: 'Tue, 02 Jan 2024 03:04:05 GMT',
    },
    ...overrides,
  } as unknown as UserRecord
}

describe('toAccountSummary', () => {
  it('emits exactly the allowlisted keys and nothing else', () => {
    expect(Object.keys(toAccountSummary(record())).toSorted()).toEqual(
      SUMMARY_KEYS.toSorted(),
    )
  })

  it('drops every credential, provider, and claims field', () => {
    const serialized = JSON.stringify(toAccountSummary(record()))
    for (const secret of [
      'hashed-secret',
      'salt-secret',
      '+628123456789',
      'password',
      'mustChangePassword',
      'tokensValidAfterTime',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('carries the identity and state fields a surface needs', () => {
    expect(toAccountSummary(record())).toEqual({
      uid: 'uid-1',
      email: 'user@example.test',
      displayName: 'Contoh Pengguna',
      role: 'admin',
      disabled: false,
      emailVerified: true,
      lastSignInAt: '2024-01-02T03:04:05.000Z',
    })
  })

  it('resolves an absent, unknown, or forged role claim to the least privilege', () => {
    for (const customClaims of [
      undefined,
      {},
      { role: 'superadmin' },
      { role: 42 },
    ]) {
      expect(toAccountSummary(record({ customClaims })).role).toBe('user')
    }
  })

  it('normalizes a missing or unparseable last sign-in to null, never Invalid Date', () => {
    for (const metadata of [
      { lastSignInTime: '' },
      { lastSignInTime: 'not-a-date' },
      {},
      undefined,
    ]) {
      expect(toAccountSummary(record({ metadata })).lastSignInAt).toBeNull()
    }
  })

  it('normalizes absent optional identity fields to null, not undefined', () => {
    // `undefined` does not survive JSON/RSC serialization the way `null` does, so
    // an absent email must be an explicit null before it crosses the boundary.
    const summary = toAccountSummary(
      record({ email: undefined, displayName: undefined }),
    )
    expect(summary.email).toBeNull()
    expect(summary.displayName).toBeNull()
  })
})
