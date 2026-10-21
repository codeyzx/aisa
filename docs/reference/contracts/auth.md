# Auth contract

- Type: Normative contract (reference)
- Owns: the server-authoritative "who is acting" boundary — the session cookie, the session DAL, the RBAC grant table, and the guards every protected entry point calls
- Source of truth: `lib/auth/**` (`constants.ts`, `session.ts`, `session.contract.ts`, `guards.ts`, `rbac.ts`, `claims.ts`, `revocation.ts`, `capability-availability.ts`, `cookie-options.ts`, `client.ts`), `app/api/auth/session/route.ts`, `proxy.ts`
- Verified by: `pnpm check:static && pnpm test` (the colocated `lib/auth/*.test.ts` suites), then a driven emulator sign-in / sign-out in a browser — a green static chain does not prove a cookie was set
- Read when: you are about to resolve, guard, extend, or revoke an identity — a new protected page, a new role or capability, anything that writes a custom claim
- Does not define: impersonation, the sanctioned bypass layered on top of `getSession` (`docs/reference/contracts/impersonation.md`); the HTTP envelope, the session-mint rate limit, and the CSRF origin rule the session route uses (`docs/reference/contracts/http-api.md`)

Firebase-Admin session cookies + a server-authoritative Data Access Layer (DAL).
The client never gets a trusted identity; it only hands the server a Firebase ID
token and asks for a cookie. Every "who is acting" decision happens server-side in
`getSession`.

## Files

- `lib/auth/constants.ts` — the edge-safe shared surface: `SESSION_COOKIE`
  (`'session'`), `SESSION_MAX_AGE_MS` (5 days), `PUBLIC_PREFIXES` (`/login`,
  `/api/auth`, `/api/health`) with the segment-aware `isPublicPath`, and
  `PASSWORD_CHANGE_PATH`.
- `lib/auth/session.ts` — the DAL. `getSession()`, `requireSession()`,
  `sessionFromUserRecord()`.
- `lib/auth/session.contract.ts` — the pure `Session` / `Impersonator` types, so a
  client component can name a `Session` without dragging `firebase-admin` into the
  browser bundle.
- `lib/auth/guards.ts` — `authorizeSession()`, `requireReadySession()`,
  `requireCapability()`, `pathForDenial()`.
- `lib/auth/rbac.ts` — `ROLES`, `ROLE_LABEL`, `CAPABILITIES`, `can()`, `roleCan()`,
  `isRole()`, `roleFromClaims()`, `mustChangePasswordFromClaims()`.
- `lib/auth/claims.ts` — the ONE writer of Firebase custom claims.
- `lib/auth/revocation.ts` + `revocation.contract.ts` — the session-revocation
  marker: the Admin-SDK access, and the pure arithmetic Firestore Rules and the
  client watcher answer to as well.
- `lib/auth/capability-availability.ts` — capabilities a DEPLOYMENT has switched
  off, which is a different question from what a role grants.
- `lib/auth/cookie-options.ts` — `SECURE_COOKIE_ATTRIBUTES`, the shared safety
  baseline for every auth cookie.
- `lib/auth/client.ts` — client fetch wrappers: `establishSession()`,
  `revokeSession()`.
- `app/api/auth/session/route.ts` — `POST` mints the cookie, `DELETE` clears it
  (and the impersonation ticket with it).
- `proxy.ts` — optimistic request gate that checks cookie presence (no
  verification). Next 16's proxy defaults to the Node runtime and the `runtime`
  config option is unavailable there, so any "edge-safe imports only" rule you are
  carrying is Next 15 folklore.

The starter ships the auth mechanism, the `/login` and `/403` screens, and an admin
account surface. Layers 2 and 5 below are rules you uphold as you extend that code.

## The 5-layer cache-invalidation & safety model

Sessions are cached at several levels for speed; each layer below is the thing that
keeps a cached identity from going stale or leaking. Layers 1, 3, 4 are enforced by
shipped code; 2 and 5 are conventions you must honor as you extend the app.

