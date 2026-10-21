# Observability contract

- Type: Reference — normative contract
- Owns: error monitoring — the PII allow-list that decides what leaves the process, the wired-optional DSN switch, the two runtime entry points, why tracing is off, and the observability removal checklist
- Source of truth: `lib/observability/sentry.ts`, `lib/observability/config.ts`, `instrumentation.ts`, `instrumentation-node.ts`, `instrumentation-client.ts`, `app/error.tsx`, `app/global-error.tsx`
- Verified by: `pnpm test` (`lib/observability/sentry.test.ts` asserts the scrubbers against payloads the SDK genuinely produces — no SDK, no network) plus `pnpm build:ci`, which is what proves the client half still builds without a DSN
- Read when: touching anything under `lib/observability/`, adding a `Sentry.*` call, wiring a new error boundary, pointing the app at a monitoring backend, or deleting error monitoring
- Does not define: which env keys exist and how they are scoped ([configuration](../configuration.md)), the structured server log, health endpoint and build identity ([operations](operations.md)), or why a capability must delete cleanly ([the capability model](../../explanation/capability-model.md))

`lib/observability/sentry.ts` is THE ONE description of what this app sends to an
error reporter, shared by both runtimes so the browser half and the server half
cannot drift into reporting different things about the same deploy. Its own unit
test calls `scrubEvent` / `scrubBreadcrumb` "the ENTIRE PII boundary between this
app and a third party". Treat every rule below as that boundary, not as
hardening.

## The switch: no DSN means never initialized

`sentryInitOptions()` returns `undefined` when `NEXT_PUBLIC_SENTRY_DSN` is unset,
and both callers then skip `Sentry.init` entirely.

- **MUST NOT call `Sentry.init` with an empty or placeholder DSN.** That is the
  difference between "optional" and "off": an initialized client still installs
  global handlers and still costs something. Never initializing costs nothing and
  makes every capture a no-op.
- **MUST keep the DSN optional in the schema.** `lib/observability/config.ts`
  declares it `z.string().optional()`. The env layer fails fast with no bypass
  flag, so a required-but-blank DSN would mean nobody can build this starter
  without a monitoring account.
- The config module is deliberately **not** `import 'server-only'` — the one
  structural difference from `lib/storage/config.ts` and `lib/ai/config.ts`.
  Every value in it is `NEXT_PUBLIC_*` and `instrumentation-client.ts` reads it
  in the browser. A DSN is public by construction; it ships in every client
  bundle.
- **MUST supply the DSN at BUILD time**, not run time. It is a `NEXT_PUBLIC_*`,
  so the browser half is initialized from the value inlined into the bundle;
  supplying it only to the running container gives you a server that reports and
  a browser that silently does not. The `Containerfile` takes it as an `ARG`
  precisely for that.
- `release` is `NEXT_PUBLIC_BUILD_SHA` (`unknown` when unstamped) and
  `environment` is `NODE_ENV`. **MUST NOT add a dedicated environment key** — a
  DSN names a project, so a separate staging project separates the streams at
  the destination instead of by a tag every deploy has to remember to set.

## What is allowed out

An error event leaves with a **stack, a message, a route, a release and an
environment — and nothing else that identifies a person**. The payload is
**allow-listed, not deny-listed**, so a future SDK version that adds a field does
not silently start shipping it.

`sendDefaultPii: false` is set and is **not** sufficient on its own. Verified
against the shipped SDK, not from memory:

- `Sentry.captureRequestError` (what `onRequestError` is) puts every request
  header on the scope, and `requestDataIntegration` copies them onto
  `event.request.headers` verbatim. `@sentry/core`'s deny-list filtering runs on
  the **span path only**, not the event path — so with tracing off the `cookie`
  header, carrying this app's `__session` Firebase session token, would ship
  intact.
- `event.request.url` and `contexts.nextjs.request_path` carry the **query
  string** (Next's own `onRequestError` docs give `/blog?name=foo` as the shape
  of `request.path`), which in this app can hold a search term, an id, or a
  future one-time token.
- Console breadcrumbs are whatever `lib/log` wrote — routinely uids, actor
  emails and document ids.

`sendDefaultPii: false` is kept anyway, and deliberately: it switches collection
OFF at the source (bodies, cookies, IPs are never gathered), so a mistake in the
scrubber is not the only thing between a credential and the wire.

### `scrubEvent` — the event rules

- **MUST delete `event.user` outright.** That block is `id` / `email` /
  `username` if anything ever calls `setUser`, plus `ip_address`, which
  `requestDataIntegration` fills from the forwarding headers. Nothing here needs
  a person attached to a stack trace; "which user" is answerable from the server
  log via the event's route and time.
- **MUST rebuild `event.request` as an allow-list**, never delete named fields
  from it. What survives is `method` and a query-stripped `url`. Headers,
  cookies and the request body do not.
