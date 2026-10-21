# Architecture — how the seams connect, and why

This is the spine: the shape of the system and the reasoning behind each seam. It owns no
rules. Where this file describes a shape and a contract states a rule, the contract wins —
each section points at the one that owns it.

## The organising principle

**One server-authoritative boundary per concern, and nothing upstream of it is trusted.**
The request gate is optimistic, the DAL is the real auth check, the route handler is the
real API security boundary, and the repo layer trusts its callers only because the actions
above it validate first. Every one of those is a named file, not a convention people
remember — see [request, auth, data flow](request-auth-data-flow.md).

The second principle is **deletion**: capabilities are seams a fork removes rather than
features a fork works around — see [the capability model](capability-model.md).

## Three layers, one dependency direction

- **`lib/`** — shared, domain-agnostic infrastructure: env, firebase, auth, the API
  envelope, the data-layer plumbing, the export engines, format, storage, logging. Nothing
  here knows what an "item" is, which is what makes it reusable across any fork's domain.
- **`features/`** — the domain. One folder per entity holding its schema, repo, actions,
  form options, typed collection accessor, and any export bindings. `features/asset/` is
  the reference entity; copy-me placeholders live in `features/_template/`.
- **`app/`** — delivery and composition: routes, pages, and the deletable
  `app/(app)/(examples)` demo surface. It wires features into the request path.

The direction is **enforced by ast-grep rules in `rules/`**, not just documented: shared
code cannot reach up into the domain, and the domain does not know its delivery. That seam
is precisely what makes "fork and delete" work — a fork keeps `lib/`, swaps `features/`,
and rewires `app/`. Nothing imports the deletable example group, so the demos come out in
one cut without dragging infrastructure with them.

Rules and their exact wording: [module boundaries](../reference/contracts/module-boundaries.md).

## The request path

```
browser ─▶ proxy.ts ─▶ ┬─ RSC page (app/**)      ─▶ repo (features/**) ─▶ Firestore
                       └─ route handler (app/api) ─┘
                             │
   server action (features/**) ◀── form / button ── client component
```

- **`proxy.ts`** is the request gate — a cookie **presence** check, never a verification.
  It is deliberately not a security boundary: a forged cookie walks straight past it, and
  the DAL and route handlers are what actually verify. It answers `/api/**` with the JSON
  envelope and everything else with a redirect to `/login`, because answering a `fetch`
  with a redirect to a login page hands the caller HTML at status 200 — a lie the client
  cannot distinguish from success.
- **RSC pages** under `app/(app)/**` are the authenticated surface; `app/login`, `app/403`
  and `app/api` sit outside it.
- **Route handlers** are the HTTP boundary and re-check auth server-side even when a page
  already did.
- **Server actions** are the mutation boundary from client components.
- **Repos** are the only place that reads or writes Firestore for an entity.

Owned by [auth](../reference/contracts/auth.md),
[http-api](../reference/contracts/http-api.md) and [data](../reference/contracts/data.md);
walked end to end in [request, auth, data flow](request-auth-data-flow.md).

## Environment and configuration

Config is a set of **explicit functions**, each owning one group and each parsing a Zod
schema — no hand-written config interface to drift, no god-module, and no ambient
`process.env` read outside those files. The split by **when a value is validated** is the
load-bearing part:

- **Client (`lib/env/client.ts`)** — the public `NEXT_PUBLIC_*` half. `next.config.ts`
  calls the validator **explicitly** at build time: a call, not an import side effect, so
  the check is visible at its call site and is not one "unused import" cleanup away from
  vanishing. A missing public var fails the build because the build **inlines** these into
  the browser bundle, and a missing one cannot be fixed afterwards.
- **Server (`lib/env/server.ts`)** — the private half no capability owns. `server-only`
  here is stronger than a runtime guard: reaching a secret from a client component fails
  the **build** rather than the request.
- **The shared primitives (`lib/env/validate.ts`)** — and deliberately **no bypass flag**.
  A predecessor could switch validation off for secret-less builds, which meant a green
  build proved nothing. Verification builds now pass explicit non-secret dummy public
  values, so the validator always runs and a renamed public var still fails.
