/**
 * Index drift guard — catches composite indexes a query needs but
 * `firestore.indexes.json` does not declare.
 *
 * WHY THIS EXISTS: the Firestore emulator does not enforce composite indexes; it
 * runs any valid query (Google's docs say so, by design — firebase-tools#2027 has
 * been open since 2020). So a filtered query passes every local check and then
 * throws FAILED_PRECONDITION in production. Nothing else in the toolchain catches
 * it: not typecheck, not lint, not build, not the emulator.
 *
 * But the emulator DOES compute the index each query would need — it just does
 * not require it. This reads that back and diffs it against what we declare.
 *
 * HOW TO RUN: start `pnpm emulators`, exercise the queries (`pnpm seed`, drive
 * the app, or run integration tests), then `pnpm indexes:check`.
 *
 * COVERAGE IS NOT STATIC ANALYSIS. It only knows about queries that ACTUALLY RAN
 * against this emulator instance. A query shape no test exercises is invisible
 * here. Widen the driving, not this script.
 *
 * The endpoint is UNDOCUMENTED (discovered via ericvera/firestore-index-gen) and
 * may change without notice — hence the loud failure below rather than a silent
 * pass, which would be worse than having no guard at all.
 */
import { readFile } from 'node:fs/promises'

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'

/** A field in an index spec — `order` for scalars, `arrayConfig` for arrays. */
interface IndexField {
  fieldPath: string
  order?: 'ASCENDING' | 'DESCENDING'
  arrayConfig?: 'CONTAINS'
}

interface IndexSpec {
  collectionGroup: string
  queryScope: string
  fields: IndexField[]
}

interface UsageReport {
  index: { name: string; queryScope: string; fields: IndexField[] }
  numQueries: string
}

/**
 * Firestore appends `__name__` implicitly, in the direction of the last explicit
 * field — so a trailing `__name__` that MATCHES that direction must not appear in
 * the config file. One that DIFFERS is a real, declarable field: keep it.
 */
function stripImplicitName(fields: IndexField[]): IndexField[] {
  const last = fields.at(-1)
  if (!last || last.fieldPath !== '__name__') return fields
  const previous = fields.at(-2)
  if (!previous) return fields
  return last.order === previous.order ? fields.slice(0, -1) : fields
}

/** Stable identity for set comparison: scope + ordered field list. */
function keyOf(index: IndexSpec): string {
  const fields = index.fields
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? '?'}`)
    .join(',')
  return `${index.collectionGroup}|${index.queryScope}|${fields}`
}

function parseCollectionGroup(name: string): string {
  // projects/<p>/databases/(default)/collectionGroups/<group>/indexes/_
  return name.split('/collectionGroups/')[1]?.split('/')[0] ?? '(unknown)'
}

const url =
  `http://${host}/emulator/v1/projects/${projectId}:indexUsage` +
  `?database=projects/${projectId}/databases/(default)`

const response = await fetch(url).catch((error: unknown) => {
  throw new Error(
    `Cannot reach the Firestore emulator at ${host}. Start it with ` +
      `\`pnpm emulators\` first.\n  ${String(error)}`,
  )
})

if (!response.ok) {
  // Fail loud. A silent pass here would report "no drift" for every query
  // forever, which is strictly worse than not having this guard.
  throw new Error(
    `indexUsage returned HTTP ${response.status}. This endpoint is undocumented ` +
      `and may have changed shape.\nRe-check against ` +
      `https://github.com/ericvera/firestore-index-gen before trusting this guard again.`,
  )
}

const { reports = [] } = (await response.json()) as { reports?: UsageReport[] }

const required = reports
  .map((report) => ({
    collectionGroup: parseCollectionGroup(report.index.name),
    queryScope: report.index.queryScope,
    fields: stripImplicitName(report.index.fields),
  }))
  // Single-field COLLECTION-scope indexes are created automatically by Firestore,
  // so they are never declared. Collection-group scope is NOT automatic — keep it.
  .filter((i) => !(i.queryScope === 'COLLECTION' && i.fields.length <= 1))

const declared = JSON.parse(
  await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
) as { indexes: IndexSpec[] }

const declaredKeys = new Set(declared.indexes.map(keyOf))
const missing = required.filter((i) => !declaredKeys.has(keyOf(i)))

if (reports.length === 0) {
  // The endpoint only reports queries that WOULD need a composite index, so an
  // empty report has two causes this script cannot tell apart: nothing needing
  // one ran, or nothing ran at all. Exiting 1 is the safe read — a CI job that
  // forgot to drive the app must not report a green tick — but do not let the
  // message pretend to know which it was.
  console.error(
    'No query requiring a composite index ran against this emulator instance.\n' +
      'Either the app was never driven (start `pnpm emulators`, `pnpm seed`, ' +
      '`pnpm dev`, then exercise the filtered queries), or nothing in this run ' +
      'needs one — an unfiltered list is served by the automatic single-field ' +
      'index and reports nothing.\n' +
      'Exiting non-zero because those two are indistinguishable from here, and ' +
      'silently passing the first case would defeat the guard.',
  )
  process.exit(1)
}

if (missing.length > 0) {
  console.error(
    `Missing ${missing.length} composite index(es). These queries ran fine here ` +
      `and WILL fail in production with FAILED_PRECONDITION.\n\n` +
      `Add to firestore.indexes.json, then deploy ` +
      `(\`firebase deploy --only firestore:indexes\`):\n`,
  )
  console.error(JSON.stringify(missing, null, 2))
  process.exit(1)
}

console.log(
  `OK — all ${required.length} composite index(es) required by the ` +
    `${reports.length} observed query shape(s) are declared.`,
)
