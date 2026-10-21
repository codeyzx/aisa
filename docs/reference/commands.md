<!--
GENERATED FILE — DO NOT EDIT BY HAND.

Regenerate with: pnpm docs:generate
Generated from:
  - package.json

Hand edits are overwritten by the next run. `pnpm docs:check` fails its
generated-drift rule for as long as this file disagrees with the sources
above, so a source that moves ahead of this doc is a red check, not a
silently stale page.
-->

# Commands

Every script this repo defines, what it runs, and when you would reach for it.

The fenced block under each heading is the literal command from `package.json`.

## Run the app

### `pnpm dev`

```
firebase emulators:exec --ui --project demo-aisa --import=./.emulator-data --export-on-exit=./.emulator-data "pnpm setup:local && pnpm dev:next"
```

The whole local stack in one command. Starts the Firebase emulators (data persisted across restarts in `.emulator-data/` via `--import`/`--export-on-exit`), runs `pnpm setup:local` to create `.env` and seed only when the database is empty, then runs `next dev` with hot reload. Ctrl+C exports the emulator data and tears the emulators down. Use `pnpm dev:next` to skip all of that when the emulators and `.env` are already in place.

### `pnpm dev:next`

```
next dev
```

Just `next dev`, nothing else — for when `pnpm emulators` is already running in another terminal and a `.env` is in place. This is the raw server `pnpm dev` wraps; reach for it when you want the emulators to outlive a server restart, or when debugging the dev server on its own.

### `pnpm emulators`

```
firebase emulators:start --project demo-aisa
```

Start the Firebase Auth + Firestore emulators under the `demo-aisa` project. Leave it running in its own terminal; everything local talks to it, and the destructive data scripts refuse to run without it.

## Local data

### `pnpm setup:local`

```
node scripts/setup-local.ts
```

Get a fresh clone from nothing to a signed-in app: creates `.env` from `.env.example`, waits for the emulators, seeds the accounts and the fake AISA data when `settings/rules` is missing (or only the accounts when data exists but none do), and prints the test accounts. Non-destructive by contract, so re-running it is the supported way to check your setup.

### `pnpm seed`

```
node scripts/seed-emulator.ts
```

Reset the example data: upserts the sign-in-able accounts and rewrites the example assets. Destructive by design — it clears the assets collection first, so anything you made through the UI goes with it. Same emulator-only fence as `db:reset`.

### `pnpm db:reset`

```
node scripts/db-reset.ts
```

Wipe the local emulator database — every Firestore document and every Auth account. Prints the plan and deletes nothing unless you pass `-- --apply`, and refuses to run at all unless both emulator hosts are set, so it cannot reach a real database.

### `pnpm migrate`

```
node scripts/migration/run.ts
```

Run the data migrations. Firestore is schemaless, so a migration is a script that rewrites documents rather than DDL. Dry-run by default; `--apply` prints the resolved target and makes you type the project id back before it writes, because reaching production is the whole point of a migration.

### `pnpm snapshot:export`

```
node scripts/snapshot/export.ts
```

Dump every top-level Firestore collection to diffable JSON. Read-only against the database. Sub-collections nested under a document are out of scope.

### `pnpm snapshot:restore`

```
node scripts/snapshot/restore.ts
```

Write a snapshot directory back into Firestore. Plan-only by default; `--apply` writes, `--wipe` deletes first, and both stand behind schema validation, a project guard, and typed project-id confirmation on the controlling terminal.

## Checks

### `pnpm node:check`

```
node scripts/check-node-version.ts
```

Prove every place that pins a Node version still agrees. Drift between them is invisible to every other check and only surfaces as a production-only failure. A mismatched running interpreter is a warning, not an error, because no commit can fix it.

### `pnpm typecheck`

```
tsc --noEmit
```

Typecheck with no emit. Necessary before shipping, never sufficient.

### `pnpm lint`

```
oxlint --deny-warnings
```

Lint the tree. A warning fails it, same as an error.

### `pnpm lint:fix`

```
oxlint --fix
```

Lint and apply the fixes the linter can make itself.

### `pnpm lint:rules`

```
ast-grep scan && ast-grep test --skip-snapshot-tests
```

Run the repo-specific structural rules and their own tests — the hand-written patterns that guard things a general linter has no opinion about.

### `pnpm format`

```
oxfmt
```

Format the tree in place.

### `pnpm format:check`

```
oxfmt --check
```

Fail if anything is unformatted. This is the CI-shaped form.

### `pnpm templates:check`

```
node scripts/check-templates.ts
```

Prove the copy-me entity templates still compile. They are excluded from the normal typecheck because of their placeholder tokens, which is exactly what lets them rot onto whoever forks next; this substitutes real names outside the worktree and typechecks the result.

### `pnpm structure:check`

```
node scripts/structure/check.ts
```

The architecture gate. Loads the TypeScript program and runs the module boundary and safety contracts over the resolved import graph — an aliased and a relative import are the same edge, which a text search cannot see.

### `pnpm docs:check`

```
node scripts/docs/check.ts
```

The documentation ownership gate: every doc is tracked and linked, every normative contract carries its ownership metadata, every relative link resolves, no brittle references, and no generated reference has drifted from its source.

### `pnpm docs:generate`

```
node scripts/docs/generate-reference.ts
```

Regenerate the generated reference docs from source. Run it whenever `docs:check` reports generated drift, and never edit those files by hand.

### `pnpm indexes:check`

```
node scripts/check-indexes.ts
```

