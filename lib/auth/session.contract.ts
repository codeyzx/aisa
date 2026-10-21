/**
 * The pure, serializable shape of "who is acting" — safe to import from either
 * side of the RSC boundary. The runtime session DAL that MINTS a `Session`
 * (cookie read, Firebase Admin verification) lives in the server-only
 * `session.ts`; this module carries only the types, so a client component can
 * name a `Session` prop without dragging `firebase-admin` into the browser
 * bundle. `session.ts` re-exports these for server callers, so existing
 * `@/lib/auth/session` type imports keep working unchanged.
 */
import type { Role } from './rbac'

/** The admin behind an impersonated session. Set only while impersonating. */
export interface Impersonator {
  uid: string
  email: string | null
}

/**
 * THIS TYPE CROSSES TO THE BROWSER. `app/(app)/layout.tsx` passes a `Session`
 * into `AppShell`, which hands it to the `'use client'` topbar — so every field
 * here is serialized into the RSC payload and readable in page source.
 *
 * That is why there is no `claims` field. One used to exist, carrying the whole
 * decoded session cookie (`auth_time`, `iat`, `exp`, `sub`, `firebase.identities`,
 * `sign_in_provider`, and every custom claim), and it had NO readers anywhere —
 * it shipped the token payload to the client for nothing. Anything a server
 * boundary needs from the token is read inside `session.ts` and either used
 * there or projected onto a NAMED, deliberately-chosen field below.
 *
 * The rule for adding a field: it must be something a client component may see.
 * A claim that gates authority (`role`) is fine — the client already knows what
 * it can do, and the server re-checks regardless. A raw claims bag is not,
 * because it exposes whatever a future project happens to put in it.
 */
export interface Session {
  uid: string
  email: string | null
  emailVerified: boolean
  role: Role
  /**
   * Set only when the account carries the `mustChangePassword` custom claim —
   * an admin created it, or an admin reset its password, and the temporary
   * password has not yet been replaced.
   *
   * It travels to the client ON PURPOSE, and passes the rule above: a user must
   * be told why they are being sent to the password screen, and knowing it is
   * not authority. The authority half is server-side — `requireReadySession`
   * refuses ordinary pages and `runAction`/`runFormAction` refuse ordinary
   * mutations while it is set, so a client that ignores the flag gains nothing.
   *
   * Absent (not `false`) on an ordinary session, and absent on an IMPERSONATED
   * session: the admin behind the overlay cannot produce the target's
   * reauthentication proof, so propagating it would trap them on a screen they
   * cannot clear rather than protecting anything.
   */
  mustChangePassword?: true
  /**
   * The real human acting, when this session is impersonated. Absent on an
   * ordinary session. `uid` above is always WHO IS BEING ACTED AS, so every
   * existing authz check keeps working unchanged; this field is the answer to
   * "who really did it" — the fact the audit trail would otherwise lose.
   */
  impersonator?: Impersonator
  /**
   * Set only when an impersonation cookie is present but the target's identity
   * COULD NOT be verified — an Admin-SDK / directory OUTAGE, as distinct from a
   * missing, invalid, or expired overlay. A session in this state carries NO
   * authority (`can()` returns false regardless of role) and the app shell blocks
   * on it, so an inability to establish effective identity never continues as an
   * apparently ordinary admin. `impersonator` stays set so the block is
   * attributable, and the overlay cookie is preserved so the admin can retry or
   * explicitly end it once the dependency recovers.
   */
  impersonationUnavailable?: boolean
}
