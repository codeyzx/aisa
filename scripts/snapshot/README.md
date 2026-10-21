# Firestore snapshot CLI

Export every top-level Firestore collection to diffable JSON, and restore it back
— with a lossless type codec so a `Timestamp` comes back a `Timestamp`, not a
plain `{_seconds, _nanoseconds}` object (see `codec.ts`).

These run as plain `node` (Node 24 strips the types — no build step), the same way
`scripts/seed-emulator.ts` does. They talk to the Admin SDK directly rather than
importing the app's `server-only` data layer.

## Commands

- `pnpm snapshot:export [--out <dir>]` — dump all top-level collections.
  Defaults `--out` to `snapshots/<timestamp>`.
- `pnpm snapshot:restore <dir> [--apply] [--wipe] [--force] [--dangerously-bypass-project-name-confirmation]`
  — plan a restore; write it with `--apply`. Default write mode is a
  non-destructive merge; `--wipe` makes it an exact mirror.

(Or invoke the files directly: `node scripts/snapshot/export.ts …`.)

## What it targets

Whatever database the environment points at:

- `FIRESTORE_EMULATOR_HOST` set → the local emulator (the Admin SDK auto-routes).
- Not set → real credentials and the real project.
- `FIREBASE_PROJECT_ID` selects the project, resolved the way the migration runner
  resolves it — exported environment, then `.env.local`, then `.env`. With none of
  those it defaults to `demo-aisa` (the id the emulator runs under), mirroring
  `seed-emulator.ts`.

The restore **project guard** below is what keeps "whatever the env points at" safe.

## Safety rails (restore)

These are the same rails `pnpm migrate` uses — the confirmation prompt is one
shared implementation (`scripts/_safety.ts`), not a copy per CLI.

1. **Plan by default** — a bare `pnpm snapshot:restore <dir>` prints the exact
   plan (collections, counts, mode) and writes nothing; it never even opens an SDK
   connection. Writing takes `--apply`. There is no preview flag, because the
   default _is_ the preview. The plan runs ahead of the write-gates, so a project
   mismatch is shown loudly instead of aborting.
2. **Schema validation at the boundary** — `_manifest.json` and every collection
   file are parsed with `snapshot.schema.ts` **before** a Firestore client exists.
   A snapshot is hand-editable JSON that names the collections to write and to
   delete, so a collection or document id containing `/` (or `.` / `..`) is
   rejected: a slash re-targets `db.collection(...)` at a sub-collection path the
   plan never printed, which is what `--wipe` would then delete. A corrupt or
   truncated file aborts naming the file and the failing field.
3. **Project guard** — an `--apply` restore aborts if the snapshot's recorded
   `project` is not the project the SDK is pointed at, unless you pass `--force`
   for a deliberate cross-project restore. A prod dump must not silently land in
   the wrong database.
4. **Project-id confirmation on the terminal** — every `--apply` run, wipe _and_
   merge, asks the operator to type the target project id back on the controlling
   terminal (`/dev/tty`), not stdin — so piping the project id in cannot
   auto-confirm it, and a non-interactive caller cannot answer at all (it exits
   1). A merge is not safe merely because it is not a delete: it still upserts
   into a possibly-production database. CI passes
   `--dangerously-bypass-project-name-confirmation`, which is spelled that way on
   purpose.

`--wipe` is an exact mirror: it deletes every document in each target collection
first, then rewrites. Without it, restore only upserts (`{ merge: true }`) and
never deletes.

## JSON format

Each collection is one file, `<dir>/<collectionId>.json`:

```json
{
  "format": 1,
  "generatedAt": "2026-07-18T09:30:00.000Z",
  "project": "demo-aisa",
  "collection": "assets",
  "count": 25,
  "docs": [{ "id": "<docId>", "data": { "…encoded fields…" } }]
}
```

`data` is the codec's output: SDK types are tagged with a `__t` key (`timestamp`,
`geopoint`, `ref`, `bytes`) so JSON cannot silently degrade them. Restore feeds
`data` back through `decode` to rebuild the real instances, preserving the original
document id.

`<dir>/_manifest.json` lists the collections and counts and records the source
`project`:

```json
{
  "format": 1,
  "generatedAt": "2026-07-18T09:30:00.000Z",
  "project": "demo-aisa",
  "collections": [{ "id": "assets", "count": 25 }]
}
```

## Ceiling: top-level collections only

Export enumerates via `db.listCollections()`, which returns **root** collections.
Sub-collections nested under a document are **out of scope** — not walked on export,
not restored. The boilerplate's data model is flat (`assets`, `counters`,
`_migrations`, …), so this matches the data it ships with; a nested model would need
a recursive walk this deliberately does not do.
