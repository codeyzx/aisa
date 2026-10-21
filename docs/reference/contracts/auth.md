# Auth contract

- Type: Normative contract (reference)
- Owns: the server-authoritative "who is acting" boundary — the Firebase email/password sign-in, the Firebase session cookie, the session DAL, the RBAC grant table, and the guards every protected entry point calls
- Source of truth: `lib/auth/**` (`constants.ts`, `session.ts`, `session.contract.ts`, `token-rejection.ts`, `guards.ts`, `rbac.ts`, `capability-availability.ts`, `cookie-options.ts`, `client.ts`, `use-sign-out.ts`), `lib/firebase/admin-auth.ts`, `lib/firebase/client-auth.ts`, `app/api/auth/session/route.ts`, `app/login/login-form.tsx`, `proxy.ts`
- Verified by: `pnpm check:static && pnpm test` (the colocated `lib/auth/*.test.ts` suites), then a driven sign-in / sign-out in a browser — a green static chain does not prove a cookie was set
- Read when: you are about to resolve, guard, or extend an identity — a new protected page, a new role or capability, or a change to how the manager signs in
- Does not define: the HTTP envelope, the sign-in rate limit, and the CSRF origin rule the session route uses (`docs/reference/contracts/http-api.md`)

Firebase Authentication (email/password) and a Firebase **session cookie**. Each
person has a Firebase account; their role is the `role` custom claim on it. The browser
signs in with the Firebase web SDK, trades the resulting ID token for an httpOnly
session cookie once, and from then on never holds a trusted identity — every "who is
acting" decision happens server-side in `getSession`.

## Files

- `lib/auth/constants.ts` — the shared surface: `SESSION_COOKIE` (`'session'`),
  `SESSION_MAX_AGE_MS` (5 days), `PUBLIC_PREFIXES` (`/login`, `/api/auth`,
  `/api/health`) with the segment-aware `isPublicPath`.
- `lib/auth/session.ts` — the DAL. `getSession()`, `requireSession()`.
- `lib/auth/token-rejection.ts` — `isDefinitiveTokenRejection()`: which Firebase
  verification failures mean "bad cookie" (sign in again) versus "provider
  unreachable" (do not sign anyone out).
- `lib/auth/session.contract.ts` — the pure `Session` type, so a client component can
  name a `Session` without dragging server-only code into the browser bundle.
- `lib/auth/guards.ts` — `authorizeSession()`, `requireReadySession()`,
  `requireCapability()`, `pathForDenial()`.
- `lib/auth/rbac.ts` — `ROLES`, `ROLE_LABEL`, `CAPABILITIES`, `can()`, `roleCan()`,
  `isRole()`, `roleFromClaims()`.
- `lib/auth/capability-availability.ts` — capabilities a DEPLOYMENT has switched
  off, which is a different question from what a role grants. Empty today.
- `lib/auth/cookie-options.ts` — `SECURE_COOKIE_ATTRIBUTES`, the shared safety
  baseline for the auth cookie.
- `lib/auth/client.ts` — client fetch wrappers: `establishSession(idToken)`,
  `revokeSession()`.
- `lib/auth/use-sign-out.ts` — the sign-out hook: clears the cookie AND signs the
  Firebase web SDK out.
- `lib/firebase/client-auth.ts` — the browser's Firebase Auth handle (connects the
  Auth emulator when `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` is inlined).
- `lib/firebase/admin-auth.ts` — the server's Firebase Admin Auth handle, and the
  identity its calls run as (see "Which identity the server's Auth calls use").
- `app/api/auth/session/route.ts` — `POST` trades an ID token for the cookie,
  `DELETE` clears it.
- `proxy.ts` — optimistic request gate that checks cookie presence (no
  verification). Next 16's proxy defaults to the Node runtime and the `runtime`
  config option is unavailable there, so any "edge-safe imports only" rule you are
  carrying is Next 15 folklore.

## The session cookie

`POST /api/auth/session` verifies the ID token (`verifyIdToken`, a local JWT check)
and then calls Firebase `createSessionCookie` with a `SESSION_MAX_AGE_MS` (5-day)
lifetime. The cookie is a Google-signed JWT; this app holds no signing key.

