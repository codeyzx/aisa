import { describe, expect, it } from 'vitest'

import { assetScope } from '@/features/asset/asset.repo'
import { DEFAULT_ASSET_SORT } from '@/features/asset/asset.schema'
import { toSearchTerm } from '@/lib/data/search-prefix'

import {
  DEFAULT_ASSET_PAGE_SIZE,
  DEFAULT_ASSETS_VIEW,
  ASSET_PAGE_SIZES,
  assetEditHref,
  assetNewHref,
  assetsCurrentHref,
  assetsPageHref,
  assetsRenderHref,
  assetsViewHref,
  loadAssetsSearchParams,
  type AssetsQuery,
} from './search-params'

/**
 * What a /assets URL MEANS, and which links the page is allowed to offer.
 *
 * This is the half of the page that a Server Component cannot be tested for —
 * `page.tsx` awaits Firestore — so the decisions live here, pure, and the page
 * only spends them. Every case names the mutation that reddens it.
 *
 * `?pageSize` is the one to read first. It is the only param that lands in a
 * BILL rather than in a rendering, so its parse is the difference between a view
 * preference and a read-cost attack anyone can run by typing a URL.
 */

const FIRST_PAGE: AssetsQuery = {
  status: 'all',
  sort: DEFAULT_ASSET_SORT,
  pageSize: DEFAULT_ASSET_PAGE_SIZE,
  view: DEFAULT_ASSETS_VIEW,
  q: '',
  cursor: null,
}

const DEEP: AssetsQuery = {
  status: 'retired',
  sort: { field: 'createdAt', direction: 'asc' },
  pageSize: '50',
  view: 'card',
  q: 'lampu',
  cursor: 'CURSOR',
}

describe('loadAssetsSearchParams', () => {
  it('rejects repeated keys instead of selecting one', () => {
    const query = loadAssetsSearchParams({ status: ['retired', 'active'] })
    expect(query.status).toBe('all')
  })

  it('defaults to the entity default sort when the URL says nothing', () => {
    // Mutation that reddens this: dropping `.withDefault(DEFAULT_ASSET_SORT)`,
    // which hands the page a null sort and un-sorts the header.
    expect(loadAssetsSearchParams({}).sort).toEqual(DEFAULT_ASSET_SORT)
  })

  it('reads both halves of a sort out of one param', () => {
    expect(loadAssetsSearchParams({ sort: 'createdAt:asc' }).sort).toEqual({
      field: 'createdAt',
      direction: 'asc',
    })
  })

  it('refuses a field outside the sortable set', () => {
    // The boundary that keeps the index bill honest: `name` has no composite
    // index and never will (it is a label column), so a hand-typed
    // ?sort=name:asc must not reach Firestore. It would be served fine by the
    // emulator and FAILED_PRECONDITION in production.
    //
    // Mutation that reddens this: dropping the `isAssetSortField` check, or
    // widening ASSET_SORT_FIELDS to shut this up.
    expect(loadAssetsSearchParams({ sort: 'name:asc' }).sort).toEqual(
      DEFAULT_ASSET_SORT,
    )
  })

  it('refuses a direction it cannot honour', () => {
    // Mutation that reddens this: accepting any string as the direction, which
    // reaches `.orderBy(field, 'sideways')` and throws inside the RSC.
    expect(loadAssetsSearchParams({ sort: 'createdAt:sideways' }).sort).toEqual(
      DEFAULT_ASSET_SORT,
    )
  })

  it('falls back rather than throwing on a half-written sort', () => {
    // `?sort` is a view preference, not an instruction — same policy `?status`
    // has. A truncated shared link renders the default, it does not 500.
    expect(loadAssetsSearchParams({ sort: 'createdAt' }).sort).toEqual(
      DEFAULT_ASSET_SORT,
    )
    expect(loadAssetsSearchParams({ status: 'nope' }).status).toBe('all')
  })
})

