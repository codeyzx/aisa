import { describe, expect, it } from 'vitest'

import { mergeAccountClaims } from './claims'
import { mustChangePasswordFromClaims, roleFromClaims } from './rbac'

/**
 * The merge is the whole reason `claims.ts` exists, and every case below is a
 * silent-corruption bug that `setCustomUserClaims(uid, patch)` — the obvious,
 * wrong call — produces: it REPLACES the claims object, so a role update deletes
 * the password requirement and a password update deletes the role.
 *
 * Neither failure is visible until the target's next sign-in, and neither throws.
 * That is why these are asserted through `roleFromClaims` /
 * `mustChangePasswordFromClaims` — the readers that actually decide authority —
 * rather than only against the raw bag: the question is not "what shape is
 * stored" but "what does the boundary conclude from it".
 */
describe('mergeAccountClaims', () => {
  it('a role update PRESERVES mustChangePassword', () => {
    const merged = mergeAccountClaims(
      { role: 'user', mustChangePassword: true },
      { role: 'admin' },
    )
    expect(roleFromClaims(merged)).toBe('admin')
    expect(mustChangePasswordFromClaims(merged)).toBe(true)
  })

  it('a password-state update PRESERVES the role', () => {
    const merged = mergeAccountClaims(
      { role: 'admin' },
      { mustChangePassword: true },
    )
    // The failure this catches is the nastiest of the pair: a dropped role
    // resolves to `user`, so the account is silently DEMOTED by a password reset
    // and nothing anywhere reports an error.
    expect(roleFromClaims(merged)).toBe('admin')
    expect(mustChangePasswordFromClaims(merged)).toBe(true)
  })

  it('preserves claims a project added that this module knows nothing about', () => {
    // The patch names only the keys it changes, so `rbac.ts` growing a third
    // claim — or a fork adding a tenant id — needs no change here.
    expect(
      mergeAccountClaims(
        { role: 'user', tenantId: 'acme', seats: 3 },
        { role: 'admin' },
      ),
    ).toEqual({ role: 'admin', tenantId: 'acme', seats: 3 })
  })

  it('null DELETES a claim', () => {
    const merged = mergeAccountClaims(
      { role: 'admin', mustChangePassword: true },
      { mustChangePassword: null },
    )
    expect('mustChangePassword' in merged).toBe(false)
    expect(roleFromClaims(merged)).toBe('admin')
  })

  it('an explicit undefined LEAVES A CLAIM ALONE — it is not a deletion', () => {
    // The convention that makes deletion unambiguous. `{ role: undefined }` is
    // what a caller produces by forgetting to compute a value, and a deletion
    // that can happen by accident is a deletion that will.
    const merged = mergeAccountClaims(
      { role: 'admin', mustChangePassword: true },
      { role: undefined, mustChangePassword: undefined },
    )
    expect(merged).toEqual({ role: 'admin', mustChangePassword: true })
  })

  it('an empty patch is a no-op', () => {
    expect(mergeAccountClaims({ role: 'admin' }, {})).toEqual({ role: 'admin' })
  })

  it('starts from an empty bag when the account has no claims yet', () => {
    expect(
      mergeAccountClaims(undefined, { role: 'user', mustChangePassword: true }),
    ).toEqual({ role: 'user', mustChangePassword: true })
  })

  it('does not mutate the caller’s existing bag', () => {
    // `setAccountClaims` reads a live `UserRecord.customClaims`; mutating it in
    // place would edit the SDK's own cached record.
    const existing = { role: 'admin', mustChangePassword: true }
    mergeAccountClaims(existing, { mustChangePassword: null })
    expect(existing).toEqual({ role: 'admin', mustChangePassword: true })
  })

  it('deleting a claim that was never set is a no-op, not an inserted undefined', () => {
    // An `undefined` VALUE would serialize into the claims bag and travel on
    // every future token as a meaningless key.
    const merged = mergeAccountClaims(
      { role: 'user' },
      { mustChangePassword: null },
    )
    expect(Object.keys(merged)).toEqual(['role'])
  })
})
