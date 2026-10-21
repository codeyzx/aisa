import 'server-only'

import {
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

import {
  decodeCursor,
  encodeCursor,
  type CursorSort,
  type Page,
  type SortDirection,
  type SortValue,
} from './pagination.contract'

/**
 * Firestore EXECUTION for the database-neutral pagination contract. Everything
 * Firestore-specific lives here — `Timestamp` boxing, `Query`, the `__name__`
 * tiebreaker, `startAfter`/`endBefore`/`limitToLast`, snapshot reads — so the
 * persistence fork replaces this adapter (by path) and keeps
 * `pagination.contract.ts` unchanged. The pure cursor identity/validation
 * reasoning is in the contract; a consumer imports `Page` from the contract and
 * `paginate` from here.
 */

/** Box a raw Firestore field value into a JSON-safe `SortValue`. */
function boxSortValue(raw: unknown): SortValue {
  if (raw instanceof Timestamp) return { __ts: raw.toMillis() }
  if (
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
  ) {
    return raw
  }
  // Anything else — `null`, an array, a GeoPoint, a nested map — is a value this
  // cursor scheme cannot carry. A bare `as SortValue` would mint a token that
  // `decodeCursor` then rejects as malformed, so the reader silently restarts at
  // page one on every "next" — a paging loop with no error anywhere. This value
  // comes from a server-side READ of the ordered field: an unsupported one means
  // the query is ordered on a field this pager cannot page, a bug to surface
  // loudly at the mint, not a token to hand back that can never decode.
  throw new TypeError(
    `cannot paginate on a non-scalar sort value (got ${raw === null ? 'null' : typeof raw})`,
  )
}

/** Inverse of `boxSortValue` — the value handed back to `startAfter`. */
function unboxSortValue(
  value: SortValue,
): string | number | boolean | Timestamp {
  // oxlint-disable-next-line no-underscore-dangle -- `__ts` is the cursor token's wire key; renaming it breaks every cursor already issued
  if (typeof value === 'object') return Timestamp.fromMillis(value.__ts)
  return value
}

export interface PaginateOptions {
  limit: number
  cursor?: string | null
  orderByField: string
  /** Sort direction for `orderByField`; defaults to `'asc'`. */
  direction?: SortDirection
  /**
   * REQUIRED opaque identity of the FILTER already applied to `baseQuery` — e.g.
   * `'status=retired'`, or `'status=all'` for the unfiltered set. Any stable
   * string; it is only ever compared to itself.
   *
   * Not optional, and with no `''` fallback: an omitted scope is the exact hole
   * scope exists to close. Two differently-filtered queries that both left it out
   * would mint indistinguishable unscoped tokens and page each other's rows. So
   * every caller must NAME its set — even the unfiltered one, which is a real set
   * (`'status=all'`), not the absence of a filter (`''`).
   *
   * Kept opaque deliberately: `paginate` must not learn what a filter IS. It
   * takes a `Query` already narrowed however the entity liked; the caller names
   * its own set and this only checks the name still matches.
   */
  scope: string
}

/**
 * Order by `orderByField` (+ doc-id tiebreaker), apply the cursor's
 * `startAfter`, fetch `limit` rows, and derive the next cursor. `items` are
 * already typed because the converter travels with `baseQuery`.
 *
 * `nextCursor` is non-null IF AND ONLY IF another row exists. It ASKS rather
 * than guesses: the query fetches `limit + 1` and the extra row is the answer,
 * then thrown away. Fetching exactly `limit` cannot tell a full page from a last
 * page, so the old rule — mint a cursor whenever the page came back full —
 * promised a next page to every collection whose size was an exact multiple of
 * the limit, and delivered an empty one.
 */
export async function paginate<T>(
  baseQuery: Query<T>,
  opts: PaginateOptions,
): Promise<Page<T>> {
  // The one description of this page's ordering: it drives the query, it is
  // stamped into the cursor minted below, and it is what an incoming cursor
  // must have been minted under to be usable. Derived once so the three can
  // never disagree.
  const sort: CursorSort = {
    field: opts.orderByField,
    direction: opts.direction ?? 'asc',
  }
  const { scope, limit } = opts
  const ordered = baseQuery
    .orderBy(sort.field, sort.direction)
    .orderBy('__name__', sort.direction)

  // A cursor from a different sort/scope decodes to null and is simply dropped —
  // the reader lands on the first page of the query they asked for. `nav` (baked
  // into the token) picks which way to resume.
  const cursor = opts.cursor ? decodeCursor(opts.cursor, sort, scope) : null

  // Fetch limit+1: the probe row is the ONLY honest signal for "is there another
  // page this way". It is evidence, never content, and is dropped below.
  let docs: QueryDocumentSnapshot<T>[]
  let hasPrev: boolean
  let hasNext: boolean

  if (cursor?.nav === 'prev') {
    // BACKWARD: the rows immediately BEFORE the anchor, still in sort order
    // (`limitToLast` does not reverse). A probe therefore sits at the FRONT — it
    // is the row one page further back — so more-before is `length > limit` and it
    // is the first element to drop. We arrived from a page AFTER this one, so a
    // next page always exists.
    const snap = await ordered
      .endBefore(unboxSortValue(cursor.sortValue), cursor.docId)
      .limitToLast(limit + 1)
      .get()
    hasPrev = snap.docs.length > limit
    docs = hasPrev ? snap.docs.slice(1) : snap.docs
    hasNext = true
  } else {
    // FORWARD (a 'next' cursor) or the FIRST PAGE (no cursor). The probe sits at
    // the BACK, so more-after is `length > limit` and it is the last to drop. A
    // 'next' cursor means we started AFTER a row, so a previous page exists; the
    // first page (no cursor) has none.
    const anchored = cursor
      ? ordered.startAfter(unboxSortValue(cursor.sortValue), cursor.docId)
      : ordered
    const snap = await anchored.limit(limit + 1).get()
    hasNext = snap.docs.length > limit
    docs = snap.docs.slice(0, limit)
    hasPrev = cursor !== null
  }

  const items = docs.map((doc) => doc.data())
  const first = docs[0]
  const last = docs.at(-1)

  // Anchor prev on the FIRST kept row (`endBefore` it fills the page before) and
  // next on the LAST kept row (`startAfter` it fills the page after). Each minted
  // cursor re-enters this function through the branch its `nav` selects.
  const prevCursor =
    hasPrev && first
      ? encodeCursor({
          sort,
          scope,
          sortValue: boxSortValue(first.get(sort.field)),
          docId: first.id,
          nav: 'prev',
        })
      : null
  const nextCursor =
    hasNext && last
      ? encodeCursor({
          sort,
          scope,
          sortValue: boxSortValue(last.get(sort.field)),
          docId: last.id,
          nav: 'next',
        })
      : null

  return { items, nextCursor, prevCursor }
}
