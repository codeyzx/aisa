'use client'

/**
 * The /assets TABLE view as an interactive CLIENT ISLAND over
 * `@tanstack/react-table` (pinned at 8.21.3 — v9 renames `useReactTable` →
 * `useTable`). It is the "reach for TanStack" trigger firing exactly as
 * docs/reference/contracts/ui.md describes: interactive column/row STATE landed
 * (a right-pinned sticky actions column, a tri-state select-all header), so the
 * library earns its place — and does ONLY that.
 *
 * ═══ SERVER-AUTHORITATIVE vs TANSTACK-PRESENTATION ═══
 *
 * The RSC page stays authoritative for every FACT about the data; TanStack owns
 * only how the handed rows are DRAWN. Drawn precisely so the line cannot blur:
 *
 * - Sort — the SERVER sorts. A sortable header is a `<Link>` to the next `?sort`
 *   (`assetsViewHref`, which drops the cursor), and the `<th aria-sort>` reflects
 *   the sort it was HANDED — exactly `data-table.tsx`, through its shared
 *   sort-link fragment and `ariaSort`. NOT `getSortedRowModel`; it works with JS
 *   off.
 * - Filter / search / paging / counts / page size — URL + RSC own them. This
 *   island never re-queries and mounts no `getFiltered/PaginationRowModel`. (Its
 *   offset pager could not express a `Page<T>` cursor anyway.)
 * - Selection — the zustand store (assets-selection.tsx) owns the picked ids and
 *   their scope + cap; the header checkbox only READS it. NOT `getRowSelection`.
 * - What TanStack DOES own: `columnPinning` (static: actions on the right). CORE
 *   row model only.
 *
 * Because this module IS 'use client', its cell functions run in the browser and
 * may render the client islands straight (AssetSelectCheckbox, AssetRowActions) —
 * the RSC boundary that kept `data-table.tsx` server-side is simply not here, and
 * that is the whole cost of the trigger: this one view becomes an island while
 * the page and its card branch stay server-rendered.
 *
 * IMPORT DISCIPLINE — nothing `server-only`. The `Asset` TYPE is schema-only,
 * `formatRupiah` / `formatDate` are pure, `assetsViewHref` is `nuqs/server`
 * (isomorphic). `scope` and `pageIds` arrive as props, already built server-side,
 * so this island never touches `asset.repo` / `asset.search`.
 */
import { type ReactNode, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnPinningState,
  type RowData,
} from '@tanstack/react-table'

import { cn } from '@/lib/utils'
import { formatRupiah } from '@/lib/format/currency'
import { formatDate } from '@/lib/format/date'
import { Badge } from '@/components/ui/badge'
import {
  ariaSort,
  DataTableCaption,
  DataTableEmptyRow,
  DataTableSortLink,
} from '@/components/ui/data-table'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ASSET_STATUS_LABEL,
  type Asset,
  type AssetSort,
  type AssetSortField,
} from '@/features/asset/asset.schema'
import { ASSET_FIELD_LABEL } from '@/features/asset/asset.display'

import { STATUS_VARIANT } from './asset-display'
import { AssetRowActions } from './asset-row-actions'
import {
  AssetSelectCheckbox,
  AssetsSelectPageCheckbox,
} from './assets-selection'
import { assetsViewHref, type AssetsQuery } from '../search-params'

/**
 * Per-column presentation flags, read at the header/cell render sites. TanStack
 * ships `ColumnMeta` empty for apps to fill; this fills it, scoped to the one
 * island that uses the library. `sortField` DECLARING a field is what makes a
 * header a sort link — the same opt-in rule `data-table.tsx` enforces, so a
 * label column silently becoming clickable stays impossible.
 */
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** `'end'` right-aligns the header + cell and uses tabular figures. */
    align?: 'end'
    /** The server sort field; its presence turns the header into a sort link. */
    sortField?: AssetSortField
  }
}

/**
 * The right-pinned actions column's LEFT edge: a soft shadow so the opaque,
 * `sticky` cell reads as floating over the cells scrolled under it, rather than
 * as a plain column. The opacity it depends on comes from `bg-background` on the
 * HEADER cell and from `bg-inherit` on each BODY cell (which takes the row's own
 * default / hover / selected colour — see TableRow).
 */
const RIGHT_SHADOW = 'shadow-[-8px_0_12px_-12px_rgb(0_0_0/0.35)]'

/**
 * The table's accessible name, through the SAME mechanism `DataTable` uses — a
 * visually hidden `<caption>`, rendered by the shared `DataTableCaption`. The
 * argument for that strategy lives with the component; what is worth noting here
 * is why the STRING is a module constant rather than a prop.
 *
 * `/assets/page.tsx` composes the empty state, the counts and the hrefs and hands
 * them down, so a `caption` prop would fit the file's habits. It is not one
 * because a caption names the ENTITY this island exists to draw, and this island
 * draws exactly one — assets. A prop would let two call sites name the same table
 * two ways, which is the drift the shared strategy is meant to close. It lists
 * its columns because the surface has a filter and a search over it: a reader
 * arriving here by rotor gets the shape of the list, not just its title.
 */