describe('loadAssetsSearchParams — ?pageSize', () => {
  /**
   * THE DANGEROUS PARAM. `?pageSize` is the only one that lands in a COST: it
   * becomes `paginate`'s `limit`, i.e. how many documents Firestore is billed
   * for. Everything below is one claim — the parse is a CLOSED SET, so no value
   * outside it can reach the query — checked from the outside.
   */
  it('reads a size the set offers', () => {
    expect(loadAssetsSearchParams({ pageSize: '50' }).pageSize).toBe('50')
  })

  it('defaults when the URL says nothing', () => {
    expect(loadAssetsSearchParams({}).pageSize).toBe(DEFAULT_ASSET_PAGE_SIZE)
  })

  it('refuses a size outside the set — the read-cost attack', () => {
    // The whole reason the parse is a literal union. With `parseAsInteger` this
    // is a 100k-document read that any stranger runs by typing a URL, and
    // `count()` renders beside it. Mutation that reddens this: swapping the
    // parser for `parseAsInteger`, with or without a clamp behind it — a clamp
    // returns 100 here, not '25'.
    expect(loadAssetsSearchParams({ pageSize: '100000' }).pageSize).toBe(
      DEFAULT_ASSET_PAGE_SIZE,
    )
  })

  it('offers no size past the ceiling the set was argued to', () => {
    // Pins the BOUND, not a magic string. Every other test here names a value
    // that must be refused ('100000', '-1', 'abc'), which protects those exact
    // strings and nothing else: add '99999' to the tuple and the whole suite
    // stays green while the read-cost attack the parse exists to stop becomes a
    // documented, clickable option.
    //
    // 100 is not arbitrary — it is where the argument in search-params.ts stops:
    // a page nobody can scan is not a page. Firestore bills per document, so the
    // ceiling is the only thing standing between "the reader chose a big page"
    // and "the reader emptied the collection in one render".
    const CEILING = 100
    for (const size of ASSET_PAGE_SIZES) {
      expect(Number(size), `${size} is past the ceiling`).toBeLessThanOrEqual(
        CEILING,
      )
      expect(Number.isInteger(Number(size)), `${size} is not whole`).toBe(true)
      expect(Number(size), `${size} is not a page`).toBeGreaterThan(0)
    }
  })

  it('refuses every other shape of nonsense', () => {
    // A negative limit throws inside the RSC; a zero one renders a pager to
    // nowhere forever; `25.0` and `0x19` are the near-misses an integer parse
    // would wave through. All are the same answer: the default.
    for (const pageSize of ['-1', '0', 'abc', '', '25.0', '0x19', '1e2']) {
      expect(loadAssetsSearchParams({ pageSize }).pageSize).toBe(
        DEFAULT_ASSET_PAGE_SIZE,
      )
    }
  })

  it('only ever hands the page a member of the set', () => {
    // The claim the page leans on when it writes `Number(query.pageSize)` with
    // no check of its own. Mutation that reddens this: widening the parser to
    // admit anything the tuple does not list.
    for (const pageSize of ['25', '50', '100', '99', '100000', 'abc']) {
      expect(ASSET_PAGE_SIZES).toContain(
        loadAssetsSearchParams({ pageSize }).pageSize,
      )
    }
  })

  it('the default is a member of the set', () => {
    // Not pedantry: the segmented control renders the default as its pressed
    // value, and a value matching no segment leaves the control with nothing
    // pressed — the exactly-one invariant it exists to hold.
    expect(ASSET_PAGE_SIZES).toContain(DEFAULT_ASSET_PAGE_SIZE)
  })
})

describe('loadAssetsSearchParams — ?view', () => {
  it('reads a view the set offers', () => {
    expect(loadAssetsSearchParams({ view: 'card' }).view).toBe('card')
  })

  it('falls back to the table for anything else', () => {
    // Same policy as every other view preference here: a stale or hand-typed
    // link renders the default, it does not 500. `kanban` is the specific
    // near-miss — a value some toggles ship and this one does not.
    expect(loadAssetsSearchParams({ view: 'kanban' }).view).toBe(
      DEFAULT_ASSETS_VIEW,
    )
    expect(loadAssetsSearchParams({}).view).toBe(DEFAULT_ASSETS_VIEW)
  })
})

describe('loadAssetsSearchParams — ?q', () => {
  it('reads the raw search text as typed', () => {
    // Raw, not normalised: the input shows what the reader typed; the page
    // normalises it (`toSearchTerm`) into the query token.
    expect(loadAssetsSearchParams({ q: 'Laptop Kantor' }).q).toBe(
      'Laptop Kantor',
    )
  })

  it('defaults to an empty search', () => {
    expect(loadAssetsSearchParams({}).q).toBe('')
  })
})

