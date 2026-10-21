# How a request becomes a write

One walk through the whole path — gate, cookie, DAL, then the write to `aisa-api` — and
why each stage is where it is. The rules each stage must obey live in
[auth](../reference/contracts/auth.md),
[http-api](../reference/contracts/http-api.md) and
[data](../reference/contracts/data.md); this file explains the shape they sit in.

The single idea: **each concern has exactly one server-authoritative boundary, and
everything upstream of it is treated as hostile.** Layers upstream exist for speed and for
user experience, never for safety. That is what makes the system safe to extend — adding a
page cannot accidentally add an unguarded surface, because the page was never the guard.

## 1. The gate is optimistic, and says so

`proxy.ts` checks only that a session cookie is **present**. It does not verify it and
never will. So a 401 or a redirect from the gate means "you sent no cookie" — it never
means "your cookie is bad", and a forged cookie walks straight past.

Deliberate, for two reasons. Verifying at the gate would mean recomputing a signature on
every request including static assets, to produce an answer the DAL is about to produce
again anyway. And a gate that _looks_ authoritative is worse than one that is obviously
not: someone would eventually rely on it and skip the real check.

It does make one distinction that is not about safety but about honesty. API paths get the
JSON error envelope; page paths get a redirect to the login screen. Sending a redirect in
answer to a `fetch` would hand the caller login HTML at status 200 — the client cannot tell
that from success, so it renders a page built on garbage.

It also carries the reader's intended destination forward so login can return them there
instead of dumping everyone on the dashboard. That value comes from the URL, which makes it
an open-redirect vector, so it is validated rather than trusted — the same reason any
caller-supplied return path in this codebase is run through the shared path validator
before it is used.

## 2. Firebase sign-in, one session cookie

Each manager has a Firebase account. The login form signs in with the Firebase web SDK —
browser straight to Google, so the password never reaches this app — and posts the
resulting ID token to the session route, which verifies it and asks Firebase for a
session cookie. That cookie is set httpOnly: nothing in the browser holds a trusted
identity, and no script can read the cookie.

The cookie is a Google-signed token carrying the account's `role` claim. The server
verifies it on every request WITH a revocation check, so revoking an account's tokens or
disabling it ends its sessions before the cookie expires. The cookie's attributes — same
site, path, a five-day lifetime, and secure in production — bound how long a leaked one is
worth anything otherwise.

Because the cookie is set by an API route rather than by a render, the client's cached
server HTML is stale the instant login or logout succeeds. Refreshing the router afterwards
is the caller's job, and skipping it produces the classic bug where the app is signed in
but still showing the signed-out shell.

## 3. The DAL is the real "who is acting"

`lib/auth/session.ts` verifies the cookie with Firebase Admin (signature, expiry,
revocation) and maps it to a session with the account's uid, email and role. **This is
the boundary.** An unreachable provider throws rather than reading as "signed out".
Everything before it was routing; everything after it can rely on an identity.

Three consequences worth understanding rather than memorising:

- **Verification is deduped per render, not cached across requests.** A page, its layout
  and every leaf ask for the session independently, and a request-scoped cache collapses
  that into one verification. Caching it any wider would mean caching an identity — which
  is how one reader's data ends up in another reader's response.
- **Reading the cookie forces dynamic rendering**, and that is a feature. It is what
  guarantees a fresh verification instead of a page baked at build time with somebody's
  session inside it.
- **The role rides in the signed token.** It is fixed when the cookie is minted, so a
  change to an account's `role` claim reaches an existing browser only at its next
  sign-in — or sooner if the account's tokens are revoked, which ends the session.

Guards (`requireSession`, `requireCapability`) sit on top and answer the authorization
question. They **redirect** rather than throw, because on a page the correct outcome of "you
may not see this" is a login screen or a 403 screen — not an error boundary. Route handlers
must not use them for exactly the same reason the gate distinguishes API from page paths: a
redirect is the wrong answer to a `fetch`.

Authorization itself is capability-based, not role-based, at every call site. Capabilities
describe user-facing authority, so a new role is a change to one grant table rather than a
sweep through every guard. Sidebar visibility is **derived from that same grant table** and
is UX only — it hides links a role cannot use, and hiding a link has never protected
anything. There is deliberately no route-to-capability registry: each page states its own
guard, which is why a guarded route can exist with no sidebar entry at all.

## 4. Writes leave through `aisa-api`; reads stay here

Past the identity boundary, the dashboard does not write Firestore at all. Every AISA
mutation is a server action in `features/aisa/aisa.action.ts` that gates on a capability,
validates its input, calls the Python `aisa-api` with the shared `X-AISA-Key` header, and
revalidates the affected paths. The key stays on the server; the browser only ever talks
to the action. The action never throws across the boundary back into a React tree; it
returns a result the UI can render.

Reads go the other way: server components read Firestore directly through the Admin SDK,
via the feature's typed collection accessor and repo. The Firestore rules deny every
browser request, so these server reads are the only way data reaches the page.

The starter's general `schema → repo → action` path — one Zod schema owning shape, a thin
repo owning Firestore access, an action owning the mutation — still exists for a feature
that writes Firestore itself (`features/_template/`), and its rules are owned by
[data](../reference/contracts/data.md). That contract also owns the one failure mode no
local check catches: a query that filters on one field and sorts on another needs a
composite index the emulator does not require.

## 5. The mirror path: reads out through HTTP

Not every read goes through a server component. Route handlers serve the browser and
external callers, and each one is a real security boundary that re-checks auth even when a
page already did — because "a page already did" is a fact about a different request.

They answer one envelope shape so a client has one thing to parse and one place to look
when something fails, and a correlation id ties a rendered error back to a server log
line. The rules are owned by [http-api](../reference/contracts/http-api.md); the reason
they are worth the ceremony is that a route handler is the surface most likely to be
called by something that is not this app.
