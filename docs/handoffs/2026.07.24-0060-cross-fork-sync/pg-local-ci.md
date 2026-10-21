# Brief: Local-First CI

For the PostgreSQL lead. This repository does not edit that workspace; paths below are
destinations for that repository's own commits.

Status: `OPEN — gap confirmed; the act mechanism was driven, the port was not`. Effort: M.
Severity: developer experience.

## What This Repository Has, And The Fork Does Not

Three separable things landed here together:

1. A **tiered workflow** — a fast gate on every pull request plus an artifact job restricted to
   pushes to the default branch or manual dispatch, with per-job timeouts, checkout credentials
   disabled, docs-only path filtering, and five caches.
2. **`pnpm ci:local`**, which runs that same workflow file under nektos/act pinned at 0.2.89,
   fetching the binary on first use because the act package's postinstall is disabled in the
   workspace config.
3. **`.actrc`**, carrying the runner-image mapping and — critically — env, secret and var files
   pointed at `/dev/null`, so act never loads a developer's real `.env` into job containers.

The fork has none of it: no `.actrc`, no `ci:local`, no act dependency, no pnpm-store gitignore
entry, no manual dispatch, no job timeouts, no credential disabling, and an artifact job that
runs on every pull request. Its git hooks are still the pre-tiering version — pre-push runs
typecheck alone rather than the static chain plus unit tests.

Two corrections to how this was first written, both found on re-verification:

- **"No caches" was wrong, and was wrong when written.** `cache: pnpm` sits on
  `actions/setup-node` in both jobs (`ci.yml:93` and `:243`). What is genuinely absent is any
  `actions/cache` step: no pnpm-store cache, no Next build cache, and no Playwright browser
  cache — so `playwright install --with-deps chromium` re-downloads on every artifact run.
  Port the missing three, not a fourth that already exists.
- **The artifact-job finding got worse rather than stale.** The fork has since added four
  end-to-end specs, so an unconditional artifact job now costs more per pull request than when
  this was recorded. The case for tiering strengthened.

## What Was Actually Driven

The mechanism was tested rather than reasoned about, because the services question is the one
that decides whether this port is viable at all.

act 0.2.89 fully supports job-level `services:`. It pulls the digest-pinned image, honours the
ports mapping by publishing on the **host**, parses the health-check options block, and waits
for the service to report healthy before starting steps. Because act runs the job container with
host networking by default, the service is reachable at exactly the loopback address the fork's
workflow already hardcodes — a loopback probe confirmed it.

**So the fork's Postgres service block needs no rewrite.** That is the good news, and it is the
part that would otherwise have sunk the port.

Two real blockers were found instead, both driven:

- **Host port collision.** act publishes the service on the host port, so a running
  `pnpm db:up` compose Postgres — or any system Postgres on 5432, which this machine has —
  makes the run fail at "Set up job" with a raw Docker bind error.
- **Dry run is unusable.** `act -n` segfaults in its service-health wait on any job declaring
  `services:`. This repository documents `-n` as a passthrough; the fork must not.

Also worth knowing: the service _name_ does not resolve inside the host-networked job container.
That is fine only because the fork dials loopback.

## The Three Slices

**Slice 1 — the runner.** `scripts/ci-local.ts` transfers almost unchanged: the version pin, the
first-use fetch, the binary override and the fresh flag are all persistence-agnostic. `.actrc`
transfers verbatim; only its comment changes — the secrets it protects there are the database URL
and the two auth secrets, not a Firebase private key. Add the act package pinned exactly, its
build-disable entry, the `ci:local` script, and the pnpm-store gitignore entry.

Three adaptations inside the runner, and these are the part not to copy blindly:

- The forged push-to-default-branch event exists here only because the artifact job is
  conditionally gated. In the fork that job runs unconditionally, so the forge is dead weight —
  either drop it, or take Slice 3 first and keep it.
- Add a **preflight that fails before act starts**, refusing with an actionable message when the
  host port is occupied, rather than letting Docker emit its bind error.
- **Reject `-n` in the passthrough** with an explanation, and do not document it.

