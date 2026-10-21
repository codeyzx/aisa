# Operations

- Type: normative contract (reference)
- Owns: the operational contract of the shipped artifact — process signals and drain, health semantics, what a reverse proxy MUST and MUST NOT do, request and body limits, log format, and build identity
- Source of truth: `Containerfile`, `compose.prod.yaml`, `app/api/health/route.ts`, `lib/http/origin.ts`, `lib/api/response.ts`, `lib/log/index.ts`, `features/aisa/aisa.limits.ts`, `next.config.ts`, `lib/env/server.ts`, `instrumentation.ts` / `instrumentation-node.ts`
- Verified by: `pnpm smoke:image` (non-root, static assets, build identity, headers, health, `no-store`, SIGTERM shutdown) and `pnpm test:e2e:ci` (the browser suite against the production container)
- Read when: standing up a proxy, writing an orchestrator manifest, wiring alerting or log shipping, or diagnosing a deploy that looks healthy but signs nobody in
- Does not define: how to build, run or roll out the image — that procedure is [deploy](../../how-to/deploy.md); why the deployment is shaped this way is [the deployment model](../../explanation/deployment-model.md); which env var each capability requires is [configuration](../configuration.md)

Everything below is a **property of the artifact**, not advice. Where a number is configurable,
the file that owns it is named.

## Signals and drain

- The image runs `node server.js` as **PID 1** (`Containerfile`), so **SIGTERM reaches the Next
  server directly**. No `pnpm` or shell wrapper sits in between — one would swallow the signal
  and turn every redeploy into a hard kill of in-flight requests.
- Next's App Router server installs its own SIGTERM/SIGINT handler: it **finishes in-flight
  requests, runs pending `after()` callbacks, then exits**.
- **The container exits `143`, and that is success, not a crash.** Next runs its cleanup and then
  deliberately exits `128 + signal`, so the runtime reports a signal termination rather than a
  normal exit. An alerting rule that treats non-zero as failure will page on every deploy —
  `143` (SIGTERM) and `130` (SIGINT) are the clean shutdown codes. What IS wrong is `137`:
  SIGKILL after the grace period expired.
- The orchestrator's only job is therefore to **wait**. Both compose files set
  `stop_grace_period: 30s`; on Kubernetes the same knob is `terminationGracePeriodSeconds`. A
  window shorter than your slowest request truncates whoever was mid-request.
- **Do not set `NEXT_MANUAL_SIG_HANDLE`.** It is the Pages-router escape hatch and it _replaces_
  the drain with your handler — trading a working drain for a `process.exit(0)`.

## Health

- `GET /api/health` is the **only** probe and it is **liveness**: it does not touch Firestore. A
  health endpoint that checks the database converts a transient DB blip into a killed pod and
  turns every probe into billable reads. A readiness probe, if ever wanted, is a **separate**
  route with its own argument — never a flag on this one.
- It is **public by design** (`PUBLIC_PREFIXES` in `lib/auth/constants.ts`). Without that entry
  the request gate redirects it and a probe reads the login page as a failure.
- It answers the standard API envelope and reports the build stamp: `status`, `sha`, `builtAt`.
  Under `pnpm dev` the stamp is `unknown` — the honest answer, because there is no build to
  stamp. A deployed image reports the commit it was cut from.
- The **image declares its own `HEALTHCHECK`** against that path, using `node -e` and the builtin
  `fetch`: the slim base ships neither curl nor wget, and adding one to the runtime image to
  answer a question node already answers would grow the artifact's attack surface. Compose
  inherits it; nothing restates it.
- The healthcheck's start period exists because boot legitimately is not-yet-listening:
  `instrumentation-node.ts` validates configuration first and **exits 1** rather than serving
  misconfigured. A container that keeps restarting at boot is telling you a variable is missing —
  read the `[boot]` line, which names every failure at once.

## Reverse proxy and TLS

- **Your proxy MUST preserve the public hostname.** Set `X-Forwarded-Host` to the hostname the
  browser used, or leave `Host` as that hostname. **A proxy that rewrites `Host` to an internal
  name and sets no `X-Forwarded-Host` BREAKS SIGN-IN** — every login returns 403 while the app
  looks perfectly healthy on every other page and on the health probe. The CSRF check that reads
  it, and everything about how it reads it, is owned by [http-api](http-api.md).
- **No other forwarded header is trusted.** `x-forwarded-for` and friends are client-controlled
  here — the rate limiter is keyed on a fixed server-side name, never an IP, for exactly this reason — so a
  proxy cannot establish identity on the app's behalf, and a missing proxy cannot be forged
  around.
- The container serves **plain HTTP on `$PORT`** (default `3000`; Cloud Run injects its own). TLS is terminated by whatever sits in front;
  there is no certificate in the image and no HTTPS listener to configure.
