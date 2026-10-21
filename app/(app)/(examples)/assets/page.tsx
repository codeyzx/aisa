import { type Metadata } from 'next'
import Link from 'next/link'
import { PlusIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { countLabel, DataTableCursorNav } from '@/components/ui/data-table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { requireCapability } from '@/lib/auth/guards'
import { toSearchTerm } from '@/lib/data/search-prefix'
import { formatRupiah } from '@/lib/format/currency'
import { formatDate } from '@/lib/format/date'
import {
  assetScope,
  countAssets,
  listAssets,
} from '@/features/asset/asset.repo'
import { ASSET_STATUS_LABEL } from '@/features/asset/asset.schema'
import { ASSET_FIELD_LABEL } from '@/features/asset/asset.display'

import { STATUS_VARIANT } from './_components/asset-display'
import { AssetRowActions } from './_components/asset-row-actions'
import {
  AssetsBulkBar,
  AssetSelectCheckbox,
} from './_components/assets-selection'
import { AssetsTable } from './_components/assets-table'
import { AssetsListToolbar } from './_components/assets-toolbar'
import {
  assetsCurrentHref,
  assetNewHref,
  assetsPageHref,
  assetsViewHref,
  loadAssetsSearchParams,
} from './search-params'

export const metadata: Metadata = {
  title: 'Aset',
}

/**
 * Example list page. Lives in the `(examples)` route group so the whole demo
 * deletes in one shot (see the removal checklist in
 * docs/reference/contracts/data.md). Public URL: `/assets`.
 *
 * Canonical gated-RSC idiom: resolve the capability guard FIRST, then read
 * data. `requireCapability` bounces anonymous users to /login and unauthorized
 * ones to /403 before any query runs.
 *
 * THE PAGE IS STILL A SERVER COMPONENT — only ONE branch of it is an island.
 * The TABLE view is `AssetsTable`, a focused 'use client' island over
 * @tanstack/react-table: interactive column/row STATE (a right-pinned sticky
 * actions column, a tri-state select-all header) is the
 * documented trigger to reach for the library (docs/reference/contracts/ui.md),
 * so that view — and only that view — hydrates. The CARD branch below is still
 * fully server-rendered, as is everything around both (header, toolbar, bulk
 * bar, count, pager). The server stays authoritative for search, filter, sort,
 * counts, cursor paging, page size and selection scope; the island owns
 * PRESENTATION only.
 *
 * SELECTION does not change that. It is client state, which might seem to force
 * a list page into a client island — it does not. The checkbox cells and the
 * tri-state header share a module-level store rather than a provider, so the
 * page stays an RSC and the card branch renders those same islands too. See
 * _components/assets-selection.tsx for the full argument and its costs.
 */
/**
 * The list wrapper focus retreats INTO when a destructive row action destroys
 * the row that held the trigger.
 *
 * "Into", not "onto", and the distinction is the whole reason this is documented
 * — see the wrapper below. Base UI does not focus what `finalFocus` returns; it
 * focuses that element's first TABBABLE element.
 *
 * A CONSTANT, spelled once and passed down, because two different files have to
 * agree on it: the wrapper below carries the id, and `AssetRowActions` resolves
 * it at close time. Two literals would be a contract kept by memory — the
 * failure would be silent (focus falls to `<body>`, exactly the bug this fixes)
 * and no check in this repo catches it.
 *
 * It is an ID rather than a ref because this page is a Server Component: a
 * `RefObject` cannot cross to the island, a string can. That constraint is real
 * and is why the row-action call site uses the function form while the bulk bar
 * — whose target is inside its own island — uses a plain ref.
 */
const ASSETS_LIST_ID = 'assets-list'

interface AssetsPageProps {
  // Next 16: `searchParams` is a Promise. nuqs's loader takes the Promise
  // directly and hands back typed values — see search-params.ts, which owns
  // every key, fallback, and href on this page.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  await requireCapability('asset:read')

  const query = loadAssetsSearchParams(await searchParams)
  // `all` is the filter's word for "no filter"; the repo's word is `undefined`.
  // The URL keeps the reader's vocabulary, the query gets Firestore's.
  const status = query.status === 'all' ? undefined : query.status
  // The raw `?q` text normalised to the single prefix token the repo queries, or
  // null when it is under the 2-char minimum (which reads as "no search"). The
  // URL keeps what the reader typed; the query gets the normalised prefix.
  const search = toSearchTerm(query.q)
  // The way back to the top of THIS view — same filter, same search, same sort,
  // no cursor.
  const listHref = assetsViewHref(query, {})
  // The EXACT list URL the reader is on — filter, sort, search, page size, view,
  // AND the cursor. Computed ONCE and threaded into every link that opens the
  // create/edit form (the "Aset baru" button and each row's Edit) as `?returnTo`,
  // so a save or a Cancel lands back on this page rather than the default list.
  // The two form routes re-validate it (`safeInternalPath`) before trusting it.
  const returnTo = assetsCurrentHref(query)

  // Three reads, one round-trip's worth of latency (the Next docs' parallel
  // data-fetching idiom — requests start when called, not when awaited).
  //
  // COST: `count()` is billed, so the page spends ONE aggregation unfiltered and
  // TWO filtered — never more. Unfiltered, `total` and `filtered` are the same
  // fact, and paying twice to learn it once is the easy waste here; the
  // conditional below is the whole saving. `countLabel` then drops the
  // "(filtered from N)" clause on its own, because `total > filtered` is false.
  const [{ items, nextCursor, prevCursor }, filtered, unfilteredTotal] =
    await Promise.all([
      listAssets({
        // The ONLY number that reaches Firestore's `limit` from this URL, and the
        // bound is visible right here: `query.pageSize` is typed `'25' | '50' |
        // '100'`, because `parseAsStringLiteral` answers anything else with the
        // default (search-params.ts). So `Number` cannot produce a fourth value —
        // there is nothing to clamp, and no arbitrary integer to clamp it from.
        limit: Number(query.pageSize),
        cursor: query.cursor,
        status,
        search,
        sort: query.sort,
      }),
      // Still no `orderBy` on either count, and sorting does not change that: a
      // count has no order, and asking for one buys the composite index back.
      // `filtered` shares the SEARCH too, so the denominator describes the same
      // set the rows do.
      countAssets(status, search),
      // The pre-narrowing total for the "(disaring dari N)" clause. Pay the second
      // aggregation only when SOMETHING narrows — a status filter OR a search;
      // with neither, `total` IS `filtered`.
      status !== undefined || search !== null ? countAssets() : undefined,
    ])
  const total = unfilteredTotal ?? filtered

  // The two things the selection islands need, both derived HERE so the client
  // never re-reads the URL to learn them (the same rule the toolbar follows).
  //
  // `scope` is the status filter AND the effective search — the SAME string the
  // cursor is stamped with (`assetScope`, built from the exact `status` and
  // normalised `search` handed to `listAssets` above), so a selection and a page
  // token invalidate together. Not the sort, not the page size, not the cursor:
  // those change which rows are on screen, never which rows are in the set, so a
  // reader who ticks three boxes and then re-sorts or pages keeps their three.
  // Change the FILTER or the SEARCH and the selection masks — see `selectedIds`
  // for why that coarse prune is the honest one here. (Passing `search`, not
  // `query.q`, is what makes a punctuation-only `--` — which normalises to no
  // search — share the unsearched scope rather than minting a phantom one.)
  const scope = assetScope(status, search)
  const pageIds = items.map((item) => item.id)

  /**
   * ONE empty state, both views — because empty is a property of the QUERY, not
   * of how the answer is drawn. The reason it matched nothing ("no retired
   * assets", "nothing on this page") is identical in a table and in a card grid,
   * so forking the copy per view would be two spellings of one fact.
   *
   * The SAME node renders two ways, and that is the point: in the table it fills
   * the body and `DataTable` strips its panel chrome; in the grid it keeps that
   * chrome, because there it is the surface. One spelling of the fact, drawn to
   * fit whichever view is asking.
   *
   * A common rule — the table keeps its chrome when empty and swaps only the
   * BODY, while a card grid short-circuits to a whole EmptyState — applies
   * here, though for a different reason worth keeping straight. That rule
   * protects the count line and the pager; on this page both
   * already live outside the table (below), so both already survive an empty
   * result in either view for free. What is left is the FRAME and the headers,
   * and they are the surface the reader is filtering: swap them out and an empty
   * result re-lays-out the page into a differently-shaped box, which reads as a
   * different screen rather than as this one with nothing in it.
   *
   * The headers stay because the frame stays: they caption a bordered box that
   * holds this node, not a void — and swapping that box for `<Empty>`'s own
   * bordered box would be two borders and a jump.
   */
  const emptyState = (
    <Empty className="border">
      <EmptyHeader>
        {/* An empty CURSOR page means end-of-list, not an empty collection — a
            cursor minted while a next row existed can still land empty if those
            rows are deleted before the reader follows it (the `limit + 1` probe
            rules out the old exact-multiple overshoot, but not a concurrent
            delete). Saying "No assets yet" there would be a lie, and the pager is
            gone, so offer the way back. */}
        <EmptyTitle>
          {query.cursor
            ? 'Tidak ada apa pun di halaman ini'
            : search
              ? `Tidak ada aset yang cocok dengan "${query.q}"`
              : query.status === 'all'
                ? 'Belum ada aset'
                : `Tidak ada aset ${ASSET_STATUS_LABEL[query.status]}`}
        </EmptyTitle>
        <EmptyDescription>
          {query.cursor ? (
            <Link href={listHref}>Kembali ke halaman pertama</Link>
          ) : search ? (
            'Coba kata kunci lain, atau bersihkan pencarian.'
          ) : query.status === 'all' ? (
            'Buat yang pertama untuk melihatnya di sini.'
          ) : (
            'Coba filter status yang berbeda.'
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )

  return (
    <Page.Root>
      <Page.Header
        title="Aset"
        description="Entitas contoh — hapus grup rute (examples) untuk menghapusnya."
      >
        {/* Styled <Link>, not <Button render={<Link/>}> — see the note in
            data-table.tsx: Base UI's Button would stamp role="button" over the
            anchor's link role. */}
        <Link href={assetNewHref(returnTo)} className={cn(buttonVariants())}>
          <PlusIcon data-icon="inline-start" />
          Aset baru
        </Link>
      </Page.Header>

      <AssetsListToolbar
        query={query}
        footer={{
          count: (
            <p className="text-sm text-muted-foreground">
              {countLabel({ shown: items.length, filtered, total })}
            </p>
          ),
          cursorNav: (
            <DataTableCursorNav
              prevCursor={prevCursor}
              nextCursor={nextCursor}
              buildHref={(cursor) => assetsPageHref(query, cursor)}
            />
          ),
        }}
      >
        {/* OUTSIDE the view branch: the selection is a property of the query, not
          of how rows are drawn, so it must not vanish when the reader switches
          to cards — the same reasoning that keeps the count and the pager out
          here. It carries "Select all", so it never waits for a selection. */}
        <AssetsBulkBar pageIds={pageIds} scope={scope} />

        {/* The view is PRESENTATION — both branches render the same `items`, from
          the same query, in the same order. Nothing here re-reads the URL or
          re-queries, which is what keeps `?view` free to carry the cursor across
          a switch (see `assetsRenderHref`).

          The card grid's sort affordance is `AssetsCardSort` in the toolbar
          (rendered only in this view). The control is DERIVED from
          `ASSET_SORT_FIELDS` × both directions — never a hardcoded
          "Newest / Oldest", which would silently stop covering the set the
          moment a field is added to it. The rows obey
          `?sort` regardless of view, so a reader who sorted, then switched, keeps
          their order. */}
        {/* WHY THIS WRAPPER EXISTS, and it is not layout: it is where focus
          retreats after a destructive row action. A row's Delete button destroys
          itself along with its row, so the dialog's default — restore focus to
          the trigger — has nothing left to restore to and focus falls to
          `<body>`. Driven, not theorised: before this, `document.activeElement`
          after the revalidated list painted was BODY.

          IT IS A SCOPE, NOT THE LANDING SPOT, and that is Base UI's behaviour
          rather than our intent — worth knowing before you "fix" a target that
          looks wrong. `FloatingFocusManager.getFirstTabbableElement` resolves
          what `finalFocus` returns as: use it IF it is tabbable, else its first
          tabbable DESCENDANT, else the element itself. `tabIndex={-1}` is
          focusable but NOT tabbable, so this div hands focus on to the first
          control inside the list rather than taking it. All four paths were
          driven; three land on a named control inside this wrapper — which beats
          the div itself, since a control announces a name and a role and an
          anonymous wrapper announces nothing — and the fourth has nothing
          tabbable left and so lands on the div:

            table, rows      -> the header's tri-state "Pilih semua" select-all
                                checkbox, the first tabbable control in the table
            cards, rows      -> the first card's "Pilih <name>" checkbox
            table, no rows   -> the first sortable header LINK ("Nilai"): with no
                                rows the select-all checkbox disables itself, so
                                focus falls to the next tabbable, and the header
                                row outlives an empty body (see the empty state)
            cards, no rows   -> THIS DIV, the only case with nothing tabbable
                                left inside it

          That last line is why `tabIndex={-1}` is not dead weight: without it
          the fallback element is unfocusable and focus returns to `<body>` — the
          original bug, on the exact path a reader reaches by deleting the last
          card. `outline-none` because there it is a landing spot, not a control;
          a focus ring would claim it is something you can operate.

          OUTSIDE the view ternary, for the same reason the bulk bar is: both
          branches unmount rows, so a target inside either one would exist in one
          view and not the other.

          Not a `DataTable` prop: the card grid has the identical gap and
          `data-table.tsx` would only fix the table branch — one problem, one
          place. */}
        <div id={ASSETS_LIST_ID} tabIndex={-1} className="outline-none">
          {query.view === 'card' ? (
            items.length === 0 ? (
              emptyState
            ) : (
              // A <ul>, not a <div> of cards: this is a list, and saying so is what
              // makes a screen reader announce how many items are in it.
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <li key={item.id}>
                    {/* The card carries EVERY column the table shows — name, code,
                    status, value, created, actions — and reads the same maps,
                    label constants, and formatter to show them (WCAG 1.4.10: data
                    that only exists in one view is data someone cannot reach). The
                    schema's `description` is absent from both, so nothing is lost;
                    the two differ in markup only. */}
                    <Card size="sm" className="h-full">
                      <CardHeader>
                        <CardTitle>{item.name}</CardTitle>
                        {/* Neither the code nor the date has a column header to name
                        it here, so both travel in the description: the code in the
                        same monospace muted style the table column uses (a reader
                        scans codes by their digits), and the date behind
                        `ASSET_FIELD_LABEL.createdAt` because a bare date in a card could be
                        created, updated, or due. */}
                        <CardDescription>
                          {ASSET_FIELD_LABEL.code}{' '}
                          <span className="font-mono">{item.code}</span> ·{' '}
                          {ASSET_FIELD_LABEL.createdAt}{' '}
                          {formatDate(item.createdAt)}
                        </CardDescription>
                        {/* Selection rides in the header with the name it selects;
                        row actions get the footer. */}
                        <CardAction>
                          {/* The SAME island the table's select column renders: an
                          affordance in one view only is one the other view's
                          reader cannot reach, and the bulk bar counts from both.
                          Select-all belongs to neither view — it lives in that
                          shared bar, so the grid needs nothing floating over
                          it. */}
                          <AssetSelectCheckbox
                            id={item.id}
                            name={item.name}
                            scope={scope}
                          />
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-2">
                        <Badge variant={STATUS_VARIANT[item.status]}>
                          {ASSET_STATUS_LABEL[item.status]}
                        </Badge>
                        {/* The table gives value a column header; the card has none,
                        so `ASSET_FIELD_LABEL.value` travels with the amount — the
                        same shared contract the table header reads, and the same `formatRupiah`
                        so `Rp` and the separators cannot drift between surfaces. */}
                        <p className="text-sm">
                          <span className="text-muted-foreground">
                            {ASSET_FIELD_LABEL.value}{' '}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatRupiah(item.value)}
                          </span>
                        </p>
                      </CardContent>
                      {/* Actions go in the FOOTER, not the header's CardAction —
                      `Card` and `CardFooter` already author the separated strip
                      (`has-data-[slot=card-footer]:pb-0`, `border-t bg-muted/50`).
                      `mt-auto` lines footers up across a grid of uneven cards. */}
                      <CardFooter className="mt-auto justify-end">
                        {/* `labelled`: a card has no column header to say what a
                        bare pencil does. The table keeps the icons. */}
                        <AssetRowActions
                          id={item.id}
                          name={item.name}
                          finalFocusId={ASSETS_LIST_ID}
                          returnTo={returnTo}
                          labelled
                        />
                      </CardFooter>
                    </Card>
                  </li>
                ))}
              </ul>
            )
          ) : (
            // The interactive TABLE island. It renders the sort it is HANDED and
            // links to the next one (`assetsViewHref`, cursor dropped) — it never
            // holds the sort, the filter, the counts, or the paging; the server
            // owns all of those. TanStack owns PRESENTATION only (column
            // right-pinned actions and the tri-state header). Same
            // `emptyState` node as the card branch — empty is a property of the
            // query, drawn to fit whichever view asks.
            <AssetsTable
              data={items}
              sort={query.sort}
              query={query}
              scope={scope}
              pageIds={pageIds}
              listId={ASSETS_LIST_ID}
              returnTo={returnTo}
              empty={emptyState}
            />
          )}
        </div>
      </AssetsListToolbar>
    </Page.Root>
  )
}
