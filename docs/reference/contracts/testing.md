# Testing contract

- Type: Normative reference contract
- Owns: where a test lives, what infrastructure each layer is allowed to need,
  and the traps that make a suite report green while testing nothing
- Source of truth: `vitest.config.ts`, `playwright.config.ts`, `test/*`, `e2e/*`,
  the `test:*` scripts in `package.json`, and `.github/workflows/ci.yml`
- Verified by: `pnpm test:emulator` (suite + `pnpm indexes:check` in one emulator
  session) and `pnpm test:e2e:ci` (suite against the production image)
- Read when: adding a test, moving one, changing a `test:*` script, or touching
  the CI test step
- Does not define: the composite-index RULE itself
  (`docs/reference/contracts/data.md`), what the container image is
  (`docs/reference/contracts/operations.md`), or the verification procedure a
  change must pass (`docs/how-to/verify-change.md`)

How this repo tests, and — more importantly — the things that look like
improvements and are not.

## The three kinds of test, and why they are in different places

- **Unit tests are COLOCATED** — `lib/data/pagination.contract.test.ts` sits beside
  `lib/data/pagination.contract.ts`. They need nothing but node.
- **Integration tests live in `test/integration/`** — they need a live Firestore
  emulator.
- **E2E tests live in `e2e/`** — they need an emulator, a seed, AND a running app,
  and they drive a real browser (`pnpm test:e2e:ci`).

The split is not filing. It is the one fact that is true of each layer and false
of the one above it: each carries a **larger runtime dependency**. Putting that in
the path makes "this file needs infrastructure" legible before you run it, and it
is what lets a `test:unit` / `test:integration` / `test:e2e` selection exist
without a rename. Everything else stays colocated.

### E2E drives the CONTAINER, never `next start`

`pnpm test:e2e:ci` builds the production image and runs the suite against **that**.
This is not thoroughness for its own sake — `next start` cannot stand in for the
artifact, and Next says so itself on this repo's build:

```
⚠ "next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead.
```

The image runs `node server.js` out of `.next/standalone`. A suite driven through
`next start` stays green while the shipped image serves an unstyled, JS-less page
— which is the failure `scripts/smoke-image.ts` exists to catch, so having the E2E
suite quietly not cover it would be worse than not having it.

Two consequences worth knowing before you touch this:

- **`playwright.config.ts` starts nothing.** No `webServer`. The suite refuses to
  run without `E2E_BASE_URL`, because the alternative — Playwright's
  `reuseExistingServer` — would silently adopt a `pnpm dev` server that happened
  to be on the port and report a DEVELOPMENT build as passing.
- **The E2E image is a TEST artifact, not a deployable one.** The browser reaches
  the Auth emulator only through `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`, and
  `NEXT_PUBLIC_*` is inlined at BUILD time — so an image that can sign in against
  an emulator is necessarily a different image from a production one. That is
  inherent to Next's inlining, not a choice. The Containerfile marks those two
  ARGs test-only and states the failure if they ship.

### `e2e/` is a write path, and it is fenced

The suite signs in with a password this repo publishes (`scripts/_seed-users.ts`)
and it creates and edits assets. Pointed at a real environment it would
authenticate and write real documents with no cleanup. `e2e/target.ts` therefore
**refuses a non-loopback `E2E_BASE_URL`** — a real gate, not a comment.

Note what this is NOT covered by: `structure:check`'s `cli-safety` enforces the
`scripts/_safety.ts` gates across `scripts/**`, but `e2e/` reaches the database
through the app's HTTP layer rather than the Admin SDK, so that check cannot see
it. Being invisible to the machine check is exactly why the fence here has to be
code.

## Green is not the gate — a skipped suite is green

A test that silently does not run reports its subject as tested. `pnpm test` with
no emulator passes green while skipping the data-layer suites; nothing in that
summary says the data layer was never touched.

So the gate is two-sided, and `test/emulator.ts` owns both sides:

- **Locally it SKIPS, loudly.** `pnpm test` has to stay runnable in parallel git
  worktrees, none of which have an emulator, and a human sees the warning.
- **In CI it THROWS.** A missing emulator fails the test FILE at module scope,
  which vitest cannot report as green.

