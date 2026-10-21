# Verify a change

Green is necessary and never sufficient. This repo's worst bug class — a missing
composite index, an env var that is only read at boot, a container that assembles
wrong — passes typecheck, lint **and** build. A change is verified when it is
**green AND driven**, and what you report is the behaviour you observed, not the gate
that exited zero.

The `verify` skill is this page as a runnable checklist.

## 1. The green chain

```bash
pnpm verify
```

That is `pnpm check:static && pnpm test:unit && pnpm test:integration && pnpm build:ci`,
and it prints its own hole when it passes: the driven steps below are not covered by
it.

The pieces, if you want to run them one at a time:

- `pnpm check:static` — `node:check`, `typecheck`, `templates:check`, `lint`,
  `lint:rules`, `format:check`, `docs:check`, `structure:check`. `lint` runs oxlint
  with `--deny-warnings`, as does the pre-commit hook, so a warning fails the gate
  exactly as an error does.
- `pnpm test:unit` — the unit suite, integration and rules tests excluded.
- `pnpm test:integration` — the emulator suite plus `pnpm indexes:check`, wrapped in
  `firebase emulators:exec`.
- `pnpm build:ci` — a **secret-less build that still runs the public-env validation**.
  It supplies the dummy public values from `scripts/public-env-fixture.ts` — the same
  list vitest uses: dummy values for the six required `NEXT_PUBLIC_FIREBASE_*`. There is no
  flag that switches validation off.

`pnpm test:integration` and `pnpm test:emulator` each start their own emulator
instance on the ports in `firebase.json`, and `pnpm test:e2e:ci` starts its own Auth
emulator on 9099 plus one Firestore emulator per shard (8181 upward), so quit anything
already holding them — a `pnpm dev` or a standalone `pnpm emulators` in another
terminal — before you run them. The E2E runner refuses rather than adopt one.

### When lint warns

Fix the code when the warning is right. When a pattern is deliberate, disable the
rule on that one line and say why on the same line:
`// oxlint-disable-next-line no-await-in-loop -- readiness poll: one probe, then a pause`.

Path-wide exemptions live in the `overrides` of `.oxlintrc.json`. JSON carries no
comments, so each one's reason is recorded here:

- `components/ui/**` — vendored shadcn code; see `docs/reference/contracts/ui.md`.
- `features/_template/**` and `scripts/migration/_template.ts` turn off
  `no-underscore-dangle`: `__entity__`-style names are the placeholders the template
  generator substitutes, so the dangling underscores are the point.
- `e2e/**` turns off `no-await-in-loop`: a spec drives one browser page, and its clicks,
  navigations and assertions must run in order; the mock aisa-api's listen retry is a
  backoff, which is sequential by definition.
- `lib/http/index.test.ts` turns off `no-await-in-loop`: the rate limiter counts hits,
  so the hits must land one after another.

### The whole CI, locally — `pnpm ci:local`

