import { type Session } from '@/lib/auth/session'

/**
 * A signed-in `Session` for a role.
 *
 * Shared across action tests so each does not hand-roll its own. `Session` is
 * READ from `@/lib/auth/session` rather than re-declared: a builder that restates
 * the type it builds is a parallel taxonomy that drifts green the day a field is
 * added.
 *
 * `role` is deliberately not defaulted. Every test that uses this is a test
 * ABOUT authorization — `user` holds `asset:read` but not `asset:write`
 * (lib/auth/rbac.ts), and that split is what gives such a test teeth. A default
 * would let a caller forget the one decision the builder exists to make explicit.
 */
export function signedInAs(
  role: Session['role'],
  overrides: Partial<Session> = {},
): Session {
  return {
    uid: 'uid-1',
    email: 'someone@aixel.test',
    emailVerified: true,
    role,
    ...overrides,
  }
}
