import 'server-only'

import { cache } from 'react'
import type { Query } from 'firebase-admin/firestore'

import { FIRESTORE_BATCH_LIMIT } from '@/lib/data/batch'
import { withDeadline } from '@/lib/data/deadline'
import { ConflictError, requireFound } from '@/lib/data/domain-error'
import { stampCreated, stampUpdated } from '@/lib/data/stamps'
import { type Page } from '@/lib/data/pagination.contract'
import { paginate } from '@/lib/data/pagination.firestore'
import { toSearchPrefixes } from '@/lib/data/search-prefix'
import { adminDb } from '@/lib/firebase/admin-db'
import { rawCollection } from '@/lib/firebase/collections'
import { nextCode } from '@/lib/repos/counter.repo'
import { assetsCollection } from './asset.collection'
import { ASSETS_COLLECTION } from './asset.path'
import {
  DEFAULT_ASSET_SORT,
  type Asset,
  type AssetCreate,
  type AssetSort,
  type AssetUpdate,
} from './asset.schema'

/**
 * Asset repository — THIN by design (a typed-accessor, not a CRUD facade). Only
 * functions that genuinely need React `cache()` dedupe, cursor pagination, or a
 * transaction live here. One-off reads/queries belong at the call site, built
 * straight off `assetsCollection()` — do not add pass-through wrappers.
 *
 * Repo functions trust their input (server actions validate before calling) but
 * every read is hydrated through the schema by the collection's converter.
 */

/** Fetch one asset by id, or `null`. Deduped per render pass via React `cache()`. */
export const getAsset = cache(async (id: string): Promise<Asset | null> => {
  const snap = await assetsCollection().doc(id).get()
  return snap.data() ?? null
})

export interface ListAssetsArgs {
  limit: number
  cursor?: string | null
  status?: Asset['status']
  /**
   * A normalised search prefix token (`toSearchTerm`, lib/data/search-prefix.ts),
   * or null/absent for no search. When present the list is narrowed to documents
   * whose `code`/`name` has a word starting with this prefix (`array-contains`).
   * Already normalised + length-checked by the caller — the repo trusts it.
   */
  search?: string | null
  /**
   * Which order to list in. Omit for `DEFAULT_ASSET_SORT` (newest first).
   *
   * Typed to `AssetSort`, never a bare `field: string`: the sortable set is
   * capped by the composite indexes that are actually declared, so a
   * caller that could name any field could name one whose index does not exist —
   * which the emulator serves happily and production answers with
   * FAILED_PRECONDITION at RSC render.
   */
  sort?: AssetSort
}

/**
 * The ONE place the asset list's filter is spelled — `listAssets`, `countAssets`,
 * and the export routes all share it. Exported so the export routes reuse it
 * rather than rebuild `where('status','==')`: a copied filter is a second source
 * of truth that drifts the day someone adds a filter to one of them.
 *
 * `search` adds the `array-contains` narrowing on the derived `searchPrefixes`
 * field. Combining it with the `status` equality and the `orderBy` that
 * `paginate` applies needs a COMPOSITE INDEX per shape — declared in
 * `firestore.indexes.json`, verified with `pnpm indexes:check`. The export routes
 * pass no `search`, so their index bill is unchanged.
 */
export function assetsQuery(
  status?: Asset['status'],
  search?: string | null,
): Query<Asset> {
  let query: Query<Asset> = assetsCollection()
  if (search) query = query.where('searchPrefixes', 'array-contains', search)
  if (status) query = query.where('status', '==', status)
  return query
}

/**
 * The opaque identity of an asset RESULT SET — status filter AND search term,
 * spelled as ONE string. TWO callers stamp ephemeral state with it and MUST agree
 * on it by value, which is why it is one exported definition and not two
 * `status=…&q=…` templates:
 *
 *   - `paginate` (via `listAssets`) stamps it into every cursor token, so a
 *     `?cursor` cannot resume one filtered/searched set from another's token;
 *   - the /assets page stamps it onto the bulk SELECTION (page.tsx →
 *     assets-selection.tsx), so a filter OR search change MASKS a stale selection
 *     exactly as it invalidates a cursor — a row selected under a search for
 *     "chair" cannot be bulk-deleted after the reader searches "desk" and it
 *     leaves the screen.
 *
 * `paginate` only ever compares this name to itself, so it stays opaque (it never
 * learns what a filter IS). `'all'`/`''` are real values (unfiltered / unsearched),
 * not absence. The sort and page size are DELIBERATELY absent: re-ordering or
 * re-windowing the same set changes which rows are on screen, not which are in it,
 * so both a cursor and a selection survive them.
 */