1. **Verify with `checkRevoked=true`, deduped by React `cache()`** — `getSession`
   calls `adminAuth().verifySessionCookie(token, true)`. The `true` makes Firebase
   reject a revoked/rotated session even when the cookie is unexpired. The whole
   function is wrapped in React `cache()`, so layout + page + every leaf share **one**
   verification per render pass. It then consults the revocation marker as well —
   Firebase answers "were this account's refresh tokens revoked", the marker answers
   "did WE decide to end sessions", and dropping either lets a session the app
   believes it ended keep working. An unreadable marker **denies**, which costs no
   availability that was not already gone: every protected surface here reads
   Firestore anyway, and failing open would make "make Firestore unreachable" a way
   to keep a revoked session alive.

   A failed verification is **classified, never collapsed**. `checkRevoked=true`
   forces a network round trip, so the call can fail two unrelated ways: the cookie
   is genuinely unusable, or Google could not be reached. Only a **definitive**
   Firebase rejection — expired, revoked, invalid, disabled account, missing
   subject, malformed argument — may resolve to `null`, because `null` means "not
   signed in" and sends the caller to `/login`. Every other failure **throws**, so
   the cookie survives and the caller surfaces "temporarily unavailable" instead of
   signing an actively-signed-in user out during a provider outage.
   `isDefinitiveTokenRejection` (`lib/auth/token-rejection.ts`) is the one
   predicate, an allow-list so an unrecognised code fails to the safe side; the
   session-mint route and the password-transition action branch on it too, the
   latter answering `unavailable` rather than `unauthenticated`. This is the same
   absence-vs-outage rule `isDefinitiveLookupMiss` applies to account lookups —
   note the safe direction differs by boundary: an impersonation outage fails
   **closed** (blocks), a token-verification outage fails toward **preserving** the
   session.

2. **Revoke on every claims/role change** — a claims change without a revocation is
   a bug: the user's existing session cookie keeps its old claims until natural
   expiry. Write claims only through `setAccountClaims` (`lib/auth/claims.ts`) —
   `setCustomUserClaims` is a REPLACE, not a patch, so a bare
   `setCustomUserClaims(uid, { role })` silently deletes `mustChangePassword`, and
   the reverse silently deletes `role` (which `roleFromClaims` then resolves to
   `user`). Both typecheck, both succeed, and both surface only on the target's next
   sign-in. Then advance the revocation marker (`advanceRevokedAfterEpoch` /
   `revokeSessionsNow`) so the stale cookie is rejected on its next request.

3. **Reading `cookies()` forces dynamic rendering** — `getSession` calls
   `cookies()` from `next/headers`, which opts any route that (transitively) uses it
   into per-request dynamic rendering. That is what guarantees a fresh verification
   instead of a statically cached page baked at build time. Do **not** wrap a
   session-dependent route in `force-static` / `unstable_cache` — you would freeze one
   request's identity into the page.

4. **Client `router.refresh()` after login/logout** — the session cookie is set/cleared
   by an API route, but the client Router Cache still holds server-rendered HTML from
   before. After `establishSession()` (POST) **or** `revokeSession()` (DELETE) resolves,
   the caller **must** `router.refresh()` so the Router Cache is dropped and server
   components re-render with the new (or absent) session. The `client.ts` helpers do
   not do this for you — the calling component owns it. The same rule is why the
   impersonation actions redirect rather than return: `getSession` is `cache()`d, so a
   cookie an action just set is invisible to the same request's re-render, and a
   redirect is a fresh request where the question never arises.

5. **Never `unstable_cache` session-scoped data without the uid in the key** — a bare
   `unstable_cache` entry is shared across all users; caching a user's data under a
   static key leaks it to the next visitor. If you must persist-cache per-user data,
   include `session.uid` in the cache key **and** the tags. Session verification itself
   deliberately uses request-scoped React `cache()` (layer 1), not `unstable_cache`,
   for exactly this reason.

## How to log in

