# HTTP API contract

- Type: Normative contract (reference)
- Owns: the whole HTTP surface — when a route handler is allowed to exist, the response envelope, the closed error taxonomy, the correlation id, the rate limiter, the CSRF origin check, and the security-header baseline
- Source of truth: `lib/api/**` (`envelope.ts`, `errors.contract.ts`, `errors.normalize.ts`, `cid.ts`, `response.ts`, `client.ts`), `lib/http/**` (`index.ts`, `origin.ts`), `next.config.ts`'s `headers()`, `proxy.ts`, and the handlers under `app/api/**/route.ts`
- Verified by: `pnpm check:static && pnpm test` (the colocated `lib/api/*.test.ts` and `lib/http/*.test.ts` suites, including `errors.contract.test.ts`'s hand-restated status table), then a driven request against the production container — the origin check below shipped broken past every static gate
- Read when: before adding or changing anything under `app/api/**`, before adding an error code, before metering a route, and before touching a security header
- Does not define: server actions and the `ActionResult` contract (`docs/reference/contracts/data.md`); who is allowed to do a thing (`docs/reference/contracts/auth.md`); how a download route builds its bytes (`docs/reference/contracts/export.md`)

The contract for HTTP route handlers (`app/api/**/route.ts`) — the response
envelope, the error taxonomy, the correlation ID, the typed client fetcher, the
rate limiter, and the baseline every response carries. Read the boundary section
below FIRST, because most of the time you should not be adding a route handler.

## The boundary: server action or route handler?

**Start here — this is the dominant fork this module raises.** Most "I need an API
route" instincts are really a server action; a route handler earns its envelope
only when HTTP itself is the requirement. The rule:

> **Default to a server action (`runAction` / `runFormAction`). Reach for a route
> handler + envelope ONLY when HTTP itself is the requirement. Never expose the
> same operation through both.**

Answer it before writing code. `ActionResult` (`lib/data/action-result.ts`) and `ApiResponse`
(`lib/api/envelope.ts`) are both discriminated `ok`-tagged results, and the
resemblance is deliberate — it is one idiom you learn once. They are **not two
ways to do one job**; they are one idiom over two different transports, and the
transport picks the tool:

- **`ActionResult` is the RSC-boundary contract.** The caller is always our own
  React code, reached through React's server-action RPC. There is no status line
  to read, no header to echo, no second consumer to keep compatible. It is
  auth-gated and capability-checked BY the wrapper (`runAction(capability, fn)`).
- **`ApiResponse` is the HTTP-boundary contract.** The caller may be anything
  that speaks HTTP, and it acts on the status line. It carries a `cid` on EVERY
  response because a request that crossed the network needs to be findable in a
  log. Gating is NOT in the wrapper — see "Gating" below.

`ActionResult` carries a `cid` too, but only on **`internal`**, and the asymmetry
is the point. Every other code names its own cause and its own remedy, so an id
would be noise; `internal` is opaque by design, which otherwise leaves the person
reporting it with nothing to quote and an operator searching by timestamp. The
reference is composed into `error` by `actionError` — the surfaces that render a
failure string get it without being edited — and what the reader sees is the
first segment of the `cid` the envelope carries, so grepping what they quoted
finds the line.

Use a **route handler + envelope** only when at least one is true:

- The caller is not our React app — a webhook, a mobile client, another service,
  `curl`.
- The caller must act on the HTTP status: distinguish 401 from 403, back off on
  429/503, honour a redirect.
- The response is not a plain JSON RPC result — a file download, a stream, a
  cache-controlled `GET`, a non-JSON content type.
- The call cannot originate from a React event — `navigator.sendBeacon`, a
  service worker, a `<form>` posting to an external target.

Otherwise use a **server action**. If both genuinely fit, the server action wins:
it is fewer moving parts and it cannot drift from its caller.

- **MUST NOT** add a route handler as an "API for our own frontend" when a server
  action would do. That is the overlap this rule exists to prevent.
- **MUST NOT** wrap a server action in a route handler, or vice versa. If one
  operation truly needs both transports (rare), extract a shared core function
  and let each entry point call it — the same rule
  `docs/reference/contracts/data.md` applies to `<verb>Action` vs
  `<verb>FormAction`.
- **MUST NOT** use `ActionResult` from a route handler or `ApiResponse` from a
  server action.

## The envelope

Every route handler answers with exactly one of these shapes:

```jsonc
// success — always has `data` (`null` when there is no content)
{ "ok": true, "cid": "9f1c…", "data": { "id": "abc" } }

// failure — always has `error.code` and `error.message`
{ "ok": false, "cid": "9f1c…", "error": { "code": "NOT_FOUND", "message": "Not found" } }
```

`cid` is echoed on the `x-correlation-id` header too, so a proxy log can join on
it without parsing the body. Every envelope also carries `Cache-Control: no-store`,
set in the one private `jsonResponse` helper so no route can forget it — envelopes
are per-request and most are per-session.

Server side (`lib/api/response.ts`) — these return a `Response`:

- `apiOk(request, data)` / `apiOk(request, data, 201)` — success.
- `apiFail(request, code, details?)` — a KNOWN, EXPECTED failure.
- `apiFailFrom(request, error)` — an UNEXPECTED throw: normalise, log, answer.
- `apiFailFromDenial(request, denial)` — an authorization denial from
  `authorizeSession`, mapped into the closed wire taxonomy.

Client side (`lib/api/client.ts`, `lib/api/envelope.ts`):

- `apiFetch<T>(input, init?)` — typed fetch. **Never throws**; always resolves to
  an `ApiResponse<T>`.
- `unwrap(response)` — returns `data` or throws `ApiCallError` (carrying `code`
  and `cid`). For exception-based callers only — composing
  `unwrap(await apiFetch(...))` at the call site is the canonical use.

A canonical route:

```ts
import { apiFail, apiFailFrom, apiOk } from '@/lib/api/response'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return apiFail(request, 'UNAUTHENTICATED')
  if (!can(session, 'asset:write')) return apiFail(request, 'PERMISSION_DENIED')

  const parsed = BodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return apiFail(request, 'INVALID_ARGUMENT', z.treeifyError(parsed.error))
  }

  try {
    return apiOk(request, await doTheThing(session, parsed.data))
  } catch (error) {
    return apiFailFrom(request, error)
  }
}
```

### MUST / MUST-NOT

- **MUST** answer with `apiOk` / `apiFail` / `apiFailFrom` — never a bare
  `Response.json(...)` or `NextResponse.json(...)` from a route that is part of
  this contract. A hand-rolled body is a route that quietly speaks its own
  dialect, and `apiFetch` will report it as `UNAVAILABLE`. The one sanctioned
  exception is a route whose SUCCESS is bytes rather than JSON — a streamed
  download structurally cannot ride `Response.json` — and even there every
  FAILURE still goes through `apiFail`, because a plain `<a download>` navigation
  saves whatever the server sends.
- **MUST** take the status from the code. `apiFail` derives it from
  `API_ERROR_STATUS`; never pass a hand-picked status alongside a code.
- **MUST** wrap the fallible body in `try/catch` and end it with `apiFailFrom`.
  An uncaught throw becomes Next's own 500 — no envelope, no cid, and the client
  gets HTML where it expected JSON.
- **MUST** parse route-handler query strings with native `URLSearchParams` or
  `request.nextUrl.searchParams`, then reject repeated scalar keys before schema
  validation. Nuqs is for application page URL contracts, not fail-closed HTTP
  input.
- **MUST NOT** put a caught error, an SDK message, or a stack into `details`.
  `details` is client-visible and caller-chosen. `apiFailFrom` never populates it
  for exactly this reason; the raw error goes to the server log keyed by cid.
  Legitimate `details`: zod field errors on a 400, a `retryAfter` on a 429.
- **MUST NOT** add an error code without adding its message and status in
  `lib/api/errors.contract.ts`. A code is a contract with clients;
  `errors.contract.test.ts` restates the status table by hand and will fail until
  you do.
- **MUST NOT** trust `apiFetch`'s `T`. It is asserted, not validated — it trusts
  our own server. If the route is not ours, parse `res.data` with a zod schema.

## The error taxonomy

Nine codes, closed on purpose, named after the gRPC/Firestore statuses the
Firebase SDKs already speak so the mapping is a rename and not a reinterpretation.

| Code                 | Status | Use when                                             |
| -------------------- | ------ | ---------------------------------------------------- |
| `UNAUTHENTICATED`    | 401    | No session, or a token that cannot be used           |
| `PERMISSION_DENIED`  | 403    | Authenticated but not allowed                        |
| `INVALID_ARGUMENT`   | 400    | The caller's input is wrong (zod failure)            |
| `NOT_FOUND`          | 404    | The addressed thing does not exist                   |
| `ALREADY_EXISTS`     | 409    | Uniqueness conflict                                  |
| `RESOURCE_EXHAUSTED` | 429    | Rate/quota limit hit                                 |
| `DEADLINE_EXCEEDED`  | 504    | The work did not finish in time                      |
| `UNAVAILABLE`        | 503    | Transient — retrying may work (also: client offline) |
| `INTERNAL`           | 500    | Our fault, and the caller can do nothing about it    |

The taxonomy is deliberately SMALLER than the set of internal denials. A session
owing a mandatory password change lands on `PERMISSION_DENIED` rather than earning
a wire code of its own: an HTTP client's remedy is identical either way, and only
the human in the browser can act on the distinction — which they meet as the
page-level redirect instead.

`normalizeError(error)` maps any throw into it: zod first, then a Firebase `code`
(string like `permission-denied` / `auth/id-token-expired`, **or** the raw gRPC
number the Admin SDK actually throws), then `INTERNAL`. Two mappings are
judgement calls worth knowing:

- **`failed-precondition` → `INTERNAL` (500), not 400.** Its overwhelmingly
  common cause here is a missing composite index (see
  `docs/reference/contracts/data.md`). That is an operator mistake. A 400 would
  blame the caller for our undeployed index and hide the fault from anyone
  reading status codes.
- **`aborted` / `cancelled` → `UNAVAILABLE` (503).** Transaction contention that
  survived the SDK's own retries is "try again later", not a bad request.

## Gating

Route handlers gate **inline** — `apiFail(request, 'UNAUTHENTICATED')` /
`apiFail(request, 'PERMISSION_DENIED')`, or `apiFailFromDenial` when they resolve
authorization through `authorizeSession` — and are NOT wrapped the way
`runAction(capability, fn)` wraps an action. This is deliberate:

- **MUST NOT** use `requireCapability` in a route handler. It guards by
  `redirect()`, and a 307 to `/login` in answer to a `fetch` is useless — the
  caller sees login HTML as a 200.
- A route handler is a public endpoint and is the real security boundary. It
  re-checks auth server-side even when a page already did.

There is no `runRoute` wrapper on purpose: unlike actions, routes vary in what
they gate on (some are unauthenticated webhooks verified by signature, some check
a capability, some check ownership of a record), and a wrapper that took all of
that as config would be harder to read than the four lines it replaced. Revisit
if a real third and fourth route disagree with this.

Cookie-less API requests never reach the handler. `proxy.ts` answers them with an
`UNAUTHENTICATED` JSON envelope and `401` before routing, so a typo under `/api/`
also returns the API's auth response rather than a route-specific `404`. A request
with a present but invalid cookie reaches the handler, which performs the real
session verification and returns a byte-identical envelope. Keep both checks: the
proxy is an early response, not the security boundary, and the wire cannot tell you
which layer answered.

"Every `/api/` request" includes ones with a **dot in the path**, and that costs a
dedicated `'/api/:path*'` entry in `config.matcher`. The general page pattern
excludes any dotted path so static files are not gated, and that exclusion cannot
tell `/logo.svg` from `/api/export/assets/v1.2` — without the dedicated entry a
dotted `/api` path skips the proxy entirely and gets Next's routing answer instead
of the envelope. Do not "simplify" this by adding `api` to the negative lookahead:
`(?!api|…)` also swallows `/api-docs`, a page route that merely shares the prefix,
and would silently stop gating it. `proxy.test.ts` asserts the matcher itself,
because no test that calls `proxy()` can see a request the matcher never routed.

## Correlation ID — one system, not two

`cid` is the ONE request identifier in this codebase. The envelope is its
**source**; everything else consumes it.

- `apiFetch` mints one client-side and sends it on `x-correlation-id`.
- `resolveCorrelationId(request)` adopts a well-formed inbound cid, otherwise
  mints one — so one id spans both halves of a same-app call, and a client-side
  network failure still has an id to report.
- An inbound cid is **untrusted input that lands in log lines**, so it is
  validated (`[A-Za-z0-9_-]{1,128}`) and silently REPLACED when malformed. A bad
  trace header must never fail an otherwise valid request.

- **MUST NOT** mint a request id anywhere else, or add a second trace header.
  That is the "one system, not two" rule, and it is the whole reason this lives
  in `lib/api/cid.ts` rather than inside a logger.
- `apiFailFrom` binds `log.child({ cid })` from
  `resolveCorrelationId(request)`. The logger consumes the envelope's id; it
  never creates a parallel request identifier.

## Every route conforms — cite any of them

There is no non-conforming route: every handler under `app/api/` answers through
`lib/api/response.ts`, and both envelope clients (`lib/auth/client.ts`,
`hooks/use-upload.ts`) read the envelope rather than an ad-hoc shape. If you are
adding a route, one of the existing ones is a valid template.

## Rate limiting

`lib/http/index.ts` is an in-memory fixed-window limiter. It is applied
**explicitly, per route** — never globally. Routes here differ in what they are guarding, so a
global limiter would force uniform handling onto a path that must stay per-route.

```ts
import { rateLimit } from '@/lib/http'

// A module constant beside the call site — never an env key.
const AI_BUDGET = { limit: 20, windowMs: 60_000 }

const limit = rateLimit(`ai:${session.uid}`, AI_BUDGET)
if (!limit.ok) {
  return apiFail(request, 'RESOURCE_EXHAUSTED', {
    retryAfter: limit.retryAfter,
  })
}
```

### Two things this limiter does NOT do

**1. It is not a global limit. It is per PROCESS.**

The counter lives in one process's memory. Two replicas double the effective
limit; a cold start resets it. It is a cost guard against a single client burning
a paid upstream call — it is not a quota, and nothing may describe it as one. The
`RateLimitStore` interface is the swap seam: a Redis-backed store implements one
`hit` method and no call site changes.

That claim is only true because `hit` returns a **`Promise<Counter>`** and
`rateLimit` is **async**. A synchronous seam is one no network-backed store can
implement, so it would have forced a second breaking change to the very
interface meant to absorb the swap — the in-memory store just resolves
immediately. `lib/http/index.test.ts` drives a store that genuinely resolves on a
later microtask, so "a Redis store changes no call site" is a checked claim and
not a comment. Every caller must `await rateLimit(...)`; an empty key REJECTS.

**2. On the session route it is not a credential guard.**

`/api/auth/session` is **not a login endpoint**, and the whole design follows
from that. The password never reaches this origin: `app/login/login-form.tsx`
calls `signInWithEmailAndPassword` — browser straight to Google — and only then
hands the server an already-verified `idToken`. So:

- A wrong password sends this route **zero** requests.
- **Credential stuffing never transits this app.** That boundary is Firebase's
  own throttle, and `lib/api/errors.normalize.ts` already maps
  `auth/too-many-requests` → `RESOURCE_EXHAUSTED`. Building our own would be a
  parallel taxonomy of something the system already owns.

What the budget actually protects is **`createSessionCookie` quota**.

### The key is a resolved uid. Never an IP.

`rateLimit` **throws** when handed an empty key rather than synthesizing a
placeholder.

There is no IP fallback, and there must never be one. Here `x-forwarded-for` is
**client-controlled**: this app is not on Vercel, the shipped compose file
publishes the app port with no proxy in front, and Next 16 exposes no trusted
request IP. A limiter keyed on a forgeable header reports protection it does not
have — on the auth boundary. Do not add an `extractRequestIp` helper whose first
branch trusts `x-vercel-forwarded-for`: that header is meaningful only behind
Vercel's proxy, not here.

A uid key also means **a NAT'd office cannot lock itself out**: 500 employees are
500 keys.

If anyone ever reinstates an IP key, it must **DENY** on a headerless request. A
limiter you bypass by deleting a header fails silently forever; a lockout fails
loudly on the first drive, in front of the person who caused it.

### Where to meter, and why it is not where you would guess

On the session route the meter sits **after `verifyIdToken`, before
`createSessionCookie`**, counting **successful mints**.

Verified in `node_modules/firebase-admin`:

- `BaseAuth.verifyIdToken(idToken, checkRevoked = false)` only makes a network
  call when `checkRevoked || isEmulator`. The route passes neither, so
  verification is a **local** JWT check against certs cached ~6h.
- `createSessionCookie` is the **only** Google round trip, and it runs **only on
  the success path**.

So a **failure-only counter would meter the free, local path and leave the only
paid call unbounded**: one attacker holding one valid token could replay it and
burn unlimited `createSessionCookie` quota while paying zero slots. Forged tokens
die free at the local verify and are deliberately **not** metered.

- **MUST** key on a resolved uid, namespaced by purpose (`session:`, `ai:`).
- **MUST** keep the budget as a module constant beside its call site, passed as
  an argument — never an env key — and reachable from a test (a load-bearing
  constant a test cannot reach is unfalsifiable).
- **MUST** answer `apiFail(request, 'RESOURCE_EXHAUSTED', { retryAfter })`. 429 is
  already in `API_ERROR_STATUS` and `retryAfter` is named above as legitimate
  `details`. **MUST NOT** invent a code.
- **MUST NOT** meter an endpoint that mints nothing and costs nothing.
  `DELETE /api/auth/session` is unlimited on purpose: cookie-authed, no upstream
  call, and a limiter there could only stop someone signing out.

### The test that matters

The assertion that separates a correct limiter from a broken one is **not** "N
requests trip it":

- N events by **one** uid trip it. ✅
- N events by **N distinct** uids do **not**. ← a shared counter passes the first
  test while locking every user out.
- A loop of **garbage** tokens **never** trips it. ← a 429 here proves the
  limiter is metering the free path.

A plain "curl loop → 429" passes the **wrong** build: garbage tokens trip a
failure-counting limiter instantly, so the broken build looks right and the
correct one looks broken.

## The CSRF origin check compares against the HOST, not the request URL

`lib/http/origin.ts` decides whether a state-changing request came from a page
this app served. It compares the `Origin` header to **the host the browser
addressed** — `X-Forwarded-Host` when a proxy set one (its FIRST entry, since a
chain of proxies appends), otherwise `Host`. Both cookie-mutating handlers on
`/api/auth/session` run it before anything else, because without it an attacker
page can POST its own ID token and log a victim into the ATTACKER's account.

**Never compare against `new URL(request.url).origin`.** That was the original
implementation and it shipped broken. In the standalone server that origin
reflects the `HOSTNAME` the server was started with, and the Containerfile sets
`HOSTNAME=0.0.0.0` because it must listen on all interfaces — so the only
`Origin` the shipped image accepted was `http://0.0.0.0:3000`, which no browser
sends. Driven against the real image on 2026-07-22:

- `Origin: http://localhost:3100` → 403
- `Origin: http://127.0.0.1:3100` → 403
- `Origin: http://0.0.0.0:3100` → 200

Sign-in was therefore impossible in the artifact that ships, and every gate was
green: unit fixtures built a `Request` whose URL and `Origin` agreed, and
`pnpm dev` runs on `HOSTNAME=localhost` where it works. Only driving a browser
against the container found it.

**This is not weaker than comparing the URL.** A cross-site attacker needs the
victim's browser to send the request — that is the only way cookies are attached
— and the browser sets `Host` itself, with no way for page script to override it.
`X-Forwarded-Host` is not CORS-safelisted, so cross-origin script cannot set it
either. A hand-forged `Host` belongs to a request the attacker made themselves,
carrying none of the victim's credentials. (Trusting a forwarded host IS dangerous
where it is used to GENERATE a URL — reset links, cache keys. This only compares.)

