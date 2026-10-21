import { describe, expect, it } from 'vitest'

import { signedInAs } from '@/test/builders/session'

import {
  can,
  CAPABILITIES,
  type Capability,
  isRole,
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
  admin: ['aisa:read', 'aisa:respond', 'aisa:configure'],
  user: ['aisa:read'],
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
  ]

  for (const [label, claims] of fallsBack) {
    it(`falls back to user for ${label}`, () => {
      expect(roleFromClaims(claims)).toBe('user')
    })
  }
})
