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
  `lint:rules`, `format:check`, `docs:check`, `structure:check`.
- `pnpm test:unit` — the unit suite, integration and rules tests excluded.
- `pnpm test:integration` — the emulator suite plus `pnpm indexes:check`, wrapped in
  `firebase emulators:exec`.
- `pnpm build:ci` — a **secret-less build that still validates**. It supplies explicit
  dummy public values from `scripts/public-env-fixture.ts` — the same list vitest uses
  — so a renamed or forgotten `NEXT_PUBLIC_*` still fails here. There is no flag that
  switches validation off.

`pnpm test:integration`, `pnpm test:emulator` and `pnpm test:e2e:ci` each start their
own emulator instance on the ports in `firebase.json`, so quit anything already holding
them — a `pnpm dev` or a standalone `pnpm emulators` in another terminal — before you
run them.

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

`build:ci` deliberately fills the public-config gap, so it proves the schema is
satisfiable — not that a missing variable fails the build. Only a plain `pnpm build`
with no `.env` on disk proves that:

```bash
mv .env .env.bak && env -i PATH="$PATH" HOME="$HOME" pnpm build; mv .env.bak .env
```

The build must **fail** with `Invalid client Firebase environment`. Running `env -i`
while a `.env` still sits on disk is vacuous — `next build` reads the file.

Server configuration is not covered by either build. It is validated at **boot**
(`lib/env/registry.ts`), so the only way to see it is to start a real server.

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

- **Any UI change** — the affected screen as `admin@aixel.test`, and again as
  `user@aixel.test` if the surface is capability-gated.
- **Auth, session, or capability changes** — signed out, signed in as each role, and
  the redirect a forbidden route produces.
- **Data changes** — create, edit, delete, and paging past the first page.
- **A capability you deleted** — the app boots, navigation has no dead link, and no
  route 500s.

## 5. The artifact, when the change can reach it

The steps above all run against the working tree. Two more prove things about the
image that is actually shipped, and nothing else can see them:

```bash
pnpm smoke:image     # build the production image, run it, probe the artifact
pnpm test:e2e:ci     # emulators + seed + the image + the browser suite
```

Run them when you touched the `Containerfile`, `next.config.ts`, the API envelope,
auth, or anything on a path the browser suite covers.

`pnpm test:e2e` on its own **refuses to run** — it starts nothing and needs a target:

```bash
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
```

Spell the host `localhost`, not `127.0.0.1`: the session-mint route compares the
browser's `Origin` against the request's own origin, so the wrong spelling fails every
test at sign-in with a 403 that looks like a bad password. Non-loopback targets are
refused outright — the suite signs in with a published seed password and creates and
edits records.

## Common mistakes

- **Reporting a green gate as proof.** It is the one check that provably misses this
  repo's bug class. Name a driven observation instead.
- **Reading a green `pnpm build:ci` as the env fail-fast proof.** It supplies dummy
  public values by design. Only step 2 proves a missing var bites.
- **`pnpm indexes:check` on an un-driven emulator.** It reports on queries that ran.
- **A bare `pnpm format`.** Scope it to your paths.
- **Verifying on the wrong Node.** `pnpm node:check` warns when your interpreter is
  not the version the image runs; local evidence gathered on a different runtime is a
  claim about your machine, not about the artifact.