const ASSETS_TABLE_CAPTION =
  'Daftar aset — kode, nama, nilai, status, dan tanggal dibuat'

/**
 * The column definitions, built OUTSIDE the component so the `header` / `cell`
 * render callbacks are not lexically nested in a React component (they are
 * TanStack render props, not components). Closes over only the values a cell
 * needs — `scope`, `pageIds`, `listId`, `returnTo` — and `useMemo` at the call
 * site keeps the array reference stable across selection changes.
 *
 * SORTABILITY lives in `meta.sortField`, but the sort LINK is rendered at the
 * `<th>` site (which has `query` + `sort`), not here — so `header` for a sortable
 * column is just its label STRING.
 */
function buildColumns(
  scope: string,
  pageIds: string[],
  listId: string,
  returnTo: string,
): ColumnDef<Asset>[] {
  return [
    {
      id: 'select',
      // The SAME header island page.tsx used, now tri-state (checked / dash /
      // unchecked) — it reads the store, this island never touches it.
      header: () => (
        <AssetsSelectPageCheckbox pageIds={pageIds} scope={scope} />
      ),
      cell: ({ row }) => (
        <AssetSelectCheckbox
          id={row.original.id}
          name={row.original.name}
          scope={scope}
        />
      ),
    },
    {
      id: 'code',
      header: ASSET_FIELD_LABEL.code,
      // Monospace + muted — a reader scans a column of codes by digit.
      // NOT sortable: a code identifies a row, it does not rank one.
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.original.code}
        </span>
      ),
    },
    {
      id: 'name',
      // The name is the row's identity. It is NOT sortable (search serves "find
      // this one").
      header: ASSET_FIELD_LABEL.name,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      id: 'value',
      header: ASSET_FIELD_LABEL.value,
      // SORTABLE + end-aligned. `formatRupiah` pins `id-ID`, so `Rp` and the
      // separators match the card and the export.
      meta: { align: 'end', sortField: 'value' },
      cell: ({ row }) => formatRupiah(row.original.value),
    },
    {
      id: 'status',
      header: ASSET_FIELD_LABEL.status,
      // NOT sortable — an enum groups, it does not rank, and the
      // toolbar filter isolates a status for free.
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {ASSET_STATUS_LABEL[row.original.status]}
        </Badge>
      ),
    },
    {
      id: 'createdAt',
      header: ASSET_FIELD_LABEL.createdAt,
      // SORTABLE + end-aligned. Already a real Date (the converter hydrates it);
      // `formatDate` pins the locale AND the zone, so the day is a property of
      // the data, not of where it rendered.
      meta: { align: 'end', sortField: 'createdAt' },
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      // RIGHT-PINNED (columnPinning below). A reader must always reach Edit / PDF
      // / Delete, even mid horizontal-scroll.
      meta: { align: 'end' },
      header: () => <span className="sr-only">Tindakan</span>,
      cell: ({ row }) => (
        <AssetRowActions
          id={row.original.id}
          name={row.original.name}
          finalFocusId={listId}
          returnTo={returnTo}
        />
      ),
    },
  ]
}

interface AssetsTableProps {
  /** One page of rows, already queried, filtered, sorted and windowed server-side. */
  data: Asset[]
  /** The sort the rows are ALREADY in — drives the header arrow + `aria-sort`. */
  sort: AssetSort
  /** The whole URL query, so a header can build the next `?sort` href. */
  query: AssetsQuery
  /** The result-set identity a selection is stamped with (built server-side). */
  scope: string
  /** The ids on screen — the reach of the tri-state select-all header. */
  pageIds: string[]
  /** The focus-retreat wrapper id a destructive row action retreats into. */
  listId: string
  /** The current list URL, carried into each row's Edit link as `?returnTo`. */
  returnTo: string
  /** The server-composed empty node — shown in the body when `data` is empty. */
  empty: ReactNode
}

/**
 * The interactive table. The page passes serializable props only (`Asset` has a
 * `Date` `createdAt`, which Next serializes across the RSC→client boundary; the
 * `empty` node is pre-rendered server JSX, likewise serializable).
 */