export function assetScope(
  status?: Asset['status'],
  search?: string | null,
): string {
  return `status=${status ?? 'all'}&q=${search ?? ''}`
}

/**
 * Paginated asset list, optionally filtered by status and search, ordered by
 * `args.sort` (newest first by default).
 *
 * The cursor is safe across a sort, filter, OR search change without this
 * function doing anything about it: `paginate` stamps the sort AND the `scope`
 * (which includes the search term) into every token it mints and refuses a token
 * minted under any other, so a `?cursor` left over from a different order/filter/
 * search is dropped and the reader gets page one. See lib/data/pagination.firestore.ts.
 */
export function listAssets(args: ListAssetsArgs): Promise<Page<Asset>> {
  const sort = args.sort ?? DEFAULT_ASSET_SORT
  return paginate<Asset>(assetsQuery(args.status, args.search), {
    limit: args.limit,
    cursor: args.cursor,
    orderByField: sort.field,
    direction: sort.direction,
    scope: assetScope(args.status, args.search),
  })
}

/**
 * How many assets match `status` — all of them when it is omitted. Server-side
 * `count()` aggregation: only the number crosses the wire, never the documents.
 *
 * NOTE THE ABSENT `orderBy`, it is the whole point. A count has no order to
 * speak of, and asking for one is not free: `.where(status).orderBy(createdAt)`
 * needs a COMPOSITE index — a deploy artifact — while this shape rides
 * Firestore's automatic single-field index. Verified against the emulator's
 * indexUsage report rather than assumed: WITH the orderBy it demands
 * `(status ASC, createdAt DESC, __name__ DESC)`; WITHOUT it, the report is
 * empty. So do not "tidy" an ordering onto this query.
 *
 * It earns a repo slot instead of running at the call site (the anti-sprawl rule
 * in docs/reference/contracts/data.md) because it is not hiding a `.where()` — it
 * shares `assetsQuery` with `listAssets`. The shared filter is an invariant; that,
 * not convenience, is what buys the function.
 *
 * `count()` is BILLED (one read per 1000 documents counted). Call it when a
 * reader will see the number, not reflexively — and never call it twice to learn
 * the same fact: with no filter active, `total` IS `filtered`.
 */
export async function countAssets(
  status?: Asset['status'],
  search?: string | null,
): Promise<number> {
  const snap = await assetsQuery(status, search).count().get()
  return snap.data().count
}

/**
 * Create an asset in a transaction; the server owns id, code, and timestamps.
 *
 * `withDeadline` bounds the WALL CLOCK, which the SDK's own transaction retry
 * does not: it retries attempts (default 5, unconfigured), and five slow
 * attempts take unboundedly long while a user watches a spinner. The two are not
 * the same guard, which is why this is NOT wrapped in a second retry: the Admin
 * SDK already retries transactions and a second one would compound to 5xN. See
 * lib/data/deadline.ts.
 */
export function createAsset(input: AssetCreate): Promise<Asset> {
  const ref = assetsCollection().doc()
  const write = adminDb().runTransaction(async (tx) => {
    // Mint the human code FIRST: `nextCode` READS the counter, and Firestore
    // requires every read before any write in a transaction. It shares this
    // transaction, so the code and the asset commit — or roll back — together.
    const code = await nextCode(tx, { id: 'asset', prefix: 'AST-', width: 4 })
    const asset: Asset = {
      ...stampCreated(ref.id, input),
      code,
      status: input.status ?? 'active',
      // Derived from the trusted server-side values, never from client input.
      searchPrefixes: toSearchPrefixes([code, input.name]),
    }
    tx.set(ref, asset)
    return asset
  })
  return withDeadline(write, 'createAsset')
}

