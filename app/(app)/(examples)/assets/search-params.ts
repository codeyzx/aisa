/**
 * The URL-state contract for /assets — declared ONCE, and the only place a link
 * to this page is built.
 *
 * Every writer of this contract goes through here: the page, the filter island,
 * and the pager all build their links from this one module rather than each
 * spelling `?status`, a `/assets?status=${next}` template, or a hand-assembled
 * `URLSearchParams`. That is the point of nuqs in this repo and the exact drift
 * `/state`'s search-params.ts calls out by name.
 *
 * NOT a client/server hazard: `nuqs/server` is isomorphic (parsers, a loader, a
 * serializer — no framework imports), so this module is safe to pull into a
 * 'use client' island, and `asset.schema` is schema-only so it never drags
 * firebase-admin along. Nothing here may import `lib/repos/*` or
 * `lib/data/pagination.firestore` — those are `server-only`, and a client island importing
 * one puts firebase-admin in the browser bundle.
 */
import {
  createLoader,
  createParser,
  createSerializer,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

import {
  DEFAULT_ASSET_SORT,
  ASSET_SORT_FIELDS,
  AssetStatusSchema,
  type AssetSort,
  type AssetSortField,
} from '@/features/asset/asset.schema'
import { parseAsStrictSingle } from '@/lib/search-param'

/** The filter widens the entity's own status set with an unfiltered option. */
export const ASSET_STATUS_FILTER_VALUES = [
  'all',
  ...AssetStatusSchema.options,
] as const

export type AssetsStatusFilterValue =
  (typeof ASSET_STATUS_FILTER_VALUES)[number]

function isAssetSortField(value: string): value is AssetSortField {
  return (ASSET_SORT_FIELDS as readonly string[]).includes(value)
}

/**
 * `?sort=createdAt:desc` — ONE param carrying both halves.
 *
 * Not `?sort=createdAt&dir=desc`: two params can be half-set, and `?sort=name`
 * alone would have to invent a direction. One param is either a whole sort or
 * not a sort at all.
 *
 * An unparseable or non-sortable value falls back to the default rather than
 * throwing — `?sort` is a view preference, the same policy `?status` follows.
 * Note what that quietly buys: `?sort=name:asc` cannot make the
 * server order by a field with no index, because `name` is not in
 * `ASSET_SORT_FIELDS`. The sortable set is enforced at the URL boundary, not
 * merely respected by the UI.
 */
export const assetSortParser = parseAsStrictSingle(
  createParser<AssetSort>({
    parse(value) {
      const [field, direction] = value.split(':')
      if (field === undefined || !isAssetSortField(field)) return null
      if (direction !== 'asc' && direction !== 'desc') return null
      return { field, direction }
    },
    serialize(sort) {
      return `${sort.field}:${sort.direction}`
    },
    // `eq` is mandatory for an object-valued parser: the default is `===`, which
    // is false for two structurally identical sorts, so `clearOnDefault` would
    // never fire and every URL would carry `?sort=createdAt:desc`.
    eq(a, b) {
      return a.field === b.field && a.direction === b.direction
    },
  }),
).withDefault(DEFAULT_ASSET_SORT)

/**
 * How many rows a page of /assets shows — A CLOSED SET OF THREE, and the closure
 * is the whole design.
 *
 * `?pageSize` is unlike every other param here: it is a COST INPUT. It lands in
 * `paginate`'s `limit`, i.e. in the number of documents Firestore is billed for
 * on every render of this page. `parseAsInteger` would make `?pageSize=100000` a
 * full-collection read that any stranger can trigger by typing — and a
 * clamp-after-parse is not the fix, because it still admits an arbitrary integer
 * into the code path and leaves one `Math.min` as the only thing between a URL
 * and the bill.
 *
 * `parseAsStringLiteral` closes it at the boundary instead: the parse is a
 * membership test against the tuple below, so the ONLY values `pageSize` can
 * hold are these three, and anything else — `100000`, `-1`, `abc`, `25.0` —
 * falls back to the default exactly as `?status` and `?sort` already do. The set
 * is the type, which is why the page can hand it to Firestore without checking
 * anything itself.
 *
 * SPELLED AS TEXT because a URL is text, and converting once at the one call
 * site that wants a number (`limit: Number(query.pageSize)`) is what keeps the
 * set a literal union the compiler knows. A number parser would have to convert
 * HERE, and every conversion is somewhere for an out-of-set value to be born.
 *
 * THE NUMBERS are argued from this repo's cost model, not copied from a common
 * `[25, 50, 100]` default. A UI that pages an in-memory array can offer 100 as an
 * `array.slice` that was already paid for; here every row is a billed document
 * read. That difference argues FOR the ceiling, not against it — Firestore bills
 * PER DOCUMENT, so 100 rows cost the same whether they arrive as one page of 100
 * or four of 25, and the single page is in fact marginally cheaper (one probe row
 * instead of four, one pair of `count()` aggregations instead of four). Paging
 * here also has no page jump — a cursor steps one page at a time (forward OR
 * back), with no random access — so page size still governs how deep a single
 * page reaches: a lower ceiling would cost that reach and save nothing. 100 is
 * where it stops because a page no one can scan is not a page.
 *
 * 25 is the default, and — the part that is not taste — the default MUST be a
 * member of the set, or the segmented control that shows it has no segment to
 * press (its exactly-one invariant).
 */
export const ASSET_PAGE_SIZES = ['25', '50', '100'] as const

export type AssetPageSize = (typeof ASSET_PAGE_SIZES)[number]

export const DEFAULT_ASSET_PAGE_SIZE: AssetPageSize = '25'

/**
 * How the same rows are DRAWN — `?view=card` changes no part of the query.
 * Same filter, same order, same window, same documents; only the markup differs.
 * That is what makes it the one param on this page a cursor may survive
 * (`assetsRenderHref`), and why the page hands it to no repo.
 *
 * Two values, not a three-way `['table','kanban','card']`. The MECHANISM is the
 * reusable part — a string-literal URL param plus a toggle — not the value list:
 * kanban is not a layout of a list, it groups rows by an ordered field, and this
 * entity has none (the same fact that kept `status` out of `ASSET_SORT_FIELDS`).
 * A third segment that could only group by a two-member lifecycle would be a
 * worse version of the status filter sitting next to it.
 */
export const ASSETS_VIEWS = ['table', 'card'] as const

export type AssetsView = (typeof ASSETS_VIEWS)[number]

export const DEFAULT_ASSETS_VIEW: AssetsView = 'table'

export const assetsSearchParams = {
  status: parseAsStrictSingle(
    parseAsStringLiteral(ASSET_STATUS_FILTER_VALUES),
  ).withDefault('all'),
  sort: assetSortParser,
  pageSize: parseAsStrictSingle(
    parseAsStringLiteral(ASSET_PAGE_SIZES),
  ).withDefault(DEFAULT_ASSET_PAGE_SIZE),
  view: parseAsStrictSingle(parseAsStringLiteral(ASSETS_VIEWS)).withDefault(
    DEFAULT_ASSETS_VIEW,
  ),
  /**
   * The RAW search text, as typed — the input shows it, the reader edits it. The
   * page NORMALISES it (`toSearchTerm`, lib/data/search-prefix.ts) into the single
   * prefix token the repo queries, and a value under the 2-char minimum normalises
   * to "no search". So `?q` is a view preference like `?status`: an unusable value
   * simply means the unsearched list, never an error. Default `''` (via
   * `clearOnDefault`) keeps an empty search out of the URL.
   *
   * A search CHANGE goes through `assetsViewHref`, which drops the cursor — the
   * search term is part of the cursor's `scope`, so a page from one search can
   * never resume another. Sort, page size, and view survive a search (they
   * compose with it); only the cursor resets.
   */
  q: parseAsStrictSingle(parseAsString).withDefault(''),
  // No default: `cursor` has no meaningful "first page" value — its absence IS
  // the first page. The token encodes its own nav direction (next/prev), so one
  // `?cursor` param drives Previous and Next alike.
  cursor: parseAsStrictSingle(parseAsString),
}

/** RSC-side reader. Scalar parameters reject repeated-key input. */
export const loadAssetsSearchParams = createLoader(assetsSearchParams)

/** Everything /assets reads from the URL. */
export interface AssetsQuery {
  status: AssetsStatusFilterValue
  sort: AssetSort
  pageSize: AssetPageSize
  view: AssetsView
  /** Raw search text; normalised to a prefix token server-side. */
  q: string
  cursor: string | null
}

// `clearOnDefault` (on by default) keeps `?status=all` and the default sort out
// of the URL, so /assets and /assets?status=all&sort=createdAt:desc are the same
// link, and a shared URL says only what the reader actually chose.
const serialize = createSerializer(assetsSearchParams)

/**
 * The NEXT PAGE of the query in hand. Status and sort ride along untouched —
 * a cursor is only meaningful against the query that produced it.
 */
export function assetsPageHref(query: AssetsQuery, cursor: string): string {
  return serialize('/assets', { ...query, cursor })
}

/**
 * A DIFFERENT ANSWER to the question /assets is asking: another status, another
 * sort, another page size, another search, or (with an empty `next`) the same one
 * from the top.
 *
 * THE CURSOR IS DROPPED, AND IT IS NOT DROPPED BY REMEMBERING TO. `next` cannot
 * name it — `Omit<AssetsQuery, 'cursor' | 'view'>` is what makes "page 3 of a
 * different sort" unspellable, so no caller can construct that URL by clicking,
 * ever. That is the whole reason these hrefs live here instead of at four call
 * sites.
 *
 * Why it must go: a cursor is `{ sortValue, docId }` — a POSITION IN ONE ORDERED
 * RESULT SET, not a row number. Carry it into another sort and `startAfter`
 * resumes from a value the new scan meets somewhere else entirely; carry it into
 * another filter and it resumes past rows that are no longer in the set. Neither
 * errors. Both silently serve wrong rows.
 *
 * This is belt AND braces on purpose, and the belt is the other file: `paginate`
 * refuses a cursor whose sort OR filter differs from the one being asked for, no
 * matter what the URL says (lib/data/pagination.contract.ts). That is the guarantee,
 * because it holds for hand-typed URLs, stale bookmarks, and every entity that
 * ever calls it. This function is only the braces — it keeps a wrong URL from
 * being *offered*, so a reader clicking around never even sees paging reset.
 *
 * ⚠️ `pageSize` IS DIFFERENT, AND THE COMMENT ABOVE MUST NOT BE READ AS COVERING
 * IT. A cursor is `{ sort, scope, sortValue, docId }` — it does not encode the
 * WINDOW SIZE, so `paginate` would accept a cursor across a size change without
 * complaint (same sort, same scope) and `startAfter` would resume from the same
 * row and simply take more after it. Nothing would be corrupted. There is no
 * guard here and none is needed; this is a PRODUCT decision, spelled in a type.
 *
 * It is dropped because a cursor minted at 25 rows names a boundary that a
 * 50-row pagination never produces. Resume from it and the reader is on rows
 * 76–125 — a window offset from every page they would get by walking the list at
 * 50, and every later Next keeps that offset forever. With no page numbers on
 * screen (there is no page jump) nothing on the page could explain it. A reader
 * changing the page size is asking to re-read the list in a different shape, so
 * they get it from the top, which is also what every other control on this page
 * already does.
 *
 * Note what does the work below: the literal `cursor: null`. `Partial<Omit<…,
 * 'cursor' | 'view'>>` shapes the ARGUMENT — a caller cannot ask this function
 * to set a cursor — but it does not drop the one already in `query`; the spread
 * would carry it straight through. The type narrows the ask, the code drops the
 * value.
 */
export function assetsViewHref(
  query: AssetsQuery,
  next: Partial<Omit<AssetsQuery, 'cursor' | 'view'>>,
): string {
  return serialize('/assets', { ...query, ...next, cursor: null })
}

/**
 * THE SAME ROWS, DRAWN DIFFERENTLY — `?view=table` ⇄ `?view=card`.
 *
 * The one href on this page that KEEPS the cursor, and the reason it is its own
 * function rather than another key `assetsViewHref` accepts. Switching to cards
 * changes no part of the query: same filter, same order, same page size, same
 * `startAfter`, same documents. The reader is looking at one page of rows and
 * asking for it in a different shape; throwing them back to the top would be a
 * paging reset with no query change to justify it — a gratuitous jolt that loses
 * their place to answer a question they did not ask.
 *
 * So `assetsViewHref` cannot spell `view` and this cannot spell anything else.
 * Two builders, two policies, neither expressible through the other — which is
 * what "the cursor rule is structural" has to mean once one param is exempt from
 * it. `assetsViewHref` naming a *query* change and `?view` naming a *rendering*
 * choice is an unhappy collision of one word; the functions are named for what
 * they change, so a call site cannot pick the wrong one by accident.
 */
export function assetsRenderHref(query: AssetsQuery, view: AssetsView): string {
  return serialize('/assets', { ...query, view })
}

/**
 * The reader's CURRENT list URL — the exact place a create/edit flow must return
 * them to, and the value carried as `?returnTo`.
 *
 * It is NOT `/assets`: a reader who opened the form from page 3 of a filtered,
 * sorted, card-view list expects to land back on page 3 of that same list, not at
 * the top of the default one. So it reproduces the whole query the reader is
 * looking at — and that splits on the cursor, because the two builders that CAN
 * reproduce a query disagree on paging by design:
 *
 *  - With a cursor in hand, `assetsPageHref` reproduces the page they are ON
 *    (it carries the cursor through untouched).
 *  - Without one, they are on the first page, and `assetsViewHref(query, {})` is
 *    the top-of-view link (it drops the cursor it does not have and keeps every
 *    other choice).
 *
 * Built HERE, not in a leaf, for the same reason every other href on this page is:
 * this is the one module allowed to assemble a link to /assets, so a call site
 * cannot hand-roll a returnTo that forgets a param (the silent way a reader loses
 * their place across a submit).
 */
export function assetsCurrentHref(query: AssetsQuery): string {
  return query.cursor
    ? assetsPageHref(query, query.cursor)
    : assetsViewHref(query, {})
}

/**
 * The links that OPEN the create / edit form carrying a returnTo — the only place
 * `/assets/new` and `/assets/[id]/edit` URLs are assembled.
 *
 * `returnTo` is a whole list URL (`assetsCurrentHref`), so it has its own `?` and
 * `&`; `encodeURIComponent` is what keeps those from folding into THIS route's
 * query and being lost. Not built through the nuqs serializer: `returnTo` is a
 * param on these two routes, not a member of the /assets query contract above, so
 * it is assembled directly and validated at the boundary it lands on
 * (`safeInternalPath`, on the page AND re-checked in the action).
 */
const formSerialize = createSerializer({
  returnTo: parseAsStrictSingle(parseAsString),
})

export const loadAssetFormSearchParams = createLoader({
  returnTo: parseAsStrictSingle(parseAsString),
})

export function assetNewHref(returnTo: string): string {
  return formSerialize('/assets/new', { returnTo })
}

export function assetEditHref(id: string, returnTo: string): string {
  return formSerialize(`/assets/${id}/edit`, { returnTo })
}