export function AssetsTable({
  data,
  sort,
  query,
  scope,
  pageIds,
  listId,
  returnTo,
  empty,
}: AssetsTableProps) {
  // STATIC — actions always float right. Controlled with no change handler, so
  // it is fixed for the life of the island.
  const [columnPinning] = useState<ColumnPinningState>({ right: ['actions'] })

  // Built by a MODULE-LEVEL factory, not inline: the columns close over only
  // `scope` / `pageIds` / `listId` / `returnTo` (all stable across a selection
  // change), so a `useMemo` keeps the reference steady — TanStack's stable-columns
  // guidance — and the render callbacks live outside this component's body.
  const columns = useMemo(
    () => buildColumns(scope, pageIds, listId, returnTo),
    [scope, pageIds, listId, returnTo],
  )

  const table = useReactTable({
    data,
    columns,
    // CORE ONLY. No sorted / filtered / pagination row model — the server owns
    // all three; adding them would be TanStack redoing work Firestore already
    // did, and its offset pager cannot express a cursor `Page<T>` at all.
    getCoreRowModel: getCoreRowModel(),
    // Stable row identity = the asset id, so a re-sort or a delete keeps React
    // keys honest.
    getRowId: (row) => row.id,
    state: { columnPinning },
  })

  return (
    <div className="space-y-3">
      {/* HORIZONTAL scroll only, like `data-table.tsx` — no height cap. The row
          count is already bounded by cursor pagination (ASSET_PAGE_SIZES tops
          out at 100), so an inner vertical scroller would only add a second
          scrollbar racing the page's. `right-0` pins actions; there is no
          sticky header, because CSS cannot pair `overflow-x: auto` with
          `overflow-y: visible` (y computes to `auto`), and a viewport-sticky
          header inside a horizontal scroller is therefore unreachable.

          A raw <table>, not the `Table` primitive whose own wrapper would nest a
          second scroller. Page-scroll containment comes from `min-w-0` UPSTREAM
          (components/shell/app-shell.tsx), not from this wrapper. */}
      <div className="relative overflow-x-auto rounded-lg border">
        <table data-slot="data-table" className="w-full caption-bottom text-sm">
          {/* FIRST child of <table> — HTML requires it there and drops a
              `<caption>` that is not, silently. */}
          <DataTableCaption>{ASSETS_TABLE_CAPTION}</DataTableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const column = header.column
                  const meta = column.columnDef.meta
                  const sortField = meta?.sortField
                  const active =
                    sortField !== undefined && sort.field === sortField
                  const pinnedRight = column.getIsPinned() === 'right'
                  // select + actions shrink to their controls; data columns take
                  // the slack.
                  const shrink =
                    column.id === 'select' || column.id === 'actions'

                  return (
                    <TableHead
                      key={header.id}
                      // Only a SORTABLE header carries `aria-sort`; on a plain
                      // header it would promise an affordance that is not there.
                      aria-sort={
                        sortField !== undefined
                          ? ariaSort(active, sort.direction)
                          : undefined
                      }
                      className={cn(
                        // Opaque, so the cells scrolled horizontally under the
                        // pinned corner do not show through it.
                        'border-b bg-background',
                        // z-10 only has to beat this row's own unpinned header
                        // cells as they slide under it — same layer as the
                        // pinned body cell, which never overlaps this row.
                        pinnedRight && cn('sticky right-0 z-10', RIGHT_SHADOW),
                        meta?.align === 'end' && 'text-right',
                        shrink && 'w-0',
                      )}
                    >
                      {header.isPlaceholder ? null : sortField !== undefined ? (
                        // A styled <Link>, like `data-table.tsx`: the header
                        // NAVIGATES (server re-queries), so it stays a link and
                        // works no-JS. The URL owns the sort; this is only its
                        // affordance.
                        <DataTableSortLink
                          field={sortField}
                          active={sort}
                          buildHref={(nextSort) =>
                            assetsViewHref(query, { sort: nextSort })
                          }
                        >
                          {flexRender(
                            column.columnDef.header,
                            header.getContext(),
                          )}
                        </DataTableSortLink>
                      ) : (
                        flexRender(column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              // Zero rows swaps the BODY, never the whole table — the frame and
              // the headers are the surface the reader is filtering. The caller's
              // node draws its own chrome; strip it here so it is not a box in a
              // box. `hover:bg-transparent` because there is no row to act on.
              <DataTableEmptyRow colSpan={table.getVisibleFlatColumns().length}>
                {empty}
              </DataTableEmptyRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta
                    const pinnedRight = cell.column.getIsPinned() === 'right'
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          meta?.align === 'end' && 'text-right tabular-nums',
                          // Opaque + sticky so actions float over scrolled cells;
                          // z-10 keeps it above its row-mates.
                          // `bg-inherit`, NOT `bg-background`: the row owns the
                          // hover and selected colors, so an opaque cell colour of
                          // its own would paint over them and leave this column
                          // white on a selected row. Inheriting tracks every row
                          // state without restating one of them here.
                          pinnedRight &&
                            cn('sticky right-0 z-10 bg-inherit', RIGHT_SHADOW),
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
