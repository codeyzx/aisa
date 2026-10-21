# Back up and restore Firestore

Dump every top-level Firestore collection to diffable JSON, and load it back. Two
commands, and a restore that is destructive enough to be gated four ways. Data
migrations — the third script that can write to a real database — are at the
bottom of this page, behind the same typed-project-id gate.

```bash
pnpm snapshot:export                  # → snapshots/<timestamp>/<collection>.json
pnpm snapshot:restore <dir>           # prints the plan — writes nothing
pnpm snapshot:restore <dir> --apply   # merge-write it back (upsert, non-destructive)
```

## Which database these touch

**Whatever the loaded environment points at.** There is no `--target` flag:

- `FIRESTORE_EMULATOR_HOST` set → the local emulator (the Admin SDK routes itself).
- Not set → real credentials and the real project.
- `FIREBASE_PROJECT_ID` selects the project — exported environment, then `.env.local`,
  then `.env`, the same order the migration runner uses. Defaults to `demo-aisa`.

So loading production environment into your shell is how you snapshot production — and
it is also how you would restore into it by accident. Both commands print the resolved
project and say plainly whether the target is an emulator or production before they do
anything.

## Export

```bash
pnpm snapshot:export
pnpm snapshot:export --out backups/before-migration
```

Read-only against Firestore: its only writes are the JSON files. Output is one file per
collection plus a `_manifest.json` recording the source project and the per-collection
counts.

Values are run through a lossless codec, so a `Timestamp` comes back a `Timestamp`
rather than a plain object — SDK types are tagged in the JSON so the format cannot
silently degrade them.

**Ceiling: top-level collections only.** Enumeration returns root collections;
sub-collections nested under a document are not walked, on export or restore. The data
model this starter ships is flat, so that matches it — a nested model would need a
recursive walk this deliberately does not do. `scripts/snapshot/README.md` owns the JSON
format and this ceiling.

## Restore

```bash
pnpm snapshot:restore <dir>                    # the plan
pnpm snapshot:restore <dir> --apply            # merge: upsert, never deletes
pnpm snapshot:restore <dir> --apply --wipe     # exact mirror: delete, then rewrite
```

Document ids are preserved. The default write mode is a merge — an upsert that never
deletes. `--wipe` deletes every document in each target collection first, then rewrites,
which is what makes the result an exact mirror of the snapshot.

### The four rails, and why each is there

1. **Plan by default.** A bare restore prints the exact plan — collections, counts,
   mode, source project, target project, emulator or production — and writes nothing. It
   never even opens an SDK connection. Writing takes `--apply`. There is no preview
   flag, because the default _is_ the preview, so nobody can forget to ask for one. The
   plan prints ahead of the write gates, so a project mismatch is shown loudly rather
   than hidden behind an abort.

2. **Schema validation before a client exists.** `_manifest.json` and every collection
   file are parsed before Firestore is reachable, and the _order_ is the property: a
   corrupt or hand-edited snapshot fails with nothing connected, nothing written and —
   under `--wipe` — nothing deleted. A snapshot is hand-editable JSON that names the
   collections to write and to delete, so a collection or document id containing `/`
   (or `.` / `..`) is rejected: a slash would re-aim a write, or a delete, at a path the
   plan never printed.

3. **Project guard.** An `--apply` run aborts when the snapshot's recorded project is
   not the project the SDK is pointed at. A production dump must not silently land in
   the wrong database. `--force` is the deliberate cross-project restore, and it warns
   as it proceeds.

4. **Typed project-id confirmation, for merge _and_ wipe.** Every `--apply` run asks the
   operator to type the target project id back **on the controlling terminal** — not on
   stdin. Piping the project id in therefore cannot auto-confirm it, and a
   non-interactive caller cannot answer at all: it exits non-zero. A merge is not safe
   merely because it is not a delete — it still upserts into a database that may be
   production. The plan printed above is what you are confirming against.

The escape hatch is `--dangerously-bypass-project-name-confirmation`, spelled that way on
purpose, and it is the same hatch `pnpm migrate` has. It exists for CI. If you are typing
it at a human keyboard, stop and read the plan instead.

