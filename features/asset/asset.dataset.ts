import 'server-only'

import type { Query } from 'firebase-admin/firestore'

import { assetsQuery } from './asset.repo'
import {
  DEFAULT_ASSET_SORT,
  type Asset,
  AssetStatusSchema,
} from './asset.schema'

/**
 * The ONE place a dataset export's row set is spelled — which rows, in which
 * order, and what `?status=` may say. Shared by the CSV and the XLSX routes.
 *
 * It exists for the same reason `asset.columns.ts` does, one layer down: the two
 * routes export the SAME set, and the moment they spell it separately they
 * drift. A CSV and an XLSX that claim to be the same export, describing
 * different sets, is a bug no gate can see — both files open fine.
 *
 * Note what this deliberately does NOT do: it does not rebuild the filter.
 * `assetsQuery` is the ONE place the asset list's filter is spelled (its own
 * comment: "they must agree on what matching means"), and this is its third
 * consumer after `listAssets` and `countAssets`. Hand-writing
 * `.where('status', '==', status)` here would be a second source of truth for
 * "which assets", and the file a reader downloads would describe a different set
 * than the screen they clicked from — silently, on the day someone adds a
 * filter to one of them.
 */

/**
 * The rows a dataset export contains: the list's own filter, in the list's own
 * default order.
 *
 * `DEFAULT_ASSET_SORT` rather than a hand-written `.orderBy('createdAt', 'desc')`
 * — the export's order is then the SAME FACT as the list's default order, not a
 * copy of it that agrees today. It also keeps the query shape inside what
 * `/assets` already runs, which is what makes this index-safe: the declared
 * composite `(status ASC, createdAt DESC)` covers it, and nothing catches a
 * missing index — not even the emulator. Widen the shape here and
 * the export 500s in production while every local gate stays green.
 *
 * NOT `paginate()`: it mints cursors and caps a page, and a bulk export wants
 * neither. This is what a "filtered query → stream route" means.
 */
function assetDatasetQuery(status: Asset['status'] | undefined): Query<Asset> {
  return assetsQuery(status).orderBy(
    DEFAULT_ASSET_SORT.field,
    DEFAULT_ASSET_SORT.direction,
  )
}

/** A resolved dataset request: the query to run, and the set it describes. */
export interface AssetDataset {
  query: Query<Asset>
  /** The filter in effect; `undefined` is the whole collection. */
  status: Asset['status'] | undefined
}

/**
 * Read `?status=` off an export request and build the dataset it names.
 *
 * Returns `null` for an unparseable status — the caller answers
 * `INVALID_ARGUMENT`. A discriminated result rather than a throw, so the route
 * keeps its `apiFail` visible: the envelope is the route's dialect, and
 * a helper that answered `Response` itself would move the error path out of the
 * file that owns it.
 *
 * ⚠️ AN UNKNOWN STATUS IS A 400, NOT A FALLBACK — and this deliberately diverges
 * from `/assets`, whose search-params call an unparseable `?status` a view
 * preference and fall back to unfiltered. That policy is right for a view and
 * wrong here: a view shows you what it did, so a fallback is visible in the same
 * glance. An export hands over a FILE. `?status=activ` falling back to
 * unfiltered would hand a reader the entire collection in a file they asked to
 * be narrow — a bulk-egress route quietly exporting MORE than it was asked for,
 * which is the one direction a mistake here must never go. Fail closed and say
 * so, per the boundary rule: reject what the general mechanism cannot honor.
 *
 * The vocabulary is `AssetStatusSchema`'s, and absent means unfiltered — the
 * REPO's vocabulary (`status?: Asset['status']`), because this talks to the repo.
 * `/assets` widens that set with the string `'all'` for its filter control, but
 * that word lives in `app/(app)/(examples)/assets/search-params.ts` and is the URL
 * vocabulary of a page with a Select in it. This route has no control
 * and no business importing an example's parser — core must not import from
 * `app/(app)/(examples)/` (`rules/no-import-example-from-core.yml` enforces
 * it). So `?status=all` is a 400 here, not "everything".
 */
export function resolveAssetDataset(request: Request): AssetDataset | null {
  const values = new URL(request.url).searchParams.getAll('status')
  if (values.length === 0)
    return { query: assetDatasetQuery(undefined), status: undefined }
  if (values.length !== 1) return null

  const parsed = AssetStatusSchema.safeParse(values[0])
  if (!parsed.success) return null

  return { query: assetDatasetQuery(parsed.data), status: parsed.data }
}

/**
 * The download filename for a dataset export, named after the set it holds.
 *
 * `assets-retired.csv` rather than `assets.csv` for a filtered pull: a reader
 * ends up with several of these in one folder, and a filename is the only thing
 * that tells them apart once the file is off the browser. Built from the parsed
 * status, never from anything a user typed — this string goes into a response
 * header.
 */
export function assetDatasetFilename(
  status: Asset['status'] | undefined,
  extension: string,
): string {
  return `assets${status ? `-${status}` : ''}.${extension}`
}
