/**
 * snapshot export — dump every top-level Firestore collection to diffable JSON.
 *
 *   node scripts/snapshot/export.ts [--out <dir>]
 *
 * Runs as plain `node` (Node 24 strips the types); see `_admin.ts` for the SDK
 * bootstrap and which env it honours (emulator via `FIRESTORE_EMULATOR_HOST`,
 * else real credentials).
 *
 * ⚠️ CEILING — TOP-LEVEL COLLECTIONS ONLY. Enumeration is `db.listCollections()`,
 * which returns ROOT collections; sub-collections nested under a document are OUT
 * OF SCOPE and are not walked. The boilerplate's data model is flat (`assets`,
 * `counters`, `_migrations`, …), so this matches the data it ships with. A nested
 * model would need a recursive walk this deliberately does not do.
 *
 * READ-ONLY: this never writes to Firestore. Its only writes are the JSON files.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { getDb, projectId, emulatorHost } from './_admin.ts'
import { encode } from './codec.ts'

interface ExportedDoc {
  id: string
  data: unknown
}

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
  },
})

const generatedAt = new Date().toISOString()
// A filesystem-safe, sortable stamp: 2026-07-18T09-30-00-000Z.
const stamp = generatedAt.replace(/[:.]/g, '-')
const outDir = values.out ?? join('snapshots', stamp)

const db = getDb()

console.log(
  `Exporting project "${projectId}" ` +
    `(${emulatorHost ? `emulator at ${emulatorHost}` : 'PRODUCTION — no emulator host'})`,
)

await mkdir(outDir, { recursive: true })

const collections = await db.listCollections()

// Parallel: each collection is an independent read + file write.
const summary = await Promise.all(
  collections.map(async (collection) => {
    const snapshot = await collection.get()
    const docs: ExportedDoc[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: encode(doc.data()),
    }))

    const payload = {
      format: 1,
      generatedAt,
      project: projectId,
      collection: collection.id,
      count: docs.length,
      docs,
    }
    await writeFile(
      join(outDir, `${collection.id}.json`),
      JSON.stringify(payload, null, 2),
    )
    return { id: collection.id, count: docs.length }
  }),
)

const manifest = {
  format: 1,
  generatedAt,
  project: projectId,
  collections: summary,
}
await writeFile(
  join(outDir, '_manifest.json'),
  JSON.stringify(manifest, null, 2),
)

const totalDocs = summary.reduce((sum, entry) => sum + entry.count, 0)
console.log(
  `Exported ${summary.length} collection(s), ${totalDocs} document(s) → ${outDir}`,
)
