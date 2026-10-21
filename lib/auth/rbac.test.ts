import { describe, expect, it } from 'vitest'

import { signedInAs } from '@/test/builders/session'

import {
  can,
  CAPABILITIES,
  type Capability,
  isRetainedAdministrator,
  isRole,
  RETAINED_ADMIN_CAPABILITY,
  roleCan,
  type Role,
  roleFromClaims,
  ROLES,
} from './rbac'

/**
 * The grant matrix, re-declared by hand on purpose. rbac.ts derives admin from
 * `[...CAPABILITIES]`; deriving it here too would make the test agree with the
 * implementation by construction and prove nothing. This is an independent
 * second statement of the intended policy — widening a role's grants makes it
 * disagree, and the test fails.
 *
 * `Record<Role, ...>` is what keeps it honest as roles are added: a new role
 * fails typecheck here until someone states its grants.
 */
const EXPECTED_GRANTS: Record<Role, readonly Capability[]> = {
  admin: [
    'asset:read',
    'asset:write',
    'admin:access',
    'admin:users:read',
    'admin:users:manage',
    'admin:audit:read',
    'impersonation:start',
    'storage:read',
    'storage:write',
    'export:read',
    'ai:invoke',
  ],
  user: ['asset:read', 'storage:read'],
}

describe('can', () => {
  // The universe is derived from CAPABILITIES so that adding a capability
  // without stating who gets it fails here rather than passing silently.
  for (const role of ROLES) {
    for (const capability of CAPABILITIES) {
      const granted = EXPECTED_GRANTS[role].includes(capability)
      it(`${granted ? 'grants' : 'denies'} ${capability} to ${role}`, () => {
        expect(can(signedInAs(role), capability)).toBe(granted)
      })
    }
  }

  it('denies every capability to a null session', () => {
    for (const capability of CAPABILITIES) {
      expect(can(null, capability)).toBe(false)
    }
  })
})

describe('isRole', () => {
  for (const role of ROLES) {
    it(`accepts ${role}`, () => {
      expect(isRole(role)).toBe(true)
    })
  }

  // isRole guards an untrusted role claim off a decoded token, so the inputs
  // that matter are the ones an attacker or a malformed token can produce.
  const rejected: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['unknown role', 'superadmin'],
    ['wrong case', 'Admin'],
    ['whitespace-padded role', ' admin'],
    ['number', 1],
    ['boolean', true],
    ['array of a role', ['admin']],
    ['object', { role: 'admin' }],
    ['prototype key', 'constructor'],
    ['prototype method name', 'toString'],
  ]

  for (const [label, value] of rejected) {
    it(`rejects ${label}`, () => {
      expect(isRole(value)).toBe(false)
    })
  }
})

/**
 * The ONE place a role is decided, so the cases that matter are the ones a
 * malformed token, a hand-edited claim, or a prototype-key trick can produce.
 * Each must land on the least-privileged role, never throw and never leak a
 * non-`Role` string onward.
 */
describe('roleFromClaims', () => {
  for (const role of ROLES) {
    it(`resolves a valid ${role} claim`, () => {
      expect(roleFromClaims({ role })).toBe(role)
    })
  }

  const fallsBack: [string, Record<string, unknown> | undefined][] = [
    ['no claims at all', undefined],
    ['an empty bag', {}],
    ['an unknown role', { role: 'superadmin' }],
    ['a wrong-case role', { role: 'Admin' }],
    ['a non-string role', { role: 1 }],
    ['a null role', { role: null }],
    ['an array-wrapped role', { role: ['admin'] }],
    ['a prototype key as the role', { role: 'constructor' }],
    ['other claims but no role', { mustChangePassword: true }],
  ]

  for (const [label, claims] of fallsBack) {
    it(`falls back to user for ${label}`, () => {
      expect(roleFromClaims(claims)).toBe('user')
    })
  }
})

/**
 * The final-administrator floor follows a CAPABILITY, not the `admin` role name,
 * so a fork that splits `ROLES` keeps the lockout guarantee. These assert the
 * predicate the count and refusals in the account layer read, independently of
 * that layer.
 */
describe('isRetainedAdministrator', () => {
  it('names the manage capability as the retained floor', () => {
    // If a refactor points the floor at a weaker capability (e.g. read-only
    // directory access), this fails — losing the last manager is the one
    // unrecoverable state, so the floor must be the authority that can recover.
    expect(RETAINED_ADMIN_CAPABILITY).toBe('admin:users:manage')
  })

  for (const role of ROLES) {
    const expected = roleCan(role, RETAINED_ADMIN_CAPABILITY)
    it(`${expected ? 'counts' : 'does not count'} ${role} as a retained administrator`, () => {
      // Tracks the grant table by construction: whoever holds the retained
      // capability is a retained administrator, and nobody else.
      expect(isRetainedAdministrator(role)).toBe(expected)
    })
  }

  it('counts admin and not user under the default grant table', () => {
    // The concrete policy today, stated independently of the derivation above so
    // a grant-table change that silently flipped either answer is caught.
    expect(isRetainedAdministrator('admin')).toBe(true)
    expect(isRetainedAdministrator('user')).toBe(false)
  })
})