- **The capability manifest (`lib/env/registry.ts`)** — see
  [the capability model](capability-model.md).

That asymmetry is what lets the container image build with real public build args and zero
secrets, and it is why boot-time checks that must run in the standalone runtime — where
`next.config.ts` never executes — live in `instrumentation.ts` instead. Reasoning:
[the deployment model](deployment-model.md); rules:
[operations](../reference/contracts/operations.md).

## Product identity, locale, and indexing

- **Product identity** is two strings in `lib/app-config.ts` — a plain module, not env, so
  the client sidebar island and the server root-layout metadata read one value and cannot
  disagree.
- **Indonesian is the default product language.** UI copy is Bahasa Indonesia, and locale,
  timezone and currency are pinned in `lib/format/locale.ts` — the single file a
  non-Indonesian fork changes. Formatters pin the locale **and** the zone, so a formatted
  date or amount is a property of the data, not of where it rendered.
- **The private app is walled off from indexing.** It is authenticated and never an SEO
  surface, so the noindex policy has three legs that agree — root metadata, a robots route
  that disallows every crawler, and a global header that covers responses a `robots.txt`
  never reaches. A fork going public relaxes all three together or the app half-lies about
  itself.

## The data path

One path per entity: **schema → repo → action**, all in one folder.

- The **Zod schema** is the single source of truth for an entity's shape.
- **`lib/firebase/collections.ts`** is a generic typed-accessor layer, not a repository
  facade: it hands back a live collection reference with the whole Firestore query API
  intact and only a Zod converter bolted on. It never hides or narrows the query API,
  because a facade that does becomes the thing every caller works around. A feature owns
  its own dependency-free collection path and binds it to its schema.
- The **repo** is thin on purpose — only what genuinely needs render-scoped caching,
  cursor pagination, or a transaction. One-off reads belong at the call site.
- The **action** is the mutation entry point: auth-gate, validate, write, audit,
  revalidate. It never throws across the RSC boundary.

The rule nothing else in the toolchain can catch — what a filtered-and-sorted query costs
in composite indexes — is owned by [data](../reference/contracts/data.md).

## The API envelope

Every route handler answers one wire shape built by `lib/api`: pure envelope data, a
response builder, a typed client fetcher, one error taxonomy mapping code to status, and a
correlation id. One shape means a client has one thing to parse and one place to look when
a call fails. Rules: [http-api](../reference/contracts/http-api.md).

## Storage

`lib/storage/**` is **S3-generic by construction** — nothing in the code names a backend,
so a self-hosted store and a managed one swap by env alone. The default flow is a presigned
direct upload: bytes go browser to storage and never through the Next server, so an upload
costs no request-body limit and no bandwidth. `server-only` on the S3 module is
load-bearing — it reads the secret key, so a client import fails the build rather than
shipping a credential. Rules: [storage](../reference/contracts/storage.md).

## The optional capabilities

Each is a seam with its own contract; this list is only the map. Observability
(`lib/observability`, the instrumentation entry points, the React error boundaries that
report explicitly because a boundary swallows what it catches) and the HTTP client and
rate limiter live in [observability](../reference/contracts/observability.md) and
[http-api](../reference/contracts/http-api.md). Live lists ride a generic refcounted
snapshot store over `useSyncExternalStore` with no data-fetching library —
[the realtime model](realtime-model.md), [realtime](../reference/contracts/realtime.md).
Export engines are generic and an entity owns only its bindings —
[export](../reference/contracts/export.md). Inference is one hardcoded provider, shipped
off — [ai](../reference/contracts/ai.md). Admin impersonation is the highest-risk surface
in the repo and has its own contract —
[impersonation](../reference/contracts/impersonation.md). Client state layers and the
URL-backed list toolbar are in [ui](../reference/contracts/ui.md). Migrations, snapshot
export and restore are operator procedures rather than a seam, and live in
[back up and restore](../how-to/backup-and-restore.md).

## Why `assets` exists: the strands have to compose

