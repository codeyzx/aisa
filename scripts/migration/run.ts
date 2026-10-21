/**
 * The data-migration runner: `pnpm migrate`.
 *
 * Firestore is schemaless, so this is the ONLY kind of migration that exists
 * here — there is no DDL to version. A migration is a script that rewrites
 * documents, and the two things that make it survivable are that it is
 * IDEMPOTENT and that it is DRY-RUN by default.
 *
 * Run with `node scripts/migration/run.ts` (Node 24 strips the types natively —
 * no tsx, no build step, no dependency), the same way `scripts/seed-emulator.ts`
 * runs.
 *
 * ⚠️ IT DELIBERATELY CANNOT IMPORT THE DATA LAYER. `lib/firebase/collections.ts`
 * and every repo are `server-only` AND eager-validate the full server env, so
 * they throw outside a React Server bundle — `scripts/seed-emulator.ts`'s header
 * records the same constraint. So this talks to the Admin SDK directly and keeps
 * its ledger contract in dependency-free migration infrastructure rather than an
 * app collection registry.
 * That is a real limitation, not an oversight: a migration runs BELOW the Zod
 * converter, which is exactly why it can repair documents the app can no longer
 * read.
 *
 * THE SAFETY MODEL, and why it is not the seed's:
 * `seed-emulator.ts` refuses to run unless both emulator hosts are set — "a seed
 * script that can reach production is a loaded gun". A migration is the exact
 * INVERSE: reaching production is its entire purpose. So the guard cannot be
 * copied, and this one is different in kind:
 *
 *   1. dry-run by DEFAULT; writes only with `--apply`
 *   2. the resolved target is PRINTED, and the full dry-run runs BEFORE the
 *      prompt — so you confirm against what you have just read, not a guess
 *   3. `--apply` refuses until the operator types the project id back
 *
 * The failure mode this exists for is NOT "wrote too early". It is "wrote to
 * prod thinking it was staging", and only the project id catches that.
 *
 * THE LEDGER (`_migrations`), and the order it is written in:
 * Each applied migration gets a `_migrations/<id>` document, so `pending` is
 * answered by ASKING rather than by re-scanning data — which is what makes this
 * usable across environments (you can see what a given database has had done to
 * it) and fast to resume.
 *
 * The ledger is written AFTER the work, and that ordering is load-bearing. If
 * the process dies between the work and the ledger write, the ledger says "not
 * applied" and the next run redoes the work — which is harmless precisely
 * BECAUSE the migration is idempotent. The reverse order fails the other way: a
 * ledger written first that then loses its work says "done" about data that was
 * never migrated, and nothing will ever re-run it. A redundant re-run is a cost;
 * silently skipped data is a corruption.
 *
 * ⚠️ SO IDEMPOTENCY IS STILL LOAD-BEARING, AND THE LEDGER DOES NOT REPLACE IT.
 * The ledger is the fast path; idempotency is the safety net underneath it. A
 * ledger doc that lies costs a re-scan; a NON-idempotent migration whose ledger
 * lies costs data. Do not read the ledger as permission to write a migration
 * that cannot be re-run.
 *
 * A single project with one production database can get by with NO ledger; a
 * boilerplate whose output gets deployed across environments it has never seen
 * cannot, which is why the ledger exists here.
 */
import { readdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import { requireProjectIdConfirmation } from '../_safety.ts'
import { loadEnvFiles } from '../env-files.ts'
import {
  assertMigrationFilenameId,
  MIGRATIONS_COLLECTION,
  type Migration,
} from './infrastructure.ts'

const MIGRATION_DIR = dirname(fileURLToPath(import.meta.url))

interface DiscoveredMigration {
  id: string
  migration: Migration
}

/**
 * Discover `NNNN-*.ts` migrations, ordered by filename.
 *
 * Filenames set execution order, while each module declares the durable ledger
 * id. The two must match, or discovery aborts before reading the ledger. That
 * makes a rename fail loud instead of leaving readiness checks gated forever.
 * `_`-prefixed files are skipped, which keeps `_template.ts` from running.
 */
async function discoverMigrations(): Promise<DiscoveredMigration[]> {
  const entries = await readdir(MIGRATION_DIR)
  const files = entries
    .filter((name) => /^\d{4}-.+\.ts$/.test(name))
    .toSorted((a, b) => a.localeCompare(b))

  // Loaded concurrently; `Promise.all` keeps the result in filename order,
  // which is the execution order.
  return Promise.all(
    files.map(async (file): Promise<DiscoveredMigration> => {
      const url = pathToFileURL(join(MIGRATION_DIR, file)).href
      // NOT named `module`: next(no-assign-module-variable) rejects it, and it is
      // right to — `module` is a real binding in a CJS scope and shadowing it is
      // how a file starts behaving differently depending on how it was loaded.
      const loaded: unknown = await import(url)
      const migration = (loaded as { migration?: Migration }).migration
      if (!migration || typeof migration.run !== 'function') {
        throw new Error(
          `${file} does not export a \`migration\` with a run() — see _template.ts`,
        )
      }
      assertMigrationFilenameId(file, migration.id)
      return { id: migration.id, migration }
    }),
  )
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      // The name is ugly ON PURPOSE. It reads as a warning at every call site,
      // so a scripted bypass of the one guard that stands between a typo and
      // production cannot be mistaken for routine. The hatch has to exist (CI,
      // automation); the spelling is what stops anyone reaching for it casually.
      'dangerously-bypass-project-name-confirmation': {
        type: 'boolean',
        default: false,
      },
    },
  })

  loadEnvFiles(process.cwd())

  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    // Refuse to run blind. Never default: a runner that invents a project id is
    // a runner that writes somewhere nobody chose.
    console.error(
      'Refusing to run: no FIREBASE_PROJECT_ID resolved.\n' +
        'Checked the exported environment, then .env.local, then .env.\n' +
        'A migration that guesses its target is how staging work lands in prod.',
    )
    process.exit(1)
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  const app = initializeApp({ projectId })
  const db = getFirestore(app)

  const migrations = await discoverMigrations()
  if (migrations.length === 0) {
    console.log('No migrations found in scripts/migration/. Nothing to do.')
    return
  }

  // Ask the ledger what is pending, rather than re-scanning data to infer it.
  const applied = new Set<string>()
  const ledger = await db.collection(MIGRATIONS_COLLECTION).get()
  for (const doc of ledger.docs) applied.add(doc.id)

  const pending = migrations.filter(({ id }) => !applied.has(id))

  // THE BANNER. Printed before anything else is decided, and it names the
  // emulator explicitly — the same project id on an emulator and in production
  // are the two things this guard exists to keep apart.
  console.log('\n─────────────────────────────────────────────')
  console.log(`  TARGET PROJECT   ${projectId}`)
  console.log(
    `  TARGET DATABASE  ${emulatorHost ? `EMULATOR at ${emulatorHost}` : '⚠️  PRODUCTION (no emulator host set)'}`,
  )
  console.log(
    `  MODE             ${values.apply ? 'APPLY (writes)' : 'DRY RUN (writes nothing)'}`,
  )
  console.log('─────────────────────────────────────────────\n')

  for (const done of migrations.filter((m) => applied.has(m.id))) {
    console.log(`  ✓ ${done.id} — already applied, from the ledger`)
  }
  if (pending.length === 0) {
    console.log(
      '\nNothing pending. Every migration is recorded in _migrations.',
    )
    return
  }

  // THE FULL DRY RUN, ALWAYS, AND BEFORE THE PROMPT. You confirm against what
  // you have just read — not against a guess about what is about to happen.
  console.log(`\n  ${pending.length} pending:\n`)
  let totalWrites = 0
  for (const { id, migration } of pending) {
    // oxlint-disable-next-line no-await-in-loop -- one migration at a time, so each report reads in execution order
    const writes = await migration.run({
      db,
      apply: false,
      log: (message) => console.log(`      ${message}`),
    })
    totalWrites += writes
    console.log(`  • ${id} — ${migration.description}`)
    console.log(`      would write ${writes} document(s)`)
  }

  if (!values.apply) {
    console.log(
      `\nDRY RUN — wrote nothing. ${totalWrites} document(s) would change.\n` +
        `Re-run with --apply to write to ${projectId}.`,
    )
    return
  }

  // The gate lives in `scripts/_safety.ts` — one implementation, shared with
  // `snapshot/restore.ts`, so neither CLI can drift into the weaker version.
  requireProjectIdConfirmation({
    projectId,
    action: 'write to it',
    bypassed: values['dangerously-bypass-project-name-confirmation'],
  })

  console.log('')
  for (const { id, migration } of pending) {
    // oxlint-disable-next-line no-await-in-loop -- migrations apply in filename order; a later one may depend on an earlier one's writes
    const writes = await migration.run({
      db,
      apply: true,
      log: (message) => console.log(`      ${message}`),
    })

    // Ledger AFTER the work — see the header. Dying between the two costs a
    // redundant (idempotent) re-run; the reverse order would cost skipped data.
    // oxlint-disable-next-line no-await-in-loop -- recorded before the next migration starts, so a crash never leaves a finished one unrecorded
    await db.collection(MIGRATIONS_COLLECTION).doc(id).set({
      id,
      description: migration.description,
      appliedAt: new Date(),
      writes,
    })
    console.log(
      `  ✓ ${id} — wrote ${writes} document(s), recorded in _migrations`,
    )
  }

  console.log(`\nApplied ${pending.length} migration(s) to ${projectId}.`)
}

await main()
