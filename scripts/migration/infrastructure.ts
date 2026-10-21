import type {
  CollectionReference,
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

/** The private ledger recording migrations after their work completes. */
export const MIGRATIONS_COLLECTION = '_migrations'

/** What a migration is handed by the executable runner. */
export interface MigrationContext {
  db: Firestore
  /** FALSE on a dry run. Migrations must not write when it is false. */
  apply: boolean
  log: (message: string) => void
}

/** What a migration module must export as `migration`. */
export interface Migration {
  /** Immutable ledger key, validated against this module's filename by the runner. */
  id: string
  /** One line, shown in the dry-run summary. Say what changes, not how. */
  description: string
  /** Idempotent work that honours `ctx.apply`, returning documents written. */
  run(ctx: MigrationContext): Promise<number>
}

/** A migration filename and its immutable ledger id use the same strict shape. */
const MIGRATION_ID = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Return the expected id for a discoverable migration filename, or throw. */
export function migrationIdFromFilename(filename: string): string {
  if (!filename.endsWith('.ts')) {
    throw new Error(`Migration filename must end in .ts, got ${filename}`)
  }
  const id = filename.slice(0, -'.ts'.length)
  if (!MIGRATION_ID.test(id)) {
    throw new Error(
      `Migration filename must be NNNN-kebab-case.ts, got ${filename}`,
    )
  }
  return id
}

/** Fail before work if a module's durable id no longer matches its filename. */
export function assertMigrationFilenameId(
  filename: string,
  id: unknown,
): asserts id is string {
  const expectedId = migrationIdFromFilename(filename)
  if (typeof id !== 'string' || !MIGRATION_ID.test(id)) {
    throw new Error(
      `Migration ${filename} must export a kebab-case numeric id, got ${String(id)}`,
    )
  }
  if (id !== expectedId) {
    throw new Error(
      `Migration id mismatch: ${filename} declares ${id}, expected ${expectedId}. ` +
        'Rename neither after applying it; add a new migration instead.',
    )
  }
}

/**
 * Read a raw Admin collection in bounded, stable `__name__` pages.
 *
 * Migrations intentionally use this below converters: malformed legacy documents
 * must remain readable so a migration can repair them.
 */
export async function forEachRawCollectionPage(
  collection: CollectionReference<DocumentData>,
  pageSize: number,
  visit: (docs: QueryDocumentSnapshot<DocumentData>[]) => Promise<void> | void,
): Promise<void> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError(
      `pageSize must be a positive safe integer, got ${pageSize}`,
    )
  }

  let last: QueryDocumentSnapshot<DocumentData> | undefined
  for (;;) {
    let query = collection.orderBy('__name__').limit(pageSize)
    if (last) query = query.startAfter(last)
    const page = await query.get()
    if (page.empty) return

    await visit(page.docs)
    last = page.docs[page.docs.length - 1]
    if (page.size < pageSize) return
  }
}