/**
 * The bulk SELECTION scope — the string the page stamps a selection with, which
 * MUST equal the string the cursor is stamped with (`assetScope`), or a stale
 * selection could outlive a search change and a bulk delete would target a row the
 * search has hidden. Mirrors the page's derivation exactly: `status='all'` →
 * undefined, and `?q` normalised through `toSearchTerm`.
 *
 * Reaches into the repo's PURE `assetScope` — no query runs, so this stays a unit
 * test even though asset.repo is a `server-only` module (vitest stubs it).
 */
function selectionScope(query: AssetsQuery): string {
  const status = query.status === 'all' ? undefined : query.status
  return assetScope(status, toSearchTerm(query.q))
}

describe('the selection scope shared with the cursor', () => {
  it('CHANGES when the effective search changes, so a stale selection masks', () => {
    // The bug this closes: a selection scoped by status ALONE survived a search
    // change, so a row picked under "chair" stayed selected after searching
    // "desk" and a bulk delete would take a hidden row. A different scope string
    // is what makes `selectedIds` return empty under it (data-table-selection.ts),
    // which is the mask.
    expect(selectionScope({ ...FIRST_PAGE, q: 'chair' })).not.toBe(
      selectionScope({ ...FIRST_PAGE, q: 'desk' }),
    )
  })

  it('is IDENTICAL across sort / pageSize / cursor / view — none reach it', () => {
    // Those four change which rows are drawn or where paging resumes, never which
    // rows are IN the set, so a selection must survive them. The scope depends on
    // status + effective search only, so it is the same string across all four —
    // and this reddens the day someone "improves" `assetScope` to fold one in.
    const base = selectionScope(FIRST_PAGE)
    expect(
      selectionScope({
        ...FIRST_PAGE,
        sort: { field: 'value', direction: 'asc' },
      }),
    ).toBe(base)
    expect(selectionScope({ ...FIRST_PAGE, pageSize: '100' })).toBe(base)
    expect(selectionScope({ ...FIRST_PAGE, cursor: 'CURSOR' })).toBe(base)
    expect(selectionScope({ ...FIRST_PAGE, view: 'card' })).toBe(base)
  })

  it('folds a punctuation-only ?q into the UNSEARCHED scope', () => {
    // `--` normalises to null (`toSearchTerm`), so it must SHARE the unsearched
    // list's scope — not mint a phantom `q=--` scope that strands a selection.
    // This is why the page scopes on the normalised `search`, never raw `query.q`.
    expect(selectionScope({ ...FIRST_PAGE, q: '--' })).toBe(
      selectionScope(FIRST_PAGE),
    )
  })
})

describe('assetsViewHref — the search axis', () => {
  it('drops the cursor when the search changes', () => {
    // Search is part of the cursor's scope, so a page from one search can never
    // resume another. A search change is a new answer, so paging resets.
    const href = assetsViewHref(DEEP, { q: 'meja' })
    expect(href).toContain('q=meja')
    expect(href).not.toContain('cursor')
  })

  it('clears the search and the cursor together', () => {
    // The Clear action: empty `q` is the default, so `clearOnDefault` drops it
    // from the URL — and the cursor goes with it.
    const href = assetsViewHref(DEEP, { q: '' })
    expect(href).not.toContain('q=')
    expect(href).not.toContain('cursor')
  })

  it('keeps the search when only the filter changes', () => {
    // Search composes with the status filter and the sort — changing one must
    // not silently discard the other. Mutation that reddens this: dropping
    // `...query` from the spread.
    expect(assetsViewHref(DEEP, { status: 'active' })).toContain('q=lampu')
  })
})