- **You do not need to set `X-Forwarded-Proto`.** The origin check does not compare scheme (see
  [http-api](http-api.md)), and nothing in the app builds an absolute URL today. A fork that adds
  something which does needs that header.
- HSTS ships from the app (`next.config.ts`) and is **inert until a browser sees it over HTTPS**.
  `includeSubDomains` is deliberately absent; the header's own comment states the exact one-line
  edit and the promise it would make on your behalf.
- **If your proxy caches, do not override `Cache-Control: no-store`.** Every API envelope sets it
  (`lib/api/response.ts`); an authenticated JSON response a proxy is allowed to cache is a
  cross-user data leak.

## Request and body limits

- **Pitch-deck PDFs transit the app as a Server Action body.** "Unggah pitch deck" posts the
  file to `uploadDeckAction`, which forwards it to `aisa-api`. Decks are capped at 20 MB
  (`MAX_DECK_BYTES`, `features/aisa/aisa.limits.ts`), and `next.config.ts` raises both
  `experimental.serverActions.bodySizeLimit` and `experimental.proxyClientMaxBodySize` to
  `21mb` to cover that plus multipart overhead. Without them a deck over 1 MB is refused by the
  action, and one over 10 MB is truncated by the proxy's body buffer and reaches `aisa-api` as a
  corrupt PDF.
- **A reverse proxy in front must allow the same body size**, or it refuses the upload before
  the app sees it. Raise the deck cap, and you raise all three together.
- **There is no application-level request timeout.** Bound it where it belongs: at the proxy, and
  at the orchestrator's grace period above.

## Logs

- **One JSON object per line on stdout**, every level included. The `level` field carries
  severity, so splitting across stdout/stderr would only interleave two pipes and corrupt line
  order.
- Lines are **bounded** (`lib/log/index.ts`) — object depth, string length, array length and
  total line size — so a large or cyclic value degrades the line instead of the log pipeline. A
  record that still exceeds the line limit is emitted with its fields dropped and a marker saying
  so, never truncated into invalid JSON.
- **Stacks are not emitted at the default level**; `LOG_LEVEL=debug` turns them on, because a
  stack in stdout leaks absolute filesystem paths. The optional error monitoring keeps full
  stacks whenever it is configured.
- Every line carries the process bindings set at boot (`instrumentation-node.ts`): `sha` and
  `env`.
- The audit stream (`lib/data/audit.ts`) is an application **event stream, not durable
  tamper-evident storage** — nothing here retains, signs, or can prove the completeness of those
  lines. Shipping and retaining them is the deployer's responsibility.

## Build identity

- **Release identity is the git SHA**, supplied once as the `BUILD_SHA` build argument and
  reaching three places from that single value: `/api/health`'s `sha`, the `sha` bound to every
  structured log line, and the `release` tag on error-monitoring events (that last one through
  `NEXT_PUBLIC_BUILD_SHA`, because a browser release tag must be inlined at build).
- **Environment identity is `NODE_ENV`**, set to `production` in the runner stage. It is what the
  `env` log field and the error-monitoring `environment` tag both report. There is deliberately
  no separate `APP_ENV`: a second name for the same fact is a second thing to get wrong.
- `BUILD_SHA` and `BUILT_AT` are populated by the `Containerfile` at image build. **Never set
  them by hand** — a hand-set stamp identifies nothing.
- **Reference images immutably.** Deploy by digest (`image@sha256:…`), not by a moving tag: the
  build stamp only tells the truth about the image you actually pulled. `compose.prod.yaml` has
  no `build:` and no default image, so it forces you to _supply_ one — but its `:?` guard checks
  presence, not form, because compose cannot assert the shape of a value. **`pnpm image:check`
  is what checks the form**, resolving `APP_IMAGE` the way compose does (exported environment,
  then the project directory's `.env`) and refusing anything that is not
  `<name>@sha256:<64 hex>`. Running it remains the deployer's discipline — nothing can force a
  release job to call it — and it validates shape offline, so it cannot tell you the digest names
  an image that exists.
- **The BASE image is pinned by exact tag, not by digest**, and that is a different claim from
  the one above. `Containerfile` builds `FROM node:${NODE_VERSION}-bookworm-slim` with
  `NODE_VERSION` defaulting to the patch in `.node-version` (`pnpm node:check` proves the two
  agree), so two builds of one commit run the same Node — but the tag is still upstream's to
  repoint. Digest-pinning it would mean giving up the `NODE_VERSION` build argument, since a
  digest cannot interpolate a version. That trade has not been made here.
- **No secret is in the image.** The build runs with public build arguments only and no
  credential; the runtime reads secrets from the environment. Server configuration is validated
  at **boot** rather than at build, so a missing secret fails fast at startup, named, with every
  misconfigured group reported in one pass — never deep in a server action on first use.