**Slice 2 — workflow hardening.** Mechanical, low risk, no act dependency: manual dispatch, job
timeouts, checkout credentials disabled, docs-only path filtering scoped to pushes, and the
missing `actions/cache` steps. Two of the three transfer directly — a pnpm-store cache and a
Playwright browser cache, the latter worth the most since the browser download repeats every
artifact run. The third does **not**: the emulator cache this repository carries has no fork
analogue any more, because the fork retired the Firebase emulator entirely. Cache its Next
build output instead.

Do **not** port the buildx layer-cache steps or the container script's cache branch. The fork
builds with plain `docker build`, and adding buildx is a separate decision; if it is ever added it
must carry the same act-detection guard, or an unguarded buildx step breaks `ci:local` rather than
merely being slow.

**Slice 3 — the tiering.** This is the actual product decision and the only one worth a
discussion. Gating the artifact job to dispatch-or-default-branch and moving the static chain plus
unit tests onto pre-push is what buys the runner minutes back and what makes `ci:local` meaningful.
It also means the fork's container-only failure class is caught at merge rather than on the pull
request — the same trade this repository made deliberately.

## What Is Genuinely Fork-Specific

Structurally, nothing — and **less than when this was written**. The emulator-versus-compose
difference has disappeared outright: the fork's CI now starts PostgreSQL and nothing else, in
both jobs, with no emulator of any kind. Its integration suite is a single run straight at that
service.

That makes this port materially cheaper than the brief first assumed. A Java emulator process
is the hard part of running a workflow on a developer's machine; with it gone, the gate's only
external dependency is a Postgres container that `compose.yaml` already defines and `pnpm db:up`
already starts. Under act the job container is host-networked, so the act-started service and
the e2e container script's host-networked app container land on the same loopback.

`compose.yaml` is not involved in a `ci:local` run at all. act starts the database from the
workflow's services block; compose stays the local-development path.

## Risks

- **The port collision will burn someone.** `pnpm db:up` leaves a long-lived Postgres running and,
  unlike an emulator, nobody thinks to stop it. Without the preflight the first `ci:local` dies at
  "Set up job" with a Docker error that reads like a broken tool. Moving the workflow's host port
  to dodge this is **not** free — it would change what the hosted runners publish too, and the
  database URL in three places must move with it. Keep the port and stop the compose container.
- **No cheap smoke test.** With dry run segfaulting on services jobs, every iteration costs a real run.
- **Fidelity.** act is roughly 90% faithful, and the artifact half is docker-in-docker through the
  host socket. A green `ci:local` in the fork is _less_ authoritative than here, because the app
  container reaches the database over the host's published port rather than a runner-internal one.
- **An unverified assumption.** The fork's gate generates secrets with `openssl`, which is present
  in the runner image by convention but was not verified. If absent, the gate fails in a way that
  looks like an env bug.
- **The build-disable entry is load-bearing.** The act package pulls a ~30MB binary from releases on
  first use. That entry is what keeps it out of every `pnpm install` and out of the container deps
  layer; forgetting it silently taxes every contributor and every image build.

## Checkable Finish

With the compose database down and the host port free:

- `pnpm ci:local -j gate` completes green, and its log shows the act-started service going from
  starting to healthy before step one, then the migration step reporting applied migrations and the
  integration suite **executing rather than skipping** against it — proving the database URL
  resolved to act's service and not to a leftover compose container.
- A full `pnpm ci:local` reaches the artifact job and drives the browser suite against the real image.

Negatively:

- With `pnpm db:up` running, `pnpm ci:local` exits early with the preflight's own message naming the
  collision — never with Docker's "address already in use".
- `pnpm ci:local -n` exits with the unsupported-dry-run message rather than a Go panic.

Plus: a clean-store `pnpm install` fetches no act binary (the vendored binary path is absent until
the first run), and `pnpm check:static` stays green with the tree clean after a run, proving the
store path is ignored.

## Files (in the fork)

- `.actrc`, `scripts/ci-local.ts` (both new)
- `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `pnpm-lock.yaml`
- `.github/workflows/ci.yml`, `lefthook.yml`
- `docs/how-to/verify-change.md`, `scripts/docs/generate-reference.ts`, `docs/reference/commands.md`

## Sequencing

Slices 1 and 2 are independent of each other and of everything else in flight. Slice 3 is a product
decision about where the container-failure class is caught and should be confirmed before it lands;
if it lands, do it before or with Slice 1 so the forged event has a reason to exist. If a buildx
layer cache is ever added, it must land after Slice 1 so the act guard is written at the same time.