The example surfaces each prove one capability works **alone**. `assets` is the other
half — one generic entity wired through every strand at once, so a reader can see that the
capabilities actually **compose**. That is what a fork is copying: a list of parts that
connect, not parts on a shelf. The entity is deliberately generic; a real app renames it
and keeps the wiring.

Nothing in it is a new capability. It only wires the ones that exist — the data path, RBAC
at the server boundary, a progressively-enhanced form, a cursor-paginated table, server-owned
search, audit on every mutation, an attachment through storage, and a document through the
export seam. If wiring it up makes you write a capability instead of call one, that is the
signal a seam is missing or wrong, not an invitation to fork the path locally.

Three things it demonstrates that a single-capability demo structurally cannot:

- **The lifecycle around a stored object.** Persisting an upload key on a document closes
  the demo's orphaned-object problem and opens its mirror, a document pointing at an object
  that is gone. Both failures are real, and they are not equally bad: a document pointing at
  a missing object is broken UI on every render, while an orphaned object is a billing line.
  So the document goes first and the object second, and the object delete never fails the
  action — reporting failure after the row already vanished would tell the reader a lie.
  The stranded key is recorded in the audit trail instead: an orphan that announces itself.
- **Inheriting a policy along with a function is the trap.** The single-capability storage
  demo gates downloads on uploader-ownership, which is correct there and wrong here — the
  asset has no owner, so the read gate on the asset _is_ the gate on its attachment.
  `assets` reuses the storage **library** and declines the demo's authorization decision.
  Downloads resolve the key off the document by id; a key is never accepted from the client
  on a read or delete path.
- **Where the progressive-enhancement floor actually is — and it is hydration, not
  JavaScript.** The form is a real POST with named fields, so it submits and creates the
  record while React has NOT yet hydrated: a slow chunk, a failed chunk, or a click in the
  first moments of the page. That is the degradation worth engineering for, and it is what
  the `e2e/unhydrated.spec.ts` suite drives by blocking the client bundle.

  With scripting switched off entirely the app does not work at all, and the root layout
  says so in a `<noscript>`. Sign-in hands the password to Firebase from the BROWSER, so
  nobody can authenticate without JavaScript and no protected surface is reachable to
  begin with. Driven 2026-07-22: with JavaScript off, `/assets/new` never leaves its
  loading state, because the Suspense fallback is swapped in by an inline script — a
  limitation tracked by a deliberate `test.fail()` case in that same suite.

  Within the hydration floor the attachment is the one part that cannot follow: a presigned
  upload is two client fetches. It degrades rather than breaks — an unhydrated submit still
  creates the record, just without an attachment — while the document download is a plain
  link to a route that answers bytes and needs no client JavaScript at all.

It also fixes one shape worth understanding before you reach for the alternative: **create
and edit are ordinary full pages, one surface per URL.** The rationale is the same
one-owner argument as everything else here — a URL that renders differently depending on how
it was reached is one surface implemented twice, and the two copies drift. It costs an
animation and buys back that whole bug class. A dialog over state already on screen — a
confirm, a picker — is a different thing and is fine; open it from client state. The rule and
its check: [module boundaries](../reference/contracts/module-boundaries.md).

The procedure for building a vertical like this is
[add a feature](../how-to/add-feature.md).

## Deliberate omissions

Named so each absence reads as a decision rather than a gap.

- **No Vercel.** Container self-host is the target —
  [the deployment model](deployment-model.md).
- **No nonce-based CSP.** Only `frame-ancestors` and the headers that are true without a
  nonce ship; the reasoning is owned by [http-api](../reference/contracts/http-api.md).
- **No provider seam or offline stub for AI.** One provider, hardcoded. A keyless
  "run without a key" mode would be a stub pretending to be a capability; tests use a mock
  instead.
- **No live-production safety for migrations by convention alone.** Reaching production is
  a migration's whole purpose — the inverse of the seeder's guard — so the runner is
  dry-run by default and refuses to apply until the operator types the target project id
  back. A ledger answers "what has this database had done to it" by asking rather than
  re-scanning, and idempotency is what makes writing that ledger after the work safe.