Keyed on `CI` rather than a `REQUIRE_EMULATOR` flag on purpose: every runner sets
`CI` without being asked, whereas a flag can be omitted by a workflow — and
omitting it reopens the hole while staying green, which is the same failure the
gate exists to prevent. `.github/workflows/ci.yml` also wraps the whole run in
`firebase emulators:exec`, so either mechanism alone would be enough.

Write an emulator-backed suite like this:

```ts
const reachable = await requireEmulatorOrSkip('what this suite is')
describe.skipIf(!reachable)('…', () => { … })
```

**If you rewrite the CI test step, this suite silently reverts to skipping.** That
is green, and it is the hole reopening from another direction.

## ⚠️ `vi.useFakeTimers()` near emulator I/O — the trap

**Always narrow it:**

```ts
vi.useFakeTimers({ toFake: ['Date'] })
```

The bare default fakes **every** timer, including the ones `firebase-admin`'s
network stack runs on. The suite then hangs and dies with a timeout that names
nothing:

```
× full fake timers + emulator I/O  8021ms
  → Test timed out in 8000ms.
```

`{ toFake: ['Date'] }` is the entire difference between a passing suite and an
unexplainable one.

With it, `vi.setSystemTime()` pins `new Date()` straight through
`runTransaction`, so `createdAt` is asserted **by value** rather than
`expect.any(Date)` — with **no production code changed** to allow it.

## There is NO in-memory Firestore fake, and you should not build one

A fake would have to reimplement `orderBy` + the `__name__` tiebreaker,
`startAfter(value, docId)` tuple resumption, Timestamp/scalar type matching,
`limit`, `count()`, `where`, `batch()`/`commit()`, `runTransaction`, and the
`FirestoreDataConverter` seam. **That list is not incidental — it is precisely
the set of semantics `paginate()`'s correctness consists of.** A fake does not
test `paginate` against Firestore; it tests `paginate` against one agent's belief
about Firestore, and it is green exactly when that belief is wrong.

**A hand-written Firestore is a hand-kept copy of query SEMANTICS** — a banned
local variant of something the system models generally.

And the decider: **a fake cannot fill the emulator's `indexUsage` report**, so it
cannot satisfy the re-entry condition for `pnpm indexes:check` (below). The
emulator suite does.

What the fake genuinely buys, stated fairly: speed (milliseconds instead of
seconds per suite — irrelevant at this size; buy it later with test selection,
rather than with a second Firestore) and no JVM
(already paid for: `ci.yml` provisions `actions/setup-java`, and the emulator is
required for the rules suite regardless).

**There is no `lib/clock.ts` either**, for the same reason: vitest already models
the clock. A bespoke `Clock` seam threaded through `createAsset` would pay for a
test in _production_ code.

## `pnpm indexes:check` — what fills the report

The composite-index rule itself — that `.where(A,'==') + .orderBy(B)` needs a
declared index and nothing in the toolchain (**not even the emulator**) catches a
missing one — is owned by `docs/reference/contracts/data.md`. What is testing's
concern is **what fills the guard's report**: `scripts/check-indexes.ts` reads back
the index each query _would_ have needed, and **it only knows about queries that
ACTUALLY RAN against that emulator instance.** So the report is a function of what
you drove, and `test/integration/asset-repo.test.ts` drives `listAssets({ status })`
specifically to fill it. `test/integration/template-widget.test.ts` does the same for
the entity generated from `features/_template/` — which is how the copy-me scaffold's
index requirement became a checked fact instead of a comment. It was not one before:
the first run of that suite reported the generated list's index missing.

Two project ids on one emulator:

- project the suite drove → an `OK — …` line naming the observed query shapes and
  confirming every index they require is declared (**exit 0**)
- project nothing queried → `No query requiring a composite index ran against
this emulator instance.` (**exit 1**)

That empty exit-1 state is why `pnpm indexes:check` must ride the SAME
`emulators:exec` session as the suite that drove the queries. It **is** on the CI
gate — `.github/workflows/ci.yml` runs `pnpm test:integration`, and that script is
what wraps `emulators:exec` around the integration suite AND `indexes:check`
together. CI never runs the index check as a separate step, which would meet a
fresh emulator with nothing driven and fail red on an empty report. **Widen the
driving, not the script.** A query shape no test exercises is invisible to it.

## Running the suite