The client signs in with the Firebase Web SDK, gets an ID token, exchanges it for an
httpOnly cookie, then refreshes the router. Sketch of a `'use client'` component:

```tsx
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { firebaseAuth } from '@/lib/firebase/client-auth'
import { establishSession } from '@/lib/auth/client'

const router = useRouter()

async function login(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password)
  const idToken = await cred.user.getIdToken()
  await establishSession(idToken) // POST /api/auth/session -> sets httpOnly cookie
  router.refresh() // REQUIRED: drop Router Cache so server sees the session
}
```

Logout is the mirror image — `revokeSession()` (DELETE), then `router.refresh()`. Both
halves live behind `useSignOut` (`lib/auth/use-sign-out.ts`), because a screen that
looks signed out while the account is still reachable is the invisible failure of doing
only one of them.

`proxy.ts` preserves the path a signed-out reader was aiming for as `?next` (pathname +
query), and the login form sends them there on success instead of always landing on
`/dashboard`. The value is validated through `safeInternalPath` (`lib/safe-path.ts`,
default `/dashboard`), so a crafted `?next` (`//evil.com`, a protocol-relative or
absolute URL) cannot turn login into an open redirect.

Server side, `POST` verifies the ID token before minting (`verifyIdToken`), then
`createSessionCookie` and sets the cookie with `SECURE_COOKIE_ATTRIBUTES` (`httpOnly`,
`sameSite: 'lax'`, `path: '/'`, and `secure` **only in production**) plus a 5-day
`maxAge`. Both cookie-mutating handlers run the CSRF origin check first, and both are
answered through the API envelope — those rules belong to
`docs/reference/contracts/http-api.md`.

## How to guard a page

Guards live in server components / route handlers only (`session.ts` and `guards.ts`
are `server-only`). Call one at the top of the protected entry point:

- `requireReadySession()` — the default for a protected page with no capability of its
  own: authenticated **and** not owing a mandatory password change.
- `requireCapability(cap)` — a ready session **and** `can(session, cap)`, else a
  redirect to the path for the denial.
- `requireSession()` — authentication only. For the entry points that legitimately must
  not redirect a password-owing user elsewhere (logout, session refresh, the
  password-change path itself); `structure:check`'s `ready-session-boundary` keeps that
  list from growing quietly.

```tsx
// app/admin/page.tsx (server component)
import { requireCapability } from '@/lib/auth/guards'

export default async function AdminPage() {
  const session = await requireCapability('admin:access')
  return <p>Hello {session.email}</p>
}
```