/**
 * Read-modify-write an asset in a transaction; throws if it does not exist.
 *
 * Returns `previousAttachmentKey` — the attachment key as it stood INSIDE this
 * transaction — so the caller reaps the object THIS write replaced, not one read
 * separately before the transaction that a concurrent edit could already have
 * changed. This does not by itself serialize two racing updates (that needs an
 * optimistic version check); it makes each update's own cleanup target the
 * right key.
 */
export function updateAsset(
  id: string,
  patch: AssetUpdate,
  expectedAttachmentKey: string | undefined,
): Promise<{ asset: Asset; previousAttachmentKey: string | undefined }> {
  const ref = assetsCollection().doc(id)
  const write = adminDb().runTransaction(async (tx) => {
    const current = requireFound((await tx.get(ref)).data(), 'asset not found')
    if (current.attachmentKey !== expectedAttachmentKey) {
      throw new ConflictError('asset attachment changed since it was read')
    }
    const merged: Asset = stampUpdated(current, patch)
    // Re-derive from the merged (post-patch) searchable fields so an edited name
    // updates the search index in the SAME write — `code` is immutable, `name`
    // may be in `patch`. A dual-write: every update keeps `searchPrefixes` current.
    const item: Asset = {
      ...merged,
      searchPrefixes: toSearchPrefixes([merged.code, merged.name]),
    }
    tx.set(ref, item)
    return { asset: item, previousAttachmentKey: current.attachmentKey }
  })
  return withDeadline(write, 'updateAsset')
}

/** Delete an asset and return the attachment key read in the deleting transaction. */
export function deleteAsset(id: string): Promise<string | undefined> {
  // RAW on purpose: a document that has drifted from the schema is exactly the
  // one that most needs deleting, and a converted read would throw on it — which
  // would make a corrupt row undeletable. See rawCollection's contract.
  const ref = rawCollection(ASSETS_COLLECTION).doc(id)
  return withDeadline(
    adminDb().runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data()
      if (!current) return undefined
      tx.delete(ref)
      return current.attachmentKey as string | undefined
    }),
    'deleteAsset',
  )
}

/**
 * Delete many assets by id, as ONE atomic batch — every id or none.
 *
 * ≤500 is GUARANTEED because the action schema and the UI both hold to the
 * product cap (`ASSET_BULK_DELETE_MAX`), which stays `<=` this batch ceiling. This
 * guard enforces Firestore's 500-writes-per-batch limit INDEPENDENTLY — the
 * infrastructure floor that survives even if the product cap changes — so the
 * batch commits ONCE. Over-cap is a LOUD throw before a single `delete()` is
 * staged, so no `commit()` runs and there is no partial state to reach.
 */
export function deleteAssets(
  ids: readonly string[],
): Promise<{ id: string; attachmentKey: string | undefined }[]> {
  // Loud reject at the write boundary. The two callers above (schema + UI) keep
  // this from ever firing, but the guard is not defence-in-depth theatre: the
  // cap and its arithmetic live in lib/data/batch.ts precisely because a test
  // can reach them unconditionally, while this repo sits behind `server-only`
  // and the credential boundary. So the invariant is asserted here, at the one
  // place holding a `batch`.
  if (ids.length > FIRESTORE_BATCH_LIMIT) {
    throw new Error(`deleteAssets accepts at most ${FIRESTORE_BATCH_LIMIT} ids`)
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('deleteAssets does not accept duplicate ids')
  }
  // RAW on purpose — same reason as deleteAsset: a drifted row must stay deletable.
  const items = rawCollection(ASSETS_COLLECTION)
  return withDeadline(
    adminDb().runTransaction(async (tx) => {
      const refs = ids.map((id) => items.doc(id))
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)))
      const deleted: { id: string; attachmentKey: string | undefined }[] = []
      for (const [index, current] of snapshots.entries()) {
        if (!current.exists) continue
        tx.delete(refs[index])
        deleted.push({
          id: refs[index].id,
          attachmentKey: current.data()?.attachmentKey,
        })
      }
      return deleted
    }),
    'deleteAssets',
  )
}
