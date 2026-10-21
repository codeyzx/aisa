/**
 * The pure, serializable shape of "who is acting" — safe to import from either
 * side of the RSC boundary. The runtime session DAL that MINTS a `Session`
 * (cookie read, Firebase session-cookie verification) lives in the server-only
 * `session.ts`; this module carries only the types, so a client component can
 * name a `Session` prop without dragging server-only code into the browser
 * bundle. `session.ts` re-exports these for server callers, so existing
 * `@/lib/auth/session` type imports keep working unchanged.
 */
import type { Role } from './rbac'

/**
 * THIS TYPE CROSSES TO THE BROWSER. `app/(app)/layout.tsx` passes a `Session`
 * into `AppShell`, which hands it to the `'use client'` topbar — so every field
 * here is serialized into the RSC payload and readable in page source.
 *
 * That is why there is no raw claims field: anything a server boundary needs
 * from the cookie is read inside `session.ts` and projected onto a NAMED field.
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
}
