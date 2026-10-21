// TEMPLATE — copy-me starter for a data migration.
//
// Copy to `scripts/migration/NNNN-what-it-does.ts`. Set `id` to that exact
// filename without `.ts`: the runner validates it before reading the ledger.
// Never rename a migration that has already been applied anywhere — the ledger
// keys on this string.
//
// `_`-prefixed files are skipped by the runner, which is why this file never
// runs. It is also EXCLUDED from normal typecheck by tsconfig's `**/_template.*`,
// but `pnpm templates:check` substitutes and compiles it as a real migration.
//
// THE TWO RULES, and they are not style:
//
//   1. HONOUR `ctx.apply`. When it is false, write NOTHING and return the count
//      you WOULD have written. The runner cannot enforce this — your migration
//      owns its own writes — so a migration that ignores it silently turns
//      `pnpm migrate`'s dry run into a live write. This is the one contract you
//      must not break.
//
//   2. BE IDEMPOTENT. Skip documents that are already migrated, so a re-run
//      writes zero. The `_migrations` ledger does NOT excuse you from this: the
//      ledger is written AFTER the work, so a crash in between means your
//      migration runs again. Idempotency is what makes that harmless. A ledger
//      doc that lies costs a re-scan; a non-idempotent migration whose ledger
//      lies costs data.
//
// You get the raw Admin SDK `db`, deliberately — NOT `assetsCollection()`. The
// data layer is `server-only` and eager-validates env, so a script cannot import
// it at all (see the runner's header). The upside: you are BELOW the Zod
// converter, which is the only reason you can repair a document the app can no
// longer read. The cost: nothing validates your writes, so read them back.

import {
  forEachRawCollectionPage,
  type Migration,
  type MigrationContext,
} from './infrastructure.ts'

const PAGE_SIZE = 300

export const migration: Migration = {
  id: '__migration_id__',
  description: 'Describe what changes, in one line',

  async run(ctx: MigrationContext): Promise<number> {
    let writes = 0
    // The helper pages raw Admin reads on `__name__`, so malformed legacy documents
    // remain repairable without buffering the whole collection in memory.
    await forEachRawCollectionPage(
      ctx.db.collection('__entities__'),
      PAGE_SIZE,
      async (docs) => {
        for (const doc of docs) {
          const data = doc.data()

          // THE IDEMPOTENCY CHECK. Skip what is already done. This is the line
          // that makes a re-run safe, and the one to get right before any other.
          if (data.__field__ !== undefined) continue

          writes++
          if (!ctx.apply) continue // dry run: counted, not written

          // oxlint-disable-next-line no-await-in-loop -- one write per doc, logged as it lands, so an interrupted run's log names exactly what changed
          await doc.ref.update({ __field__: '__value__' })
          ctx.log(`migrated ${doc.id}`)
        }
      },
    )

    return writes
  },
}