describe('assetsViewHref', () => {
  it('drops the cursor when the sort changes', () => {
    // THE rule. A cursor is a position in ONE ordered result set; replayed
    // against another order it silently serves the rows around the wrong place.
    //
    // Mutation that reddens this: `serialize('/assets', { ...query, ...view })`
    // — i.e. forgetting `cursor: null`, which is exactly the line of code a
    // reviewer's eye slides over.
    const href = assetsViewHref(DEEP, {
      sort: { field: 'createdAt', direction: 'desc' },
    })

    expect(href).not.toContain('cursor')
  })

  it('drops the cursor when the filter changes', () => {
    // Same reason, other axis: a cursor from the unfiltered list resumes past
    // rows that are not in the filtered set at all.
    expect(assetsViewHref(DEEP, { status: 'active' })).not.toContain('cursor')
  })

  it('drops the cursor even when nothing else changes', () => {
    // This is the "back to the first page" link on the empty state. Passing an
    // empty view must still reset paging — mutation that reddens this: making
    // `cursor: null` conditional on `view` being non-empty.
    expect(assetsViewHref(DEEP, {})).not.toContain('cursor')
  })

  it('keeps the sort when only the filter changes', () => {
    // A filter change must not drop `?sort` — a bare `/assets?status=x` throws
    // away the order the reader chose.
    // Mutation that reddens this: dropping `...query` from the spread.
    expect(assetsViewHref(DEEP, { status: 'active' })).toContain(
      'sort=createdAt:asc',
    )
  })

  it('keeps the filter when only the sort changes', () => {
    // Mutation that reddens this: the same missing `...query` — sorting an
    // "Retired" table would silently show every asset.
    const href = assetsViewHref(DEEP, {
      sort: { field: 'createdAt', direction: 'desc' },
    })

    expect(href).toContain('status=retired')
  })

  it('drops the cursor when the page size changes', () => {
    // The DELIBERATE half of the cursor rule, and the one with no correctness
    // argument under it. `paginate` would ACCEPT this cursor — a cursor carries
    // `{ sort, scope, sortValue, docId }` and no window size, so the sort and
    // the scope both still match and `startAfter` would resume from the same row
    // and just take more after it. Nothing would break. It is dropped because a
    // cursor minted at 25 names a boundary a 50-row pagination never produces,
    // so resuming would leave the reader permanently offset from the pages they
    // asked for, with no page number on screen to explain it.
    //
    // Mutation that reddens this: `Omit<AssetsQuery, 'cursor' | 'view' |
    // 'pageSize'>` + a `pageSize` key on `assetsRenderHref` — i.e. deciding a
    // size change is a rendering change.
    expect(assetsViewHref(DEEP, { pageSize: '100' })).not.toContain('cursor')
  })

  it('keeps the page size and the view when something else changes', () => {
    // Changing the filter must not silently drop the reader back to 25 rows or
    // out of the card grid. Mutation that reddens this: dropping `...query`.
    const href = assetsViewHref(DEEP, { status: 'active' })

    expect(href).toContain('pageSize=50')
    expect(href).toContain('view=card')
  })

  // NOT tested here: that `assetsViewHref` cannot change the view. That is a
  // TYPE guarantee only — `view` is `Omit`-ed from the argument, so no caller
  // can spell it — and the spread would happily apply one that got past the
  // compiler via a cast. A test would have to write that cast itself, and would
  // then be asserting the behaviour of code no caller can reach. `pnpm
  // typecheck` is the gate for this one; saying so beats a test that pretends
  // otherwise.

  it('says nothing it does not have to', () => {
    // Defaults stay out of the URL, so /assets === /assets?status=all&
    // sort=createdAt:desc and a shared link carries only real choices.
    // Mutation that reddens this: `createSerializer(..., { clearOnDefault:
    // false })`, or dropping the parser's `eq` (the default `===` never matches
    // two structurally equal sorts, so the default would always serialize).
    expect(assetsViewHref(FIRST_PAGE, {})).toBe('/assets')
  })
})

describe('assetsRenderHref', () => {
  it('KEEPS the cursor — the one href that does', () => {
    // The deliberate asymmetry, and the reason this is its own function. A view
    // switch changes no part of the query: same filter, same order, same size,
    // same `startAfter`, same documents. Resetting paging for it would take the
    // reader's place away to answer a question they did not ask.
    //
    // Mutation that reddens this: routing the view switch through
    // `assetsViewHref` (i.e. deleting this function and widening that Omit).
    expect(assetsRenderHref(DEEP, 'table')).toContain('cursor=CURSOR')
  })

  it('changes the view and nothing else', () => {
    const href = assetsRenderHref(DEEP, 'table')

    // 'table' is the default, so `clearOnDefault` drops the key entirely —
    // which IS the switch: /assets?view=card → /assets with no view.
    expect(href).not.toContain('view=')
    expect(href).toContain('status=retired')
    expect(href).toContain('sort=createdAt:asc')
    expect(href).toContain('pageSize=50')
  })

  it('spells a non-default view', () => {
    // The other direction, from a URL that says nothing at all.
    expect(assetsRenderHref(FIRST_PAGE, 'card')).toBe('/assets?view=card')
  })
})