- **MUST strip the query string** from `event.request.url` and from
  `contexts.nextjs.request_path`. Keep origin + path; drop `?query` and
  `#fragment` alike.
- **MUST rebuild the three ARBITRARY carriers as allow-lists too.** `event.extra`,
  `event.tags`, `event.contexts` and `breadcrumb.data` are open bags that
  anything can attach a person to, and for a long time only `event.request` was
  actually allow-listed while these passed through verbatim — so a `setExtra`,
  a `setTag`, a custom context or a breadcrumb carrying an actor email shipped
  intact, under a doc that claimed otherwise. Now: `event.extra` is dropped
  outright (no allow-list makes an arbitrary logged object safe — the same
  argument that drops console breadcrumbs); `event.tags` keeps only
  `cid` / `capability` / `code`; `event.contexts` keeps only
  `nextjs` / `runtime` / `os` / `app` / `trace` — notably **not** `device` (a
  device name) or `culture` (locale + timezone narrow a person more than
  expected); `breadcrumb.data` keeps only `url` / `from` / `to` (query-stripped)
  plus `method` / `status_code`. Adding a tag without adding it to the
  allow-list means it is silently dropped, which is the safe direction.
- **MUST redact email addresses by shape** in `event.message` and in every
  `exception.values[].value`. Emails are the one piece of PII that arrives
  through the MESSAGE rather than a structured field — Firebase Admin errors name
  the account they failed on, and a hand-thrown message can too. There is no
  field to allow-list, so the redaction is a pattern.
- **MUST leave the stack trace intact.** The payload still has to be useful; a
  scrubber that strips frames has removed the reason for reporting at all.

### `scrubBreadcrumb` — the breadcrumb rules

Breadcrumbs are the quiet leak: they are collected continuously, before anyone
decides an error is worth reporting.

- **MUST drop `console` breadcrumbs outright**, not redact them. On the server
  that category is `lib/log`'s entire output — structured objects carrying uids,
  actor emails and document ids; on the client it is whatever a component logged.
  There is no allow-list that makes an arbitrary logged object safe, and the same
  information is already in the server log, where it belongs.
- **MUST strip the query string from `data.url` / `data.from` / `data.to`** on
  `fetch`, `xhr` and `navigation` breadcrumbs. Keep the path — it says WHERE;
  drop the rest — it can say WHO.
- **MUST redact emails in `breadcrumb.message`**, same reason as an event
  message. A plain breadcrumb (`ui.click` and friends) otherwise survives intact:
  the trail must still be readable.
- **MUST NOT relax any of the above without reddening
  `lib/observability/sentry.test.ts` first.** Every case in that file is a
  payload the SDK genuinely produces, not a hypothetical, and it is checkable
  without standing up an SDK or a network precisely so this boundary has a test
  that runs everywhere.

## Where it is wired

- **Server (`instrumentation.ts` → `instrumentation-node.ts`).** Next gives a
  process exactly one `register()`, and it dispatches on `NEXT_RUNTIME`. Sentry
  is initialized on the **Node runtime only**, inside the try block, alongside
  the boot-time env check — so errors with `routeType` `render` / `route` /
  `action` are reported and edge (`proxy`) ones are not. The edge surface here is
  `proxy.ts` alone, a cookie-presence check that touches no env and no I/O.
  Initializing Sentry per-runtime is the fix if that ever stops being true.
- **`onRequestError`**, exported from `instrumentation.ts` as
  `Sentry.captureRequestError`. Without it, RSC render errors never reach the
  backend and error monitoring lands half-done. It is edge-safe and a no-op when
  `init` was never called, so both the DSN-less path and the edge runtime stay
  silent rather than throwing. It is also the single largest reason `scrubEvent`
  exists — see the header rules above.
- **Browser (`instrumentation-client.ts`).** Next runs this file after the
  document loads and BEFORE React hydration, the only point early enough to catch
  a hydration failure. **THE FILENAME IS THE API**: nothing imports this file,
  Next finds it by name. A `sentry.client.config.ts`, which most Sentry examples
  still show, is not read by this version and would sit there silently doing
  nothing.
- **`onRouterTransitionStart`**, exported from `instrumentation-client.ts` as
  `Sentry.captureRouterTransitionStart` — the SDK's only way to see an App Router
  navigation start. **Honest about what it does today: it is a no-op**, because
  it forwards to a handler that only `browserTracingIntegration` registers and
  that integration is filtered out (below). It is exported anyway as the **opt-in
  seam** — a project that turns tracing on gets navigation spans with no second
  file to find. Navigation context is not lost meanwhile: the `breadcrumbs`
  integration instruments history independently of tracing.