## A restore that is safe to rehearse

Point at the emulator and try it there first — the plan output is identical in shape, and
the rails behave the same way:

```bash
pnpm emulators
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  pnpm snapshot:restore snapshots/<timestamp> --apply
```

Note that these scripts are **not** behind the emulator-only fence the seed and reset
scripts stand behind — reaching a real database is the whole point of a backup tool. The
rails above are what stand in for it.

## Data migrations

```bash
pnpm migrate            # dry run — prints the plan, writes nothing
pnpm migrate --apply    # asks you to type the project id back, then writes
```

Firestore is schemaless, so a migration here is **a script that rewrites
documents** — there is no DDL to version. Migrations live in
`scripts/migration/` as `NNNN-what-it-does.ts`; copy `_template.ts` and read its
header before writing one.

### Writing one

- **Set `id` to the filename without `.ts`.** The runner validates the two match
  before it reads the ledger, so a rename fails loudly instead of leaving a
  migration gated forever. Never rename a migration that has already been applied
  anywhere — the ledger keys on that string.
- **Honour `ctx.apply`.** When it is false, write nothing and return the count you
  _would_ have written. The runner cannot enforce this: your migration owns its
  own writes, so ignoring it silently turns the dry run into a live write.
- **Be idempotent.** Skip documents already migrated so a re-run writes zero.
- You get the raw Admin SDK `db`, not a repo. The data layer is `server-only` and
  eager-validates the whole server env, so a script cannot import it at all. The
  upside is that you are **below** the Zod converter — the only reason you can
  repair a document the app can no longer read. The cost is that nothing
  validates your writes, so read them back.
- `_`-prefixed files are skipped by the runner, which is why `_template.ts` never
  runs. It is excluded from normal typecheck too, but `pnpm templates:check`
  substitutes and compiles it as a real migration.

### The `_migrations` ledger

Every applied migration gets a `_migrations/<id>` document, so "what is pending"
is answered by **asking the database** rather than re-scanning data — which is
what makes this usable across environments you have never seen.

The ledger is written **after** the work, and that ordering is load-bearing. Die
in between and the ledger says "not applied", so the next run redoes the work —
harmless precisely because the migration is idempotent. The reverse order fails
the other way: a ledger written first that then loses its work says "done" about
data that was never migrated, and nothing will ever re-run it. **A redundant
re-run is a cost; silently skipped data is a corruption.** So the ledger does not
excuse idempotency — it is the fast path, and idempotency is the safety net
underneath it.

### The rails

Reaching production is a migration's whole purpose, so it cannot stand behind the
emulator-only fence the seed and reset scripts use. The failure mode it guards
instead is "wrote to prod thinking it was staging":

1. **Dry run by default.** Writing takes `--apply`.
2. **The resolved target is printed first** — project id, and explicitly whether
   the database is an emulator or production — and the **full dry run of every
   pending migration runs before the prompt**, so you confirm against what you
   have just read rather than a guess.
3. **Typed project-id confirmation on the controlling terminal**, the same gate
   `snapshot:restore` uses (`scripts/_safety.ts`, one implementation so neither
   CLI can drift into the weaker version). Not stdin: piping the project id in
   cannot auto-confirm, and a non-interactive run exits non-zero rather than
   reading an EOF as consent. The same
   `--dangerously-bypass-project-name-confirmation` hatch applies, for CI.

The runner refuses to run at all without a resolved `FIREBASE_PROJECT_ID` — it
never defaults, because a runner that invents a project id writes somewhere
nobody chose. It loads `.env.local` then `.env` itself (exported values win),
loading _every_ key rather than just the project id, so the banner and the Admin
SDK cannot end up describing different databases.

## What this is not

- **Not a scheduled backup service.** Nothing runs these for you and nothing retains the
  output; scheduling and retention are the deployer's job.
- **Not a point-in-time recovery.** A snapshot is the state at the moment it was taken.
- **Not sub-collection aware.** See the ceiling above.