`getSession()` reads the `session` cookie and calls
`verifySessionCookie(cookie, checkRevoked = true)`. `checkRevoked` costs one
`accounts:lookup` per render pass, and it is what makes revoking an account's refresh
tokens, or disabling the account, end its sessions before the cookie expires. The
decoded token maps to `{ uid, email, emailVerified, role }`, with `role` from
`roleFromClaims` — a missing or unknown claim is the least-privileged `user`, never
`admin`.

A failure is split two ways (`token-rejection.ts`): a DEFINITIVE rejection (expired,
revoked, malformed, disabled, user gone) is `null` — "not signed in". Anything else —
the provider unreachable, a permission error, an unknown code — THROWS, so an outage
surfaces as "temporarily unavailable" and leaves the cookie intact, instead of
signing every reader out.

### Which identity the server's Auth calls use

`createSessionCookie` and the lookup behind `checkRevoked` need `firebaseauth.*`
permissions. Firestore keeps running as the ADC identity (on Cloud Run, the runtime
service account); Auth runs as that identity too unless
`FIREBASE_AUTH_SERVICE_ACCOUNT` is set. When it is, `admin-auth.ts` gives Auth its
own Admin app whose credential impersonates that account through IAM Credentials
`generateAccessToken`. That is for a runtime that holds no `firebaseauth.*` role and
may not mint a key: point it at the project's Firebase Admin SDK service account and
grant the runtime `roles/iam.serviceAccountTokenCreator` on that one account. Without
either, `POST /api/auth/session` fails with the provider's `INSUFFICIENT_PERMISSION`
and nobody can sign in. Against the emulator none of this applies.

### Accounts and roles live in Firebase

There is no in-app account management. Accounts are created, disabled and given a
`role` claim (`{"role":"admin"}` or `{"role":"user"}`) outside the app, by someone
with Firebase Auth admin rights — the Admin SDK's `createUser` /
`setCustomUserClaims`, or the Identity Toolkit REST API. A claim change reaches a
session only when a new cookie is minted (the next sign-in), because the cookie
carries the claims it was minted with. Locally, `pnpm seed` creates
`scripts/_seed-users.ts`'s accounts in the Auth emulator.

## Caching and safety rules

1. **Verification is deduped by React `cache()`** — `getSession` is wrapped in
   `cache()`, so layout + page + every leaf share one verification per render pass.

2. **Reading `cookies()` forces dynamic rendering** — `getSession` calls `cookies()`
   from `next/headers`, which opts any route that (transitively) uses it into
   per-request dynamic rendering. Do **not** wrap a session-dependent route in
   `force-static` / `unstable_cache` — you would freeze one request's identity into the
   page.

3. **Client `router.refresh()` after sign-in/sign-out** — the cookie is set/cleared by
   an API route, but the client Router Cache still holds server-rendered HTML from
   before. After `establishSession()` (POST) **or** `revokeSession()` (DELETE) resolves,
   the caller **must** `router.refresh()`. The `client.ts` helpers do not do this for
   you — the login form and the user menu's sign-out
   (`components/shell/user-menu.tsx`) own it.

4. **Never `unstable_cache` session-scoped data without the uid in the key** — a bare
   `unstable_cache` entry is shared across all visitors. If you must persist-cache
   per-user data, include `session.uid` in the cache key **and** the tags.

## How sign-in works

`app/login/login-form.tsx` has an email and a password field. On submit it calls
`signInWithEmailAndPassword` — browser straight to Google, so the password never
reaches this app's origin — then `establishSession(idToken)`, which posts `{ idToken }`
to `POST /api/auth/session`, then `router.refresh()` and navigates on. If the session
POST fails after Firebase sign-in succeeded, the form signs the SDK out again, so a
failed sign-in leaves no refresh token behind.