**The one-command way — `pnpm test:emulator`.** It wraps `firebase emulators:exec`
to start auth + firestore, run the whole suite AND `pnpm indexes:check`, then tear
the emulator down, so the integration + rules tests run against clean data every
time. It starts its OWN emulator on the default band, so stop a standalone
`pnpm emulators` first (both use `127.0.0.1:8080`).

It is the convenient local command, **not** the one CI runs. CI takes two steps —
`pnpm test:unit` outside any emulator, then `pnpm test:integration` — so
`test:emulator` drives strictly more inside the emulator than CI does (it puts the
unit suite in there too). Nothing about the emulator-dependent half differs, which
is the half that could diverge; if you want CI's exact shape locally, run those two
scripts, or `pnpm ci:local` to execute the workflow itself.

To run against an emulator you already have up (e.g. the one behind `pnpm dev`),
point `pnpm test` at it explicitly instead:

```
FIRESTORE_EMULATOR_HOST=127.0.0.1:8110 \
FIREBASE_PROJECT_ID=demo-aisa GCLOUD_PROJECT=demo-aisa pnpm test

FIRESTORE_EMULATOR_HOST=127.0.0.1:8110 FIREBASE_PROJECT_ID=demo-aisa pnpm indexes:check
```

`GCLOUD_PROJECT` is belt-and-braces: `getFirebaseAdminConfig().projectId` reads
`FIREBASE_PROJECT_ID`, and the Admin SDK falls back to `GCLOUD_PROJECT` when
`initializeApp({ projectId })` gets `undefined`. Setting both makes the routing
explicit rather than lucky.

**Do not run `pnpm seed` to get fixtures.** `scripts/seed-emulator.ts:seedAssets`
**deletes the entire `assets` collection** before re-seeding. On your own emulator
that wipes your own fixture mid-run, and the symptom reads as a pagination bug.
Use `test/builders/` — and scope assertions to ids your test created, never to a
collection-wide count, so leftover rows cannot move them.

**Emulator-backed suites run SERIALLY (`--no-file-parallelism`), and must.**
`pnpm test` and `pnpm test:integration` both carry the flag. Vitest's default is
one worker per FILE, and every integration file talks to the SAME emulator — one
Firestore, one Auth directory. Two of them running at once is not "slow tests
racing", it is two suites mutating shared singletons:

- `adminLocks/accountMutation` is ONE document by design (see `lib/auth/admin-lease.ts`),
  so `admin-lease.test.ts` and any suite performing an account mutation fight over
  the same lock and both observe the other's generation.
- `countAdmins()` reads the WHOLE Auth directory, so any suite creating accounts
  in another worker changes what a lockout test counts.

This was found the honest way: `admin-lease.test.ts` failed in bulk the moment the
suites ran in parallel. Removing the flag reintroduces it, and the failure
looks like a flaky lease rather than a scheduling bug, so do not "optimise" it
back. `pnpm test:unit` is untouched and still parallel; use it for the fast loop.

## `vitest.config.ts` is load-bearing in every block

Nothing here is decoration; each block has a silent-failure story.

- **The `@` alias** — vitest reads no tsconfig paths. Without it any test
  importing `@/…` dies at **collection**, contributing **zero** tests while the
  summary reports the rest as passed.
- **The `server-only` alias** (`test/stubs/server-only.ts`) — same silent-zero,
  for the entire data layer. It is a resolver alias, not an import; nothing
  "imports from `test/`" and nothing is broken.
- **`TZ: 'UTC'`** — makes `lib/format`'s zone pin falsifiable. On a WIB machine
  the pin is unfalsifiable: delete `timeZone` from the formatters and every
  assertion still passes because host == target.
- **The public env fixture** (`...PUBLIC_ENV_FIXTURE`) — see below.
- **`FIREBASE_PROJECT_ID` is DEFAULTED, not fixed** (`?? 'demo-aisa'`).
  `firebase emulators:exec` exports `FIRESTORE_EMULATOR_HOST` and
  `GCLOUD_PROJECT` but never `FIREBASE_PROJECT_ID`, so without the default the
  integration suite cannot name the project it is already pointed at and every
  test touching `adminDb()` dies. It must stay a fallback: a real
  `FIREBASE_PROJECT_ID` in the environment has to WIN, or a run is silently
  redirected at the emulator project while the operator believes otherwise.
