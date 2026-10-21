/**
 * Role-based access control. Generic, minimal starter roles + capabilities — a
 * project extends `ROLES` / `CAPABILITIES` / `ROLE_CAPABILITIES`; nothing here is
 * domain-specific. The `Session` type comes from the pure `session.contract`
 * module (not the server-only `session.ts`), so `rbac` stays client-reachable —
 * a nav or toolbar can call `can()` without dragging server-only code into the
 * browser bundle.
 */
import type { Session } from './session.contract'

export const ROLES = ['admin', 'user'] as const
export type Role = (typeof ROLES)[number]

/**
 * Human labels for `ROLES` — the ONE place a role is spelled for a reader, in
 * Bahasa Indonesia (the default product language). Every surface that shows a
 * role to a human reads this map instead of rendering the raw claim: the topbar
 * user card, the dashboard. The claim value (`admin`/`user`) is a PERSISTED,
 * machine-stable enum and never changes; only its display does.
 *
 * `Record<Role, string>` is the trick, not decoration: adding a role to `ROLES`
 * is a COMPILE ERROR here until its label exists, so a raw role string can never
 * reach the UI.
 */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  user: 'Pengguna',
}

export const CAPABILITIES = [
  'aisa:read',
  'aisa:respond',
  'aisa:configure',
] as const
export type Capability = (typeof CAPABILITIES)[number]

/**
 * Capabilities granted per role (declared in `features/aisa/aisa.capability.ts`).
 * The role is the `role` custom claim on the Firebase account (`roleFromClaims`);
 * `user` is a read-only seat.
 */
const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: [...CAPABILITIES],
  user: ['aisa:read'],
}

/**
 * Whether a ROLE grants `capability`, read straight off the one grant table.
 *
 * Exists so nav visibility (`filterNavByRole`, a client concern that has only the
 * role, not a `Session`) can be derived from the SAME `ROLE_CAPABILITIES` the DAL
 * enforces — not a hand-kept second copy of who-can-see-what. `can` below
 * delegates to it, so the session boundary and the nav filter can never disagree
 * about what a role grants. This is authorization DATA, not a boundary: the DAL
 * guard is still the only thing that refuses a request.
 */
export function roleCan(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability)
}

/** Whether the session's role grants `capability`. No session → false. */
export function can(session: Session | null, capability: Capability): boolean {
  if (!session) return false
  return roleCan(session.role, capability)
}

/** Type guard for safely parsing an untrusted role claim off a decoded token. */
export function isRole(value: unknown): value is Role {
  // `some` compares each known role against the unknown value, so the check
  // never casts the untrusted input to `Role` — the one thing a guard at the
  // auth boundary must not assume before it has proven it.
  return ROLES.some((role) => role === value)
}

/**
 * The role an UNTRUSTED claims bag grants. Anything that is not a known role —
 * missing, misspelled, a number — is the least-privileged `user`, never an
 * error and never `admin`.
 */
export function roleFromClaims(
  claims: Record<string, unknown> | undefined,
): Role {
  const role = claims?.role
  return isRole(role) ? role : 'user'
}