The route, in order: rejects a cross-site caller (`isSameOrigin`), validates the body,
verifies the ID token (a definitive rejection answers `UNAUTHENTICATED` 401; an
unreachable provider answers through the error normalizer, never 401), takes one token
from the per-uid mint budget (10 per minute on `session:<uid>`), and mints the cookie.
It sets the `session` cookie with `SECURE_COOKIE_ATTRIBUTES` (`httpOnly`,
`sameSite: 'lax'`, `path: '/'`, and `secure` **only in production**) plus a 5-day
`maxAge`. Both cookie-mutating handlers are answered through the API envelope — those
rules belong to `docs/reference/contracts/http-api.md`.

Wrong passwords never reach this route, so it does not guard credentials: Firebase
throttles password guessing itself (`auth/too-many-requests`, which the form shows as
"too many attempts").

`proxy.ts` preserves the path a signed-out reader was aiming for as `?next` (pathname +
query), and the login form sends them there on success instead of always landing on
`/dashboard`. The value is validated through `safeInternalPath` (`lib/safe-path.ts`), so
a crafted `?next` (`//evil.com`, a protocol-relative or absolute URL) cannot turn login
into an open redirect.

## How to guard a page

Guards live in server components / route handlers only (`session.ts` and `guards.ts`
are `server-only`). Call one at the top of the protected entry point:

- `requireReadySession()` — the default for a protected page with no capability of its
  own: a verified session. With no password-change state it is exactly
  `requireSession()`, kept as the one sanctioned wrapper so `structure:check`'s
  `ready-session-boundary` keeps the raw DAL reachable from one place.
- `requireCapability(cap)` — a session **and** the capability, else a redirect to the
  path for the denial (`/login` or `/403`).

```tsx
// app/(app)/tren/page.tsx (server component)
import { requireCapability } from '@/lib/auth/guards'
import { AISA_READ } from '@/features/aisa/aisa.capability'

export default async function TrenPage() {
  await requireCapability(AISA_READ)
  // ...
}
```

`authorizeSession(capability)` is the shared core underneath. It asks, in order, is
there a session, has the deployment enabled the capability, and does the role grant
it — and it REPORTS rather than redirects, because the boundaries answer a refusal
differently. A page redirects, a form action redirects elsewhere (`pathForDenial`), a
server action returns an envelope, and a download route must answer a status code.

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
session" — and the shared shell's `filterNavByRole(sections, role)`
(`components/shell/nav-config.ts`) keeps an item iff `roleCan` grants it. So the nav
filter and the page boundary read one policy and cannot disagree about who a role can
reach.

There is **no route→capability registry**: a page states its own guard with an
explicit `requireCapability(...)` / `requireReadySession()` call at the top, and the
nav item names the matching capability beside its link. **Never treat a missing nav
item as a permission check.**

## How to extend roles / capabilities

The capabilities are `aisa:read`, `aisa:respond` and `aisa:configure` (declared for the
feature in `features/aisa/aisa.capability.ts`). `admin` holds all three; `user` holds
`aisa:read`. The role comes from the account's `role` custom claim.

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
  implementation by construction and assert nothing.

Name a capability after user-facing AUTHORITY, not after where a screen happens to
live, and split two authorities that merely coincide today — `aisa:respond` (act on a
proposal) and `aisa:configure` (change the scoring rules, stop the AI runtime) are
separate for that reason.

## Caveat: logout is clear-only

Signing out (`useSignOut`) deletes the session cookie (`DELETE /api/auth/session`) AND
signs the Firebase web SDK out, so the browser keeps no refresh token to mint a new ID
token from. It does not revoke anything server-side: a cookie that was copied or
leaked **before** logout stays valid until it expires. The window is bounded by:

- `httpOnly` — JS can't read the cookie, so XSS can't exfiltrate it.
- `secure` in production — never sent over plain HTTP.
- `sameSite: 'lax'` — not sent on cross-site subrequests.
- 5-day `maxAge` (`SESSION_MAX_AGE_MS`) and the token's own `exp` — the hard cap on a
  stolen cookie's life.

To end one account's sessions now, revoke its refresh tokens (Admin SDK
`revokeRefreshTokens(uid)`) or disable it: `checkRevoked` rejects every cookie minted
before that on the next request.
