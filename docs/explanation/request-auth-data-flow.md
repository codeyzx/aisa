# How a request becomes a write

One walk through the whole path — gate, cookie, DAL, then `schema → repo → action` — and
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

Deliberate, for two reasons. Verifying at the gate would mean an Admin SDK round trip on
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

## 2. The cookie exists so the password never touches this origin

Sign-in happens between the browser and Firebase: the password goes browser → Google, and
this app never sees it. What arrives here is an already-verified ID token, which the session
route exchanges for an httpOnly cookie.

The exchange is the point. An ID token is short-lived and lives in JavaScript's reach; an
httpOnly cookie is not readable by script and is what server components can act on without
a client round trip. Minting is a real verification, and the cookie's own attributes — same
site, path, lifetime, and secure in production — are what the rest of the chain assumes.

Because the cookie is set by an API route rather than by a render, the client's cached
server HTML is stale the instant login or logout succeeds. Refreshing the router afterwards
is the caller's job, and skipping it produces the classic bug where the app is signed in
but still showing the signed-out shell.

## 3. The DAL is the real "who is acting"

`lib/auth/session.ts` verifies the cookie with the Firebase Admin SDK, checking revocation
rather than expiry alone, and maps it to a session object. **This is the boundary.**
Everything before it was routing; everything after it can rely on an identity.

Three consequences worth understanding rather than memorising:

- **Verification is deduped per render, not cached across requests.** A page, its layout
  and every leaf ask for the session independently, and a request-scoped cache collapses
  that into one verification. Caching it any wider would mean caching an identity — which
  is how one reader's data ends up in another reader's response.
- **Reading the cookie forces dynamic rendering**, and that is a feature. It is what
  guarantees a fresh verification instead of a page baked at build time with somebody's
  session inside it.
- **Revocation is only as good as the claims change that triggers it.** Changing a role
  without revoking leaves the old cookie carrying the old claims until it expires on its
  own. The check is there; the discipline of pairing the two is the part a fork has to
  keep.

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

Impersonation crosses this boundary on purpose and is the highest-risk surface in the
repo — read [impersonation](../reference/contracts/impersonation.md) before touching it,
never the code first.

## 4. `schema → repo → action`

Past the identity boundary, the write path has three parts and one direction.

- **The schema owns shape.** One Zod schema per entity, and everything downstream derives
  from it — the read converter that hydrates documents, the form's field types, the export
  columns. This is why adding a field is usually a one-file change: nothing else keeps a
  second copy of the shape to update.
- **The repo owns Firestore access, and is thin.** It is the only place an entity's
  documents are read or written, but it earns functions rather than collecting them: what
  belongs here is what genuinely needs render-scoped dedupe, cursor pagination, or a
  transaction. A one-off read belongs at its call site, built on the typed collection
  accessor, because a repo that grows a method per screen becomes a second query API that
  is worse than the one Firestore already has.
- **The action owns the mutation.** It gates on a capability, validates its input, calls
  the repo, writes an audit record, and revalidates the affected paths — in that order.
  It never throws across the boundary back into a React tree; it returns a result the UI
  can render.

**The repo trusts its callers, and that is only true because the actions above it
validate.** That is a system property, not a local one: it is the reason a repo has no
defensive re-parsing, and the reason writing to a repo from anywhere except an action
quietly breaks the model.

Two things about this path are not visible from reading the code alone. Access to a
collection is bound to a feature-owned path so no consumer ever spells a path literal
twice. And a query that filters on one field and sorts on another needs a composite index
that the emulator does not require — so it passes every local check and fails only in
production. That failure mode, and the guard for it, are owned by
[data](../reference/contracts/data.md), and it is the single most common way a change that
looks finished is not.

## 5. The mirror path: reads out through HTTP

Not every read goes through a server component. Route handlers serve the browser and
external callers, and each one is a real security boundary that re-checks auth even when a
page already did — because "a page already did" is a fact about a different request.

They answer one envelope shape so a client has one thing to parse and one place to look
when something fails, and a correlation id ties a rendered error back to a server log
line. The rules are owned by [http-api](../reference/contracts/http-api.md); the reason
they are worth the ceremony is that a route handler is the surface most likely to be
called by something that is not this app.