describe('assetsCurrentHref — the returnTo a modal flow carries', () => {
  it('KEEPS the cursor so a save returns to the same page, not the top', () => {
    // A create/edit opened from page 2 of a filtered list must return the reader
    // to page 2 — so with a cursor in hand it reproduces the whole paged query
    // (via `assetsPageHref`). Mutation that reddens this: routing the cursor case
    // through `assetsViewHref`, which drops it and dumps the reader at the top.
    const href = assetsCurrentHref(DEEP)
    expect(href).toContain('cursor=CURSOR')
    expect(href).toContain('status=retired')
    expect(href).toContain('sort=createdAt:asc')
    expect(href).toContain('q=lampu')
    expect(href).toContain('pageSize=50')
    expect(href).toContain('view=card')
  })

  it('returns the top of the view when there is no cursor', () => {
    // No cursor means first page; the returnTo is the filtered/sorted list from
    // the top, carrying every non-cursor choice but minting no cursor.
    const href = assetsCurrentHref({ ...DEEP, cursor: null })
    expect(href).not.toContain('cursor')
    expect(href).toContain('status=retired')
    expect(href).toContain('view=card')
  })

  it('is bare /assets on the default list', () => {
    // The default list carries no choices, so the returnTo is just /assets — a
    // shared save-and-return link says only what the reader actually chose.
    expect(assetsCurrentHref(FIRST_PAGE)).toBe('/assets')
  })
})

describe('assetNewHref / assetEditHref — encode the returnTo', () => {
  it('encodes a returnTo that itself carries a query', () => {
    // The returnTo is a whole list URL with its own `?` and `&`; without
    // encoding they would fold into the /new (or /edit) route's own query and be
    // lost — the reader would land back on the default list after a save.
    const returnTo = '/assets?status=retired&cursor=CURSOR'
    expect(
      new URL(assetNewHref(returnTo), 'https://example.test').searchParams.get(
        'returnTo',
      ),
    ).toBe(returnTo)
    expect(
      new URL(
        assetEditHref('abc123', returnTo),
        'https://example.test',
      ).searchParams.get('returnTo'),
    ).toBe(returnTo)
    // The `&` and `?` really are escaped (this is the whole point).
    expect(assetNewHref(returnTo)).not.toContain('&cursor=')
  })

  it('round-trips a returnTo built by assetsCurrentHref', () => {
    // The two builders compose: the edit link encodes exactly what the page
    // computed, and decoding it yields the current list URL back.
    const returnTo = assetsCurrentHref(DEEP)
    const href = assetEditHref('id', returnTo)
    expect(
      new URL(href, 'https://example.test').searchParams.get('returnTo'),
    ).toBe(returnTo)
  })
})

describe('assetsPageHref', () => {
  it('carries the whole query into the next page', () => {
    // A cursor is only meaningful against the query that produced it, so the
    // pager must reproduce that query exactly. Mutation that reddens this:
    // building the href from `{ cursor }` alone — the next page would drop the
    // filter and the sort and serve rows from a query the cursor never ran on.
    const href = assetsPageHref(DEEP, 'NEXT')

    expect(href).toContain('status=retired')
    expect(href).toContain('sort=createdAt:asc')
    expect(href).toContain('cursor=NEXT')
    // The search is half of what the cursor was minted against — it must survive
    // paging too, exactly like the filter and the sort.
    expect(href).toContain('q=lampu')
    // The window size is half of what the cursor was minted against: page 2 of
    // 50 must not silently become page 2 of 25. And the reader stays in the
    // view they were reading in.
    expect(href).toContain('pageSize=50')
    expect(href).toContain('view=card')
  })

  it('replaces the cursor it was given rather than appending', () => {
    expect(assetsPageHref(DEEP, 'NEXT')).not.toContain('CURSOR')
  })
})