Diff the composite indexes the queries you just ran actually needed against the ones declared. Run it after driving the app or the integration suite against a live emulator — the emulator happily runs queries with no index, so this is the only thing standing between a filtered query and a production-only failure. It only knows about queries that really ran.

### `pnpm check:static`

```
pnpm node:check && pnpm typecheck && pnpm templates:check && pnpm lint && pnpm lint:rules && pnpm format:check && pnpm docs:check && pnpm structure:check
```

Every static gate in one command: Node pins, types, templates, lint, structural rules, formatting, docs, architecture.

### `pnpm verify`

```
pnpm check:static && pnpm test:unit && pnpm test:integration && pnpm build:ci && echo "verify: static + unit + integration + build passed. DRIVEN steps are NOT covered here — run them per docs how-to and the verify skill: emulator sign-in, browser acceptance matrix, env fail-fast, production container smoke, and E2E."
```

The full non-driven chain: static gates, unit, integration, build. It ends by naming its own hole out loud — sign-in, the browser acceptance matrix, the env fail-fast, the container smoke and the browser suite are not covered and have to be driven.

### `pnpm ci:local`

```
node scripts/ci-local.ts
```

Run the actual .github/workflows/ci.yml locally, in containers, via nektos/act — both jobs, including the merge-only artifact job (image build, container E2E, Trivy). Same file CI runs, so no second list drifts, and it runs on the shipped Node rather than your host, curing the wrong-runtime skew node:check warns about. The fallback when CI is unavailable or the minute budget is spent. `--fresh` disables caching; act is ~90% faithful, not the authority. The tool is pinned via @kie/act-js and fetched on first use, not at install.

## Tests

### `pnpm test`

```
vitest run --no-file-parallelism
```

The whole suite, serialized. The integration tests want a live emulator, so plain `pnpm test` is for a session where one is already running.

### `pnpm test:unit`

```
vitest run --exclude '**/test/integration/**' --exclude '**/firestore.rules.test.ts'
```

Everything that needs no emulator. This is the fast inner loop and the part CI can run without spinning anything up.

### `pnpm test:integration`

```
firebase emulators:exec --project demo-aisa --only auth,firestore "pnpm vitest run --no-file-parallelism test/integration firestore.rules.test.ts && pnpm indexes:check"
```

The emulator-backed tests plus the security-rules tests, started against a throwaway emulator and followed by the index check — so a query that needs an index it does not declare fails here rather than in production.

### `pnpm test:watch`

```
vitest --exclude '**/test/integration/**' --exclude '**/firestore.rules.test.ts'
```

The unit tests, re-run as you edit.

### `pnpm test:emulator`

```
firebase emulators:exec --project demo-aisa --only auth,firestore "pnpm test && pnpm indexes:check"
```

The full suite plus the index check inside a managed emulator. Use it when you have no emulator running and want the whole thing in one shot.

### `pnpm test:e2e`

```
playwright test
```

The browser suite against whatever the Playwright config points at. Use it while iterating on a spec with your own server already up.

### `pnpm test:e2e:container`

```
node scripts/e2e-container.ts
```

The browser suite against the production image rather than the dev server, because a suite driven through the dev server is green while the shipped image serves an unstyled page.

### `pnpm test:e2e:ci`

```
pnpm test:e2e:fast
```

The one-command form used by the pipeline: the same command as `test:e2e:fast`.

### `pnpm test:e2e:fast`

```
node scripts/e2e-fast.ts
```

Build the E2E image once, then split the browser suite over `--shards N` (1–9, default 4), each shard with its own container (port 3201 upward) and its own seeded Firestore emulator, sharing one Auth emulator on 127.0.0.1:9099. Other arguments (spec files, `--grep`) go to every shard's `playwright test`. Each shard costs a container, a JVM and a browser in memory; use `--shards 2` on a busy machine.

## Build and ship

### `pnpm build`

```
next build
```

The real production build, with the real environment. `next.config.ts` calls the public-env validator, so a malformed `NEXT_PUBLIC_*` (today only the optional Sentry DSN) fails here — which is the only place it can fail, since those values are inlined into the browser bundle and cannot be fixed after the build.

### `pnpm start`

```
next start
```

Serve a build produced by `pnpm build`. Note that the shipped container does not use this: the image runs the standalone server entrypoint directly, which is why the container smoke test exists.

### `pnpm build:ci`

```
node scripts/build-ci.ts
```

A secret-less build that still validates. It supplies explicit non-secret dummy public values instead of turning validation off, so a green build still means the public schema is satisfied. It proves nothing about server secrets, which are checked at boot.

### `pnpm image:check`

```
node scripts/check-image-digest.ts
```

Refuse an `APP_IMAGE` that is not pinned by digest. Run it in the job that cuts the deploy: `compose.prod.yaml` can only require the value to be present, so a moving tag reaches production otherwise and the build stamp then describes an image you are no longer running. Resolves `APP_IMAGE` the way compose does — exported environment, then the project directory `.env`, never `.env.local`. Shape only; it contacts no registry.

### `pnpm smoke:image`

```
node scripts/smoke-image.ts
```

Build the production image, run it, and assert the things only the ARTIFACT can be wrong about: static assets actually copied, a non-root user, a real build stamp on the health route, the security headers, a health check that passes, an entrypoint that forwards termination signals, and no-store on API responses.

## Lifecycle

### `pnpm prepare`

```
node scripts/install-hooks.ts
```

Install the git hooks. Runs automatically on `pnpm install`; you should not need to call it yourself.