- **The error boundaries report explicitly.** `app/error.tsx` and
  `app/global-error.tsx` both call `Sentry.captureException`, because a React
  boundary **swallows** what it catches — the error never reaches
  `window.onerror`, so the SDK's global handler cannot see it. **MUST call
  `captureException` from any new error boundary**, and **MUST NOT report a
  stale-deploy chunk 404** (`useStaleChunkRecovery`): it is expected noise on
  every redeploy, identical for every user with a tab open, and it would bury
  real crashes under a per-release spike. A server error that also lands in
  `app/error.tsx` was already reported by `onRequestError`; the `dedupe`
  integration drops the duplicate by message + stack, and where it cannot, two
  events sharing a `digest` beat a silent boundary.
- **The envelope-folding paths report through a seam.** `runAction`
  (`lib/data/action-result.ts`) and `apiFailFrom` (`lib/api/response.ts`) both
  CATCH, log, and return an envelope — so the throw never propagates,
  `onRequestError` never fires, and for a long time the application's two
  most-travelled failure paths were invisible to the very tool bought to watch
  them: the client got a polite `internal` and nobody was paged. Both now call
  `reportError` (`lib/observability/report.ts`). **MUST report only the
  unexpected**: `runAction` reports from its catch-all branch alone, and
  `apiFailFrom` only when `normalizeError` could not classify the throw
  (`INTERNAL`). A `DomainError`, a Zod failure, an authorization denial, and a
  classified provider condition (`NOT_FOUND`, `PERMISSION_DENIED`, `UNAVAILABLE`)
  **MUST NOT** be reported — they are the system working, and alerting on them
  buries real incidents until the alerts stop being read. The uid goes to the
  **log** and never to the reporter; the `cid` tag joins the two.
- **`reportError` is the seam, and `lib/data` / `lib/api` MUST NOT import the SDK
  directly.** `sentry.ts` keeps its SDK import type-only because it is pulled
  into the client bundle; `report.ts` is `server-only` precisely so it can hold
  the value import without that reaching the browser. With no DSN, `init` is
  never called and `captureException` is a no-op, so the seam costs nothing when
  observability is off and needs no enabled-check of its own.

## Tracing is off, and the spelling matters

- **MUST NOT set `tracesSampleRate: 0` to turn tracing off.** `hasSpansEnabled()`
  in `@sentry/core` tests `tracesSampleRate != null` — nullish, and `0` is not
  nullish. A literal zero therefore reads as "tracing enabled, sample none" and
  pulls in the whole auto-performance integration set on the server,
  instrumenting every request to build spans that are then thrown away. **Omitting
  the key is the only spelling that costs nothing**, and that is why
  `sentryInitOptions()` has no `tracesSampleRate` at all.
- **MUST keep the `BrowserTracing` filter in `instrumentation-client.ts`**, which
  is not redundant with the omission: the Next.js browser SDK pushes
  `browserTracingIntegration()` into its default set unconditionally (the only
  guard is the `__SENTRY_TRACING__` build constant, not the sample rate). Left
  in, it patches `fetch` / XHR / history and installs performance observers on
  every page load to build spans that are never sampled.
- Turning tracing ON is therefore a two-line change — set `tracesSampleRate` and
  drop the filter — and it is opt-in per project precisely because opt-in has to
  mean it costs nothing until someone opts in.

## Removal checklist

Error monitoring is a deletable capability like storage, AI and export. It is
already optional at run time, so deleting it is about shipping less code, not
about turning it off.

- `trash lib/observability/` (`sentry`, **`config`** and the colocated test) and
  `trash instrumentation-client.ts`. The schema lives inside the capability, so
  no orphan env schema is left behind.
- In `lib/env/client.ts`, drop BOTH the `getObservabilityConfig()` call inside
  `validateClientEnv()` and the `import` of it at the top of the file. Removing
  only the call leaves an import of a directory step 1 just deleted, and
  `pnpm typecheck` fails with `TS2307` — which would contradict this checklist's
  own last step.
- Remove the two `Sentry` references in `instrumentation.ts` (the
  `onRequestError` export) and `instrumentation-node.ts` (the import and the
  `if (sentryOptions) Sentry.init(...)`). `register()` and the boot env check
  stay: they are not part of this capability.
- Remove the `Sentry.captureException` calls from `app/error.tsx` and
  `app/global-error.tsx`. The boundaries themselves stay.
- Drop the `NEXT_PUBLIC_SENTRY_DSN` block from `.env.example` and the matching
  `ARG` / `ENV` pair from the `Containerfile`. `ENV NEXT_PUBLIC_BUILD_SHA` goes
  too — `lib/observability/config.ts` is its only reader — but leave
  `ARG BUILD_SHA` and the runner's own `BUILD_SHA`, which `/api/health` reports.
- `pnpm remove @sentry/nextjs`.
- `pnpm typecheck && pnpm build:ci` must be green afterwards (no dangling
  imports).
