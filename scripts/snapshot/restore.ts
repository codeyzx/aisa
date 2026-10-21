/**
 * snapshot restore — write a snapshot directory back into Firestore.
 *
 *   node scripts/snapshot/restore.ts <dir> [--apply] [--wipe] [--force]
 *                                          [--dangerously-bypass-project-name-confirmation]
 *
 * Runs as plain `node` (Node 24 strips the types); see `_admin.ts` for the SDK
 * bootstrap and which env it targets (emulator via `FIRESTORE_EMULATOR_HOST`,
 * else real credentials).
 *
 * ⚠️ WITH `--apply` THIS WRITES TO — AND WITH `--wipe`, DELETES FROM — WHATEVER
 * DATABASE THE ENV POINTS AT. Four rails stand between a snapshot and the wrong
 * database, and they are the same rails `migration/run.ts` uses, deliberately:
 *
 *   1. SCHEMA VALIDATION AT THE BOUNDARY. `_manifest.json` and every collection
 *      file are parsed with `snapshot.schema.ts` BEFORE a client exists. A
 *      snapshot is hand-editable JSON that names the collections to write and
 *      delete; unvalidated, a slash in a collection id re-aims `recursiveDelete`
 *      at something the plan never printed.
 *   2. PLAN BY DEFAULT. A bare run prints the exact plan (collections, counts,
 *      mode) and writes NOTHING — it never even opens an SDK connection. Writing
 *      takes `--apply`. There is no separate preview flag: the DEFAULT is the
 *      preview, so nobody can forget to ask for one. The plan runs free of the
 *      write-gates — a project mismatch is shown loudly rather than aborted.
 *   3. PROJECT GUARD. An `--apply` run aborts when the snapshot's recorded
 *      project is not the project the SDK is pointed at, unless `--force` is
 *      passed for a deliberate cross-project restore. A prod dump must not
 *      silently land in the wrong DB.
 *   4. PROJECT-ID CONFIRMATION. Every `--apply` run — wipe OR merge — makes the
 *      operator type the project id back on the CONTROLLING TERMINAL
 *      (`scripts/_safety.ts`), so a piped or CI caller cannot answer at all. A
 *      merge is not safe merely because it is not a delete: it is still an upsert
 *      into a database that may be production. The escape hatch is the same ugly
 *      `--dangerously-bypass-project-name-confirmation` the migration runner has.
 *
 * Default mode is MERGE (`{ merge: true }`): a non-destructive upsert that
 * preserves original document ids. `--wipe` switches to delete-then-replace.
 *
 * Sub-collection ceiling: this restores only the top-level collections that
 * `export.ts` captured — see that file's header.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import type { DocumentData } from 'firebase-admin/firestore'

import { requireProjectIdConfirmation } from '../_safety.ts'
import { emulatorHost, getDb, projectId } from './_admin.ts'
import { decode } from './codec.ts'
import {
  CollectionFileSchema,
  ManifestSchema,
  parseSnapshotFile,
} from './snapshot.schema.ts'

const USAGE =
  'Usage: node scripts/snapshot/restore.ts <dir> [--apply] [--wipe] [--force] ' +
  '[--dangerously-bypass-project-name-confirmation]'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: 'boolean', default: false },
    wipe: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    // Ugly ON PURPOSE, and spelled exactly as `migration/run.ts` spells it — one
    // name for one hatch, so a reader of either CLI recognises it as a warning.
    'dangerously-bypass-project-name-confirmation': {
      type: 'boolean',
      default: false,
    },
  },
})

const dir = positionals[0]
if (!dir) {
  console.error(USAGE)
  process.exit(1)
}

const apply = values.apply
const wipe = values.wipe

// RAIL 1 — PARSE BEFORE ANY CLIENT EXISTS. `getDb()` is not called until every
// file below has been validated, and that ORDER is the property: a corrupt or
// hand-edited snapshot must fail with nothing connected, nothing written and —
// under `--wipe` — nothing deleted.
const manifest = parseSnapshotFile(
  ManifestSchema,
  await readFile(join(dir, '_manifest.json'), 'utf8'),
  join(dir, '_manifest.json'),
)

// Load every collection file the manifest names — pure file reads, no SDK yet.
const loaded = await Promise.all(
  manifest.collections.map(async ({ id }) => {
    const path = join(dir, `${id}.json`)
    const file = parseSnapshotFile(
      CollectionFileSchema,
      await readFile(path, 'utf8'),
      path,
    )
    return { id, docs: file.docs }
  }),
)

const totalDocs = loaded.reduce((sum, entry) => sum + entry.docs.length, 0)
const mismatch = manifest.project !== projectId

console.log('\n─────────────────────────────────────────────')
console.log(`  SOURCE           ${dir}`)
console.log(`  SNAPSHOT PROJECT ${manifest.project}`)
console.log(`  TARGET PROJECT   ${projectId}`)
console.log(
  `  TARGET DATABASE  ${emulatorHost ? `EMULATOR at ${emulatorHost}` : '⚠️  PRODUCTION (no emulator host set)'}`,
)
console.log(`  MODE             ${wipe ? 'WIPE + REPLACE' : 'MERGE (upsert)'}`)
console.log('─────────────────────────────────────────────\n')

for (const { id, docs } of loaded) {
  console.log(
    `  ${wipe ? 'wipe+write' : 'merge'} ${id} — ${docs.length} doc(s)`,
  )
}

// RAIL 2 — PLAN BY DEFAULT: report the plan and write nothing. Runs before the
// write-gates, so the plan is always printable.
if (!apply) {
  console.log(
    `\nPLAN — nothing written. ${totalDocs} doc(s) across ${loaded.length} ` +
      `collection(s) would be ${wipe ? 'wiped and rewritten' : 'merged'} into "${projectId}".\n` +
      `Re-run with --apply to write to "${projectId}".`,
  )
  if (mismatch) {
    console.log(
      `Note: snapshot project "${manifest.project}" ≠ target "${projectId}" — a real run needs --force.`,
    )
  }
  process.exit(0)
}

// RAIL 3 — PROJECT GUARD: refuse to write a snapshot into a different project.
if (mismatch && !values.force) {
  console.error(
    `\nRefusing to restore: snapshot project "${manifest.project}" ≠ target project "${projectId}".\n` +
      'A prod dump must not silently land in the wrong database. If this cross-project\n' +
      'restore is deliberate, re-run with --force.',
  )
  process.exit(1)
}
if (mismatch) {
  console.warn(
    `⚠️  --force: writing snapshot from "${manifest.project}" into "${projectId}".`,
  )
}

// RAIL 4 — PROJECT-ID CONFIRMATION, on the controlling terminal, for BOTH modes.
// A wipe deletes every target document first; a merge upserts into a database
// that may be production. Neither is something a piped caller should be able to
// authorise, so both ask — and the plan above is what you confirm against.
requireProjectIdConfirmation({
  projectId,
  action: wipe ? 'WIPE and restore into it' : 'merge into it',
  bypassed: values['dangerously-bypass-project-name-confirmation'],
})

const db = getDb()
const merge = !wipe

// bulkWriter auto-chunks past the 500-write batch limit; never hand-roll a batch.
// Individual set() promises are fire-and-forget — close() flushes them; the first
// permanent failure is recorded and rethrown after the flush.
let firstError: unknown
const record = (error: unknown): void => {
  firstError ??= error
}
const writer = db.bulkWriter()

// Wipe first (in parallel — collections are independent), THEN write. For a wipe
// the { merge: false } below is belt-and-suspenders; recursiveDelete already
// cleared the target, which is what makes the result an exact mirror.
if (wipe) {
  await Promise.all(
    loaded.map(({ id }) => db.recursiveDelete(db.collection(id))),
  )
}

for (const { id, docs } of loaded) {
  const collection = db.collection(id)
  for (const { id: docId, data } of docs) {
    // Preserve the original document id.
    void writer
      .set(collection.doc(docId), decode(data, db) as DocumentData, { merge })
      .catch(record)
  }
}

await writer.close()
if (firstError) throw firstError

console.log(
  `\nRestored ${totalDocs} doc(s) across ${loaded.length} collection(s) into "${projectId}" ` +
    `(${wipe ? 'wipe + replace' : 'merge'}).`,
)
