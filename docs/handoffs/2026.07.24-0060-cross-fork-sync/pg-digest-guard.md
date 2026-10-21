# Brief: Production-Image Digest Guard

For the PostgreSQL lead. This repository does not edit that workspace; paths below are
destinations for that repository's own commits.

Status: `OPEN — gap confirmed by static read of both trees`. Effort: S. Severity: security.
This is the smallest, most self-contained item in the set and a reasonable first move.

## The Gap

This repository added `scripts/check-image-digest.ts` and a `pnpm image:check` command that
refuses a production `APP_IMAGE` not pinned by `@sha256:`. A tag is a mutable pointer:
`:latest` and `:v1.4.2` alike can be repointed at other bytes after they were tested, so the
build stamp the health endpoint reports would describe an image no longer running, and a
rollback to "the same tag" can land somewhere else entirely. A digest cannot be repointed,
because the digest _is_ the bytes.

The fork has no equivalent. Searching it for `image:check`, `check-image-digest` or a digest
guard finds nothing; its only `sha256` hits are the digest-pinned Postgres image in
`compose.yaml` and CI, a Trivy action pin, and a handoff checksum.

Its `compose.prod.yaml` is byte-comparable to this repository's pre-fix version — same
`${APP_IMAGE:?…}` line, same comment calling digest pinning "a discipline, not an
enforcement". Compose can check only that the variable is PRESENT; it has no way to assert
the shape of a value, so `APP_IMAGE=ghcr.io/attacker/whatever:latest` is accepted and run.
Three of the fork's docs still carry the "nothing enforces it" sentences this repository
replaced: `docs/how-to/deploy.md:102`, `docs/reference/contracts/operations.md:133-137`,
`docs/explanation/deployment-model.md:120`.

## What To Copy Near-Verbatim

The whole of it, minus the wording noted below: the `DIGEST_PINNED` regex and the
`isDigestPinned` export, the three-state messaging (unset / tag / OK), the
`existsSync('.env') && process.loadEnvFile('.env')` resolution, and the entire unit test.

The env resolution deserves a note, because it looks like a bug and is not. It resolves
`APP_IMAGE` exactly the way compose does — exported environment, then the project
directory's `.env` — and deliberately _not_ through the shared loader, which would also read
`.env.local`. Compose never reads that file, so using the shared loader would validate a
value the deploy will not use: green here, a different image running.

## What Must Not Be Copied Verbatim

Four adaptations, each of which would otherwise write a sentence the fork's code does not
support:

- **The shared-loader paragraph** names this repository's `scripts/env-files.ts`. The fork's
  loader is `scripts/_env.ts` (`loadEnvFiles()`, no cwd argument) and likewise reads
  `.env.local` first. The reasoning survives; the filename must change.
- **The CLI guard.** This repository uses `process.argv[1]?.endsWith('check-image-digest.ts')`,
  which would also fire for a different file with the same basename. The fork already has a
  stricter idiom — `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`, as in its
  `scripts/docs/generate-reference.ts:1198-1200`. Use the fork's.
- **The base-image paragraph.** Keep the substance: the Node base is pinned by exact tag
  rather than digest because a digest cannot interpolate the `NODE_VERSION` build argument,
  and `pnpm node:check` proves the tag agrees with `.node-version`. But do not repeat this
  repository's blanket "base images stay tag-pinned" — the fork's dev Postgres base _is_
  digest-pinned, so the blanket claim would be false there. Scope it to the Node base.
- **`docs/reference/commands.md` is generated in the fork too.** The entry goes in
  `COMMAND_NOTES` under the existing "Build and ship" group, followed by `pnpm docs:generate`.
  Hand-editing the file will fail `docs:check`.

## Lifecycle Placement

Standalone, exactly as here. **Do not add it to `check:static` or `verify`** — both run in a
working tree where `APP_IMAGE` is legitimately unset, so it would turn every local verify
red for a non-defect.

It belongs in the job that cuts the deploy, called immediately before
`docker compose -f compose.prod.yaml up -d`. The docs must say plainly that nothing in the
repository can force that call.

## What It Does Not Prove

Say this in the docs, because the temptation to overclaim is the whole risk. This is offline
shape validation. Nothing contacts a registry. It cannot tell you the digest names an image
that exists, that it is the one you built, or that it is reachable.

Replacing "nothing enforces this" with "enforced" would be the same overstatement in
reverse — the defect the fork's own contributor guide names as its most expensive recurring
one.

## Risks

Low blast radius: the guard is additive, imports nothing from the app, contacts no registry,
and no existing script calls it. The traps are procedural:

- **Ordering.** `docs:check` cross-references every `pnpm <name>` mentioned in a doc against
  `package.json#scripts`, and `generate-reference.ts` throws both ways — a script without a
  note, and a note without a script. Land the script, the package.json entry, the
  `COMMAND_NOTES` entry and the regenerated `commands.md` in one change or `check:static`
  fails.
- **Generated-file drift.** `docs/reference/commands.md` carries a generated banner.

## Checkable Finish

Driven in the fork, in all three states, with the observed output reported:

1. **Unset** — with no `APP_IMAGE` in `.env`, `env -u APP_IMAGE pnpm image:check` exits
   non-zero and names the two places it looked.
2. **The attacker tag from the compose file's own comment** —
   `APP_IMAGE=ghcr.io/attacker/whatever:latest pnpm image:check` exits non-zero and prints
   the offending reference.
3. **A real digest** — `APP_IMAGE=ghcr.io/you/aixel-app@sha256:<64 hex> pnpm image:check`
   exits 0.
4. **Precedence proven, not assumed** — put a `:latest` value in `.env`, confirm the guard
   rejects it and that `docker compose -f compose.prod.yaml config` resolves `image:` to that
   same value, then confirm an exported digest beats the file.
5. `pnpm test:unit` picks the new test up (the count rises) and `pnpm check:static` is green
   with `commands.md` regenerated rather than hand-edited — proven by `pnpm docs:generate`
   leaving the tree clean.

## Files (in the fork)

- `scripts/check-image-digest.ts`, `scripts/check-image-digest.test.ts`
- `package.json`, `scripts/docs/generate-reference.ts`, `docs/reference/commands.md`
- `compose.prod.yaml`
- `docs/how-to/deploy.md`, `docs/reference/contracts/operations.md`, `docs/explanation/deployment-model.md`

## Sequencing

Independent of every persistence topic. If other doc-porting work also edits the operations
contract, the deploy how-to, or `generate-reference.ts`, serialize with it to avoid
conflicts; otherwise this can go first or last.
