/**
 * Role-based access control. Generic, minimal starter roles + capabilities — a
 * project extends `ROLES` / `CAPABILITIES` / `ROLE_CAPABILITIES`; nothing here is
 * domain-specific. The `Session` type comes from the pure `session.contract`
 * module (not the server-only `session.ts`), so `rbac` stays client-reachable —
 * a nav or toolbar can call `can()` without dragging `firebase-admin` into the
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
 * reach the UI. This mirrors `ASSET_STATUS_LABEL` for exactly the same reason.
 */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  user: 'Pengguna',
}

export const CAPABILITIES = [
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
] as const
export type Capability = (typeof CAPABILITIES)[number]

/**
 * Capabilities granted per role. Admin gets everything; user is read-only.
 *
 * Every name describes user-facing AUTHORITY, not where a demo happens to live:
 * `asset:read`/`asset:write` are the reference feature's read/write, and a real
 * app renames or replaces them per entity. The grants:
 *
 * - `asset:read`, `storage:read` to `user` — the read surface a signed-in user
 *   holds. Widening `user` is a real product decision and belongs in its own
 *   commit with its own argument, never smuggled in underneath a plumbing diff.
 * - `asset:write`, `storage:write` admin-only — the write surface.
 * - `export:read` admin-only, and that IS the product decision: bulk export must
 *   not ride the per-row read grant every signed-in user holds — one click would
 *   hand a whole collection to anyone with a login.
 * - `ai:invoke` admin-only: inference costs money per call, so a project opts
 *   users in deliberately.
 * - `impersonation:start` admin-only, and DISTINCT from `admin:access`: "may
 *   open the admin console" and "may act as another user" are different
 *   authorities that only coincide while `ROLES` is ['admin','user'].
 * - `admin:users:read` admin-only, and also DISTINCT from `admin:access`, for the
 *   same reason: opening the admin surface is not permission to enumerate the
 *   account directory. It gates every read of the Firebase Auth roster —
 *   `listUsers` and exact-email lookup alike — so a future admin surface that
 *   holds no directory authority stays possible without unpicking a grant.
 * - `admin:users:manage` admin-only, and DISTINCT from `admin:users:read` — the
 *   split that matters most in this family. Reading the directory is a support
 *   role's job (find the account, read its state); creating accounts, moving a
 *   role, disabling a person, and replacing their password are the authority to
 *   HAND OUT and TAKE AWAY access, up to and including the grant the actor holds
 *   themselves. A deployment that wants a read-only helpdesk gets it by granting
 *   `admin:users:read` alone; collapsing the two would make that impossible
 *   without a code change, and would mean a support login could demote an admin.
 * - `admin:audit:read` admin-only, and DISTINCT from both directory capabilities.
 *   The account-administration history is not a view of the directory: it names
 *   who did what to whom, including operations on accounts that no longer exist
 *   and operations the reader themselves performed. Reading it is the authority
 *   to WATCH the administrators, which is a different job from managing accounts
 *   — a deployment that wants a compliance reader gets one by granting this alone,
 *   and a helpdesk role granted `admin:users:read` does not silently acquire the
 *   full administrative trail. It gates every read of the durable audit
 *   collection; there is no client-readable Firestore rule for it, so the viewer
 *   is the only way in and this is the only gate on the viewer.
 */
const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: [...CAPABILITIES],
  user: ['asset:read', 'storage:read'],
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

/**
 * The capability whose LAST enabled holder the application must never lose. It is
 * `admin:users:manage` — the authority to create, promote, and re-enable accounts
 * — because losing its last holder is the one unrecoverable state: no remaining
 * account could hand administration back, so the app can never regain it. Opening
 * the console (`admin:access`) or reading the directory (`admin:users:read`)
 * cannot recover from it, which is why neither is the floor.
 *
 * This is the ONE place "which authority must be retained" is named. The
 * final-administrator guard (`lib/actions/account.action.ts`) and the admin count
 * (`lib/auth/account.repo.ts`) read it rather than testing `role === 'admin'`, so
 * a deployment that splits `ROLES` keeps the guarantee: the floor follows the
 * capability, not a role spelling that a fork is expected to change.
 */
export const RETAINED_ADMIN_CAPABILITY: Capability = 'admin:users:manage'

/**
 * Whether `role` holds the retained-administrator authority — the capability whose
 * last enabled holder may not be removed (see `RETAINED_ADMIN_CAPABILITY`). The
 * single definition of "an administrator the lockout guard must protect", so the
 * directory count, the demotion refusal, and the disable refusal can never
 * disagree about who counts.
 */
export function isRetainedAdministrator(role: Role): boolean {
  return roleCan(role, RETAINED_ADMIN_CAPABILITY)
}

/** Whether the session's role grants `capability`. No session → false. */
export function can(session: Session | null, capability: Capability): boolean {
  if (!session) return false
  // Fail closed while an impersonation overlay could not be verified: an
  // unverifiable identity holds NO authority, not even the target's own. This is
  // the boundary half of the outage guard — the shell blocks the UI, and this
  // makes every server-side gate (runAction, requireCapability, route can()) deny.
  if (session.impersonationUnavailable) return false
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
 * Resolve the role from an UNTRUSTED claims bag, falling back to the
 * least-privileged role. The ONE place "what role is this account" is decided, so
 * a decoded session token, a live `UserRecord`'s custom claims, and any future
 * claims reader can never disagree — a missing, misspelled, or hand-forged
 * `role` claim lands on `user` everywhere, never on whatever the caller assumed.
 *
 * Takes the whole bag rather than the plucked value so the CLAIM NAME lives here
 * too: a project that renames it changes one line, not every reader.
 */
export function roleFromClaims(
  claims: Record<string, unknown> | undefined,
): Role {
  const role = claims?.role
  return isRole(role) ? role : 'user'
}

/**
 * Whether the account must replace a temporary password before it may do
 * anything else. Lives beside `roleFromClaims` because it is the same KIND of
 * fact — an authority-bearing custom claim read off an untrusted bag — and
 * because a project renaming its claims should find them together.
 *
 * Strict `=== true`: a claim is untrusted input, and every other truthy value
 * ('false', 1, {}) is a malformed claim, not a request to gate. Erring toward
 * NOT gating is safe here precisely because the gate only ever removes
 * authority — a false positive would lock a user out of an app they are
 * entitled to use, with no way to clear a claim that was never really set.
 */
export function mustChangePasswordFromClaims(
  claims: Record<string, unknown> | undefined,
): boolean {
  return claims?.mustChangePassword === true
}
