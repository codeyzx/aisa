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
  envelope, the data-layer plumbing, the `aisa-api` client, format, logging. Nothing
  here knows what an "item" is, which is what makes it reusable across any fork's domain.
- **`features/`** — the domain. One folder per entity holding its schema, repo, actions,
  and typed collection accessor. `features/aisa/` is the one shipped domain;
  copy-me placeholders for a Firestore-writing entity live in `features/_template/`.
- **`app/`** — delivery and composition: routes and pages. It wires features into the
  request path.

The direction is **enforced by ast-grep rules in `rules/`**, not just documented: shared
code cannot reach up into the domain, and the domain does not know its delivery. That seam
is precisely what makes "fork and delete" work — a fork keeps `lib/`, swaps `features/`,
and rewires `app/`.

Rules and their exact wording: [module boundaries](../reference/contracts/module-boundaries.md).

## The request path

```
browser ─▶ proxy.ts ─▶ ┬─ RSC page (app/**)      ─▶ repo (features/**) ─▶ Firestore (read)
                       └─ route handler (app/api) ─┘

client component ── form / button ─▶ server action (features/aisa) ─▶ aisa-api (write)
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
- **Server actions** are the mutation boundary from client components. The AISA actions
  forward every write to the Python `aisa-api` with the server-only `X-AISA-Key`; the
  dashboard never writes AISA data to Firestore itself.
- **Repos** are the only place that reads Firestore for an entity.

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
  vanishing. The build **inlines** these into the browser bundle, so a malformed one must
  fail there. Today the only public group is the optional error-monitoring DSN, so no
  public var is required and the build passes with no `.env`.
- **Server (`lib/env/server.ts`)** — the private half no capability owns. `server-only`
  here is stronger than a runtime guard: reaching a secret from a client component fails
  the **build** rather than the request.
- **The shared primitives (`lib/env/validate.ts`)** — and deliberately **no bypass flag**.
  A predecessor could switch validation off for secret-less builds, which meant a green
  build proved nothing. Verification builds pass explicit non-secret dummy public values
  (`scripts/public-env-fixture.ts`), so the validator always runs.
- **The capability manifest (`lib/env/registry.ts`)** — see
  [the capability model](capability-model.md).

That asymmetry is what lets the container image build with zero secrets, and it is why
boot-time checks that must run in the standalone runtime — where
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

One path per entity: **schema → repo → action**, all in one folder. For AISA the action
half calls `aisa-api` instead of a repo write; the full Firestore-writing shape is what
`features/_template/` scaffolds.

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

## The optional capabilities

Each is a seam with its own contract; this list is only the map. Observability
(`lib/observability`, the instrumentation entry points, the React error boundaries that
report explicitly because a boundary swallows what it catches) and the HTTP client and
rate limiter live in [observability](../reference/contracts/observability.md) and
[http-api](../reference/contracts/http-api.md). Client state layers are in
[ui](../reference/contracts/ui.md). Migrations, snapshot export and restore are operator
procedures rather than a seam, and live in
[back up and restore](../how-to/backup-and-restore.md).

Object storage, export, inference, realtime listeners and impersonation shipped with the
starter and were removed for AISA: every AISA write goes through the Python `aisa-api`,
and the dashboard reads Firestore server-side only.

## Deliberate omissions

Named so each absence reads as a decision rather than a gap.

- **No Vercel.** Container self-host is the target —
  [the deployment model](deployment-model.md).
- **No nonce-based CSP.** Only `frame-ancestors`, `frame-src` and the headers that are
  true without a nonce ship; the reasoning is owned by [http-api](../reference/contracts/http-api.md).
- **No live-production safety for migrations by convention alone.** Reaching production is
  a migration's whole purpose — the inverse of the seeder's guard — so the runner is
  dry-run by default and refuses to apply until the operator types the target project id
  back. A ledger answers "what has this database had done to it" by asking rather than
  re-scanning, and idempotency is what makes writing that ledger after the work safe.