`pnpm verify` runs the green chain on **your** machine's runtime. `pnpm ci:local`
runs the actual `.github/workflows/ci.yml` — **both** jobs, `gate` and the merge-only
`artifact` (image build, container E2E, Trivy) — in containers via
[nektos/act](https://github.com/nektos/act), on the **shipped Node 24.18** rather than
whatever your version manager serves. It is the same file CI runs; there is no second
list to drift.

Reach for it when:

- **CI is unavailable or the month's minutes are spent** — this is the full gate on
  your own metal.
- **You want the `artifact` job before merging** — CI runs it only on merge-to-main
  (that is the minute-saving trade), so this is where you see it earlier.
- **`pnpm node:check` warned your interpreter is not 24.18** — `ci:local` sidesteps the
  skew entirely by running the workflow's own `setup-node`, so it is the honest answer
  to "but it passed on my machine."

```bash
pnpm ci:local            # cached: reuse the pulled image + act's cache server
pnpm ci:local --fresh    # clean room: no restored caches, re-pull the image
pnpm ci:local -j gate    # one job (any act flag passes straight through)
```

The first run is heavy — it pulls a multi-GB runner image and the emulator/browser
toolchains — and act is ~90% faithful, not a VM; the `artifact` half runs
docker-in-docker through your daemon. Treat a green `ci:local` as strong local
evidence, **not** as the authority. GitHub's runners are that, and the driven steps
below (browser, env fail-fast) are still yours to run — `ci:local` does not cover them.
The tool is pinned via `@kie/act-js`, fetched on first use (not at `pnpm install`).

**What the gate covers under act.** A full `ci:local` gate runs the whole chain on the
faithful Node — `check:static`, `test:unit`, `test:integration` (a real emulator) and
`build:ci` all pass in-container — which is exactly the half this machine's toolchain
cannot reproduce. `pnpm audit --prod` runs too, and will red the gate on a genuine
advisory the same way GitHub does — that is the audit working, not an act quirk, so fix
the dependency rather than the runner. (One thing pnpm's store must stay out of the way
for: a project-local `.pnpm-store/` is gitignored precisely so it cannot dirty the tree
under act; see `.gitignore`.) The container `artifact` job can also be driven directly,
and slightly more faithfully, with `pnpm smoke:image` and `pnpm test:e2e:ci`.

**Format only your own paths.** A bare `pnpm format` rewrites the whole tree,
including anyone else's uncommitted work:

```bash
pnpm exec oxfmt <your paths>
```

## 2. Prove the env fail-fast still bites

The fail-fast lives at server **boot**, not in the build. `next build` requires no
public variable, so `pnpm build` succeeds with no `.env` at all and proves nothing about
config. `instrumentation-node.ts` validates every enabled group in
`lib/env/registry.ts` before the first request and, if any fails, logs them all and
exits. Start the built standalone server with an empty environment:

```bash
pnpm build:ci   # or pnpm build — either produces .next/standalone
env -i PATH="$PATH" HOME="$HOME" node .next/standalone/server.js; echo "exit=$?"
```

It must log `[boot] environment is invalid, refusing to serve` with one `failures`
entry per missing group — the Firebase project and the aisa-api URL and key — and exit
with status 1. Next prints `Ready`
before the check runs, so the exit is the proof, not the banner. The standalone server
reads a `.env` from its own directory, so confirm none sits in `.next/standalone/` or
the run is vacuous.

## 3. Composite indexes, if you touched a query

A filtered-and-sorted query needs a composite index that no gate above catches. The
rule and its failure mode are owned by
[the data contract](../reference/contracts/data.md); this is how you check for one.

```bash
pnpm emulators       # then exercise the new query in the browser or a test
pnpm indexes:check   # diffs observed index demand against firestore.indexes.json
```

`indexes:check` only sees queries that actually ran. If a shape was never exercised it
is invisible — widen the driving, never the script.

## 4. Drive it

Start the emulators and the app, sign in, and exercise your change in a browser. This
is the step that catches what the gates cannot. What to cover depends on the change:

- **Any UI change** — the affected screen, signed in as a seeded account
  (`manager@aisa.test` is admin, `viewer@aisa.test` is the read-only `user`; password
  `password123`, printed by `pnpm seed`), so a capability-gated surface can be driven
  from both sides.
- **Auth, session, or capability changes** — signed out, signed in, a wrong password,
  and sign-out landing back on `/login`.
- **Data changes** — create, edit, delete, and paging past the first page.
- **A capability you deleted** — the app boots, navigation has no dead link, and no
  route 500s.

## 5. The artifact, when the change can reach it

The steps above all run against the working tree. Two more prove things about the
image that is actually shipped, and nothing else can see them:

```bash
pnpm smoke:image     # build the production image, run it, probe the artifact
pnpm test:e2e:ci     # the image + emulators + seed + the browser suite, sharded
```

Run them when you touched the `Containerfile`, `next.config.ts`, the API envelope,
auth, or anything on a path the browser suite covers.

`pnpm test:e2e:ci` is `pnpm test:e2e:fast` (`scripts/e2e-fast.ts`). It builds the
image once, then splits the suite with Playwright's `--shard=i/N` over `--shards N`
(1–9, default 4, capped at the number of selected tests). Each shard gets its own app
container (port 3201 upward) and its own seeded Firestore emulator (8181 upward); all
shards share one Auth emulator on `127.0.0.1:9099`, because that address is inlined
into the image's browser bundle. Arguments other than `--shards` go to every shard's
`playwright test`:

```bash
pnpm test:e2e:fast --shards 2 e2e/auth.spec.ts      # one file, two shards
pnpm test:e2e:fast --grep "wrong password"          # one test by title
pnpm test:e2e:fast --shards 1                       # the old single-runner shape
```

Each shard is a container, a Firestore JVM and a browser, so memory scales with N; use
`--shards 2` when the machine is doing anything else. Per-shard logs, emulator logs and
the merged JSON report are in `test-results/e2e-fast/`; a failing shard's log —
which includes its container's logs — is printed whole at the end of the run.

`pnpm test:e2e` on its own **refuses to run** — it starts nothing and needs a target:

```bash
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
```

Spell the host `localhost`, not `127.0.0.1`: the session-mint route compares the
browser's `Origin` against the request's own origin, so the wrong spelling fails every
test at sign-in with a 403 that looks like a bad password. The suite signs in as the
seeded accounts (`e2e/sign-in.ts` imports them from `scripts/_seed-users.ts`), so the
target must point at a seeded Auth emulator, and the browser bundle must carry
`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`. Non-loopback targets are refused outright.

## Common mistakes

- **Reporting a green gate as proof.** It is the one check that provably misses this
  repo's bug class. Name a driven observation instead.
- **Reading a green build as the env fail-fast proof.** No build validates a required
  var any more. Only the boot in step 2 proves a missing var bites.
- **`pnpm indexes:check` on an un-driven emulator.** It reports on queries that ran.
- **A bare `pnpm format`.** Scope it to your paths.
- **Verifying on the wrong Node.** `pnpm node:check` warns when your interpreter is
  not the version the image runs; local evidence gathered on a different runtime is a
  claim about your machine, not about the artifact.