`authorizeSession(capability)` is the shared core underneath. It asks **three**
questions in a load-bearing order — is there a session, is it READY, does the
deployment plus the role grant the capability — and it REPORTS rather than redirects,
because the four boundaries answer a refusal differently. A page redirects, a form
action redirects elsewhere (`pathForDenial`), a server action returns an envelope, and
a download route must answer a status code (a 307 to `/login` saved as `assets.csv` is
a login page with a spreadsheet's name, not a refusal).

Readiness is checked **before** the capability, so an account owing a password change is
told to change it rather than told it lacks permission — an admin's role would satisfy
the capability check and let them straight through. A capability the DEPLOYMENT has
turned off (`capability-availability.ts`) is refused before the role is consulted, so it
is unreachable by anyone rather than proceeding and failing later, deep inside the
feature, on a credential the deployment deliberately never configured.

Prefer capability checks over role checks — they survive adding new roles.
`proxy.ts` only bounces cookie-less requests off private paths; it is an optimization,
not the gate. `cookies.has()` is the whole check there, so `session=totally-forged`
walks straight past it. A 401 from the proxy means "you sent no cookie" — it never
means "your cookie is bad". The DAL guard is the real authorization boundary, so never
read "the gate already returns 401" as licence to drop a handler's own check.

## The sidebar reflects the guards — it does not enforce them

Nav visibility is DERIVED from the same RBAC grant table the page guards read, and it
is UX only. Application composition (`app/navigation.ts`) declares each item's OWN
`capability` — the one the destination page guards on, or `null` for "any signed-in
session" (the dashboard) — and the shared shell's `filterNavByRole(sections, role)`
(`components/shell/nav-config.ts`) keeps an item iff `roleCan` grants it. So the nav
filter and the page boundary read one policy and cannot disagree about who a role can
reach.

There is **no route→capability registry** and no `requirePageAccess`: a page states
its own guard with an explicit `requireCapability(...)` / `requireReadySession()` call
at the top, and the nav item names the matching capability beside its link. Hiding a
link the reader could still reach by typing its URL is not a leak — the page's own DAL
guard is the only thing that authorizes, so **never treat a missing nav item as a
permission check**. (`/admin` is exactly such a case: a `requireCapability('admin:access')`
route with no sidebar item — impersonation reaches it from the user dropdown.)

## How to extend roles / capabilities

All RBAC is data in `rbac.ts` — edit these, keep them in sync:

- Add the role string to `ROLES`.
- Add its human label to `ROLE_LABEL`. `Record<Role, string>` is the trick, not
  decoration: a missing label is a compile error, so a raw role string can never reach
  the UI.
- Add the capability string to `CAPABILITIES` (convention: `domain:action`).
- Grant capabilities to roles in `ROLE_CAPABILITIES` (every role must have an entry;
  it is typed `Record<Role, …>`).
- State the same grant in `EXPECTED_GRANTS` (`lib/auth/rbac.test.ts`) — the one place
  outside `rbac.ts` that must move with it. It is restated by hand on purpose: `admin`
  is `[...CAPABILITIES]` here, so a derived expectation would agree with the
  implementation by construction and assert nothing. `pnpm test:unit` fails until you
  say who holds the new capability.

Name a capability after user-facing AUTHORITY, not after where a demo happens to live,
and split two authorities that merely coincide today. `impersonation:start` is kept
distinct from `admin:access` — "may act as another user" and "may open the admin
console" are different powers — and `admin:users:read`, `admin:users:manage` and
`admin:audit:read` are three separate grants for the same reason: reading the directory
is a helpdesk job, handing out and taking away access is not, and watching the
administrators is a third. Collapsing any pair would make a read-only support role
impossible without a code change.

Roles are carried in a Firebase **custom claim** named `role`; `roleFromClaims` is the
ONE place "what role is this account" is decided, so a decoded session token and a live
`UserRecord` can never disagree — a missing, misspelled, or hand-forged claim lands on
`user` everywhere, never on whatever the caller assumed. To assign a role, write the
claim through `setAccountClaims` and follow layer 2:

```ts
await setAccountClaims(uid, { role })
await revokeSessionsNow(uid) // force stale sessions to re-mint
```

The affected user must re-authenticate before the new role takes effect.

## Caveat: logout is clear-only

`DELETE /api/auth/session` deletes the session cookie (and the impersonation ticket)
from the current browser — it does **not** call `revokeRefreshTokens`, and it does not
revoke the session cookie itself. Consequence: a cookie that was copied/leaked
**before** logout stays valid until it expires — logging out does not kill other copies.

Clearing the impersonation ticket on the same request is load-bearing rather than
tidy-up: the ticket is bound to the ADMIN's uid and outlives nothing else, so leaving it
would let the admin's next sign-in inside its TTL silently RESUME the overlay — signing
out would not actually end impersonation.

The clear-only trade is deliberate (cheap, no Admin round-trip on every logout). The
leak window is bounded by:

- `httpOnly` — JS can't read the cookie, so XSS can't exfiltrate it.
- `secure` in production — never sent over plain HTTP.
- `sameSite: 'lax'` — not sent on cross-site subrequests.
- 5-day `maxAge` (`SESSION_MAX_AGE_MS`) — the hard cap on a stolen cookie's life.

If you need true "kill all sessions now" logout, call `revokeSessionsNow(uid)` on
`DELETE` (like layer 2) and accept the extra round-trip. For most apps the short maxAge
is the intended mitigation.