**It is also what Next.js already does** for every Server Action in this app, so
the URL-based check was not stricter, only inconsistent with the guard already
protecting the mutations — see
`node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and
`server/app-render/action-handler.js` (`parseHostHeader`). Two consequences follow
from matching it, both deliberate: the **scheme is not compared** (a
TLS-terminating proxy legitimately differs), and a **missing `Origin` is allowed**
(`sameSite=lax` on the session cookie is the other half of this defence).

**Deployer contract:** your reverse proxy must set `X-Forwarded-Host` to the
public hostname, or leave `Host` as the public hostname. A proxy that rewrites
`Host` to an internal name without setting `X-Forwarded-Host` breaks sign-in — see
`docs/how-to/deploy.md`.

## Security headers

A **static** baseline in `next.config.ts`'s `headers()`, applied to `/:path*` —
pages and route handlers alike: `Content-Security-Policy: frame-ancestors 'none'`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, `Strict-Transport-Security`, `X-Robots-Tag`.
`poweredByHeader: false` removes `X-Powered-By` in the same file.

**`Cross-Origin-Embedder-Policy` is absent on purpose.** `require-corp` demands a
CORP/CORS opt-in from every cross-origin subresource, and this app talks to
Firebase endpoints that make no such promise — it would break auth to buy a
cross-origin isolation nothing here uses.

Two of them carry a fork trigger, stated in the config beside each value: a fork
that adds `signInWithPopup` must revisit `Cross-Origin-Opener-Policy` (that flow
talks back through `window.opener`, which the header severs), and a fork that
serves `/_next/static` from a CDN host relaxes `Cross-Origin-Resource-Policy` to
`same-site`.

`Cache-Control: no-store` is **not** here: it belongs to the envelope, not to the
baseline, and is set in `lib/api/response.ts` so no route can forget it.

**Nonce-CSP is deliberately absent, not forgotten.** Per Next's own guide it
requires `proxy.ts` to mint a per-request nonce and it **forces dynamic rendering
on every page** — a change to how the whole app renders, and its own PR. Until
then there is no `script-src` policy at all, rather than one that would break the
app or be loose enough to lie.

HSTS ships unconditionally because browsers ignore it over plain HTTP: it is
inert in dev and takes effect only where it is already true, which beats a
`NODE_ENV` branch nobody tests. It carries no `preload` — that is a one-way
commitment for every downstream project's domain, and not a boilerplate's to
make.

It also carries **no `includeSubDomains`**, and that is a contract rather than an
omission. The header as shipped promises only that _the exact host that served
it_ is HTTPS-only. `includeSubDomains` would extend that promise to every
subdomain of the deployment domain — including ones this app never serves and a
boilerplate cannot know about (a legacy `intranet.`, a plain-HTTP `staging.`, a
vendor-hosted `status.`) — and getting it wrong makes those hosts unreachable for
two years from a header this app shipped on their behalf. A deployer whose whole
domain is already HTTPS appends `; includeSubDomains` to the value in
`next.config.ts`. The header and its comment must keep agreeing; that agreement
is the deliverable.

## Removal checklist

Both modules are pull-based: nothing wires them into the shell, so removing either
is `trash` plus fixing whatever imported it. Neither has an env var, a provider, an
`instrumentation.ts` hook, or a dependency to `pnpm remove` — both are zero-dep by
design (builtin `fetch` / `JSON` / `crypto`; `zod` is imported only to recognise a
`ZodError` and is already a core dependency).

Removing `lib/api`:

- `trash lib/api/` — the whole module (envelope, errors, cid, response, client)
  and its colocated tests.
- Grep for `@/lib/api` and rewrite each route handler to answer with a plain
  `Response.json(...)`, and each `apiFetch` call site to a plain `fetch`.

Removing `lib/http`:

- `trash lib/http/index.ts` (the limiter) and delete the `rateLimit` call in
  `app/api/auth/session/route.ts` plus its `SESSION_MINT_BUDGET` constant.
- **Not the whole directory.** `lib/http/content-disposition.ts` also lives here
  and is shared by the export download response and the presigned-storage URL —
  it belongs to those capabilities' own removal checklists, not this one.
- The CSRF origin check goes with it. **Read the section above before deciding
  that is acceptable** — dropping `isSameOrigin` from the session route reopens
  login CSRF, and `sameSite=lax` alone does not cover a request that SETS the
  cookie.
- Drop the `headers()` key from `next.config.ts` to remove the security baseline.

`pnpm typecheck && pnpm build:ci` must be green afterwards — no dangling imports.