- **`exclude: ['.claude/worktrees/**']`** — worktrees live _inside_ this repo, so
  without it every test file exists twice and the suite runs each twice. The
  pass count doubles while half of it is the same file counted again, and a
  worktree mid-edit reports failures against code that is not on this branch.

### The public env fixture — why the suite supplies values instead of switching validation off

Every repo reaches the Firebase config layer through `lib/firebase/*`, so a test
importing `@/features/asset/asset.repo` with no public env throws
`Invalid client Firebase environment` — and `paginate()`,
`zodConverter`, `assetsCollection()`, and every repo function become unreachable
from a test. `vitest.config.ts` closes that by spreading
`PUBLIC_ENV_FIXTURE` (`scripts/public-env-fixture.ts`) into `test.env`, so a test
may import a repo — do not treat "a test cannot import a repo" as a law. Keep
pure logic in its own module anyway (`lib/data/batch.ts`'s arithmetic,
`lib/data/deadline.ts`'s timeout constant): separated from I/O, it stays reachable
with no emulator and no JVM.

**Explicit dummy values, not a bypass — this is the whole point.** The predecessor
was a bypass flag that made `validate()` hand back its input unparsed (its
rationale survives as a comment in `lib/env/validate.ts`). That is strictly worse in two ways. It made the type lie: the schema
said `string` while the value could be `undefined`, so the hollow config sailed
past every reader that happened not to look. And it meant the one guard against a
bad boot could itself be switched off — a build that passed with no env had proven
nothing at all. With a fixture, `getFirebaseClientConfig()` parses for real in
every run, so **a renamed or forgotten `NEXT_PUBLIC_*` still fails** here and in
CI: the fixture would no longer satisfy the schema. A flag could never catch that;
it existed precisely to not look.

**One source, two consumers.** The same module feeds `vitest.config.ts` and
`pnpm build:ci` (`scripts/build-ci.ts`). A second copy of the literals in either
place would be a list to keep in sync, and the copy that drifted would be the one
that let a real gap through. The values are placeholders and must never be real
credentials — the file is committed, and a build that shipped them would point a
downstream fork at someone else's Firebase project. `build:ci` applies them
**without overriding** what a caller already set, so the Containerfile's real
build args win; it also never runs in the image build, which uses plain
`pnpm build`.

**Server config is untouched by the fixture.** It is read lazily through
`lib/env/server.ts` and the capability configs, so a data-layer test still sees
the real `FIRESTORE_EMULATOR_HOST` / `FIREBASE_PROJECT_ID` from `process.env` —
which is what routes `adminDb()` at the emulator with no credential.

The env fail-fast is untouched: `env -i pnpm build` **with `.env` moved aside**
still fails on env validation, as intended. **A vitest process is not a bundle**
— it inlines nothing, ships nothing, and has no client boundary to poison — which
is why supplying values here costs nothing that matters.

This is not machine-local: **vitest reads no `.env` file** (Vitest 4 ships no
dotenv and has no `loadEnv`/`envDir`), so the wall stands identically everywhere
and the fixture creates no "works on my machine" gap.

`test/data-layer-reachable.test.ts` is the guard on all of the above: it asserts
both that a repo is importable and that `validateClientEnv()` still throws on a
module graph with the public env cleared. Its import is **dynamic** on purpose — a
top-level import that throws dies at collection, which is the silent-zero mode.

## `test/builders/`

Small, typed from the schema they build, never re-declaring it:

- `signedInAs(role)` — `Session` read from `@/lib/auth/session`. `role` is not
  defaulted: every caller is a test about authorization, and the role split
  (`user` holds `asset:read` but not `asset:write`) is what gives it teeth.
- `anAsset()` / `assets(n)` — return `AssetCreate`. **No `createdAt`**: the server
  owns it, so stagger by advancing `vi.setSystemTime` between creates. The
  stagger is then produced by the code under test, not asserted by a fixture
  against a value it wrote itself.

**Do not extract a repo double into `test/`.** The `vi.mock` stub block in
`features/asset/asset.action.test.ts` is a hand-kept copy of the repo's export list;
hoisted into `test/` it becomes a parallel taxonomy that goes stale **green** the
first time a repo function is added. One call site is not a pattern. If a second
appears, derive it (`vi.mock(path, async (importOriginal) => …)`) — a filter over
the real module rather than a copy of it.
