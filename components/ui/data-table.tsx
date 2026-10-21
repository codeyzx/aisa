/**
 * Typed, server-renderable data table over the `table` primitives.
 *
 * NOTE: deliberately NO 'use client'. `DataTableColumn.cell` is a function, so
 * columns can never cross the RSC boundary — keeping this module server-side is
 * what lets a list page define its columns inline and stay a Server Component
 * with zero hydration cost. Adding 'use client' here would force every consumer
 * to become a client island.
 *
 * It owns layout only: no sorting, filtering, or pagination STATE. Those are
 * server-side in this boilerplate (the repo orders + filters; the cursor drives
 * paging), so there is no client table state to model. A sortable header is
 * therefore a `<Link>` and an `aria-sort`, not a `useState` — the table renders
 * the sort it is HANDED and links to the next one; the server decides what that
 * means. That is what keeps a sortable list page a Server Component, and what
 * makes sorting work with JS disabled. See docs/reference/contracts/ui.md for
 * the trigger to reach for @tanstack/react-table.
 */
import { type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
} from 'lucide-react'

import { formatNumber } from '@/lib/format/number'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** Which field a list is ordered by, and which way. */
interface DataTableSort<Field extends string = string> {
  field: Field
  direction: 'asc' | 'desc'
}

/**
 * Wires the headers to whatever owns the sort — here, the URL.
 *
 * ONE optional prop rather than two, because the halves are useless apart:
 * `active` without `href` paints an arrow nobody can click, `href` without
 * `active` cannot say which way the rows already run. As a single object, "half
 * wired" does not typecheck.
 */
interface DataTableSorting<Field extends string = string> {
  /** The sort the rows are ALREADY in — drives the arrow and `aria-sort`. */
  active: DataTableSort<Field>
  /** Where a header click goes. The caller owns what that URL means. */
  href: (sort: DataTableSort<Field>) => string
}

interface DataTableColumn<Row, Field extends string = string> {
  /** Stable identity for the column; also the React key for its header + cells. */
  id: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  /** `'end'` right-aligns and uses tabular figures — for dates and numbers. */
  align?: 'start' | 'end'
  headerClassName?: string
  cellClassName?: string
  /**
   * The field this column sorts by, server-side. DECLARING IT IS WHAT MAKES THE
   * COLUMN SORTABLE — there is no implicit sortability, ever.
   *
   * Opt-in, and explicit, for two reasons. The standard: only a column that
   * answers "which is the most X" earns it, so a label column silently becoming
   * clickable is a bug, not a bonus. And the bill: every sortable field costs a
   * composite index per filter it can combine with, so sortability is a
   * cost this column is choosing to spend, not a default it drifts into.
   *
   * `Field` is inferred from the columns array, so the page can pin it to its
   * entity's sortable set (`DataTableColumn<Asset, AssetSortField>[]`) and a typo
   * fails the build instead of rendering a header that sorts by nothing.
   */
  sortField?: Field
}

interface DataTableProps<Row, Field extends string = string> {
  data: Row[]
  columns: DataTableColumn<Row, Field>[]
  /**
   * What this table lists, in the reader's words — the table's ACCESSIBLE NAME.
   * Rendered as a visually hidden `<caption>`; see `DataTableCaption` for why
   * that mechanism and why this prop is required rather than optional.
   *
   * Write it as the answer to "what is this a list of", not as a repeat of the
   * page title: `Daftar akun — email, nama, peran, …` tells a screen-reader user
   * scanning the tables on a page which one they landed in. A `string`, not a
   * node, because a name is text — the accessible-name computation flattens
   * markup anyway, so allowing JSX here would only invite chrome nobody hears.
   */
  caption: string
  /** Stable row identity. Prefer the entity id over the array index. */
  rowKey: (row: Row) => string
  /**
   * Rendered INSIDE the body, as one full-width cell, when `data` is empty. The
   * frame and the column headers stay; only the rows swap. Only the caller knows
   * whether empty means "nothing created yet" or "nothing matches the filter",
   * so the copy is never guessed here — compose `<Empty>` and pass it in.
   * Without it, an empty table renders its headers over an empty body.
   *
   * The node's own panel chrome (border, radius) is stripped here — inside the
   * table's frame it would read as a box in a box. Pass the same node to a card
   * view and it keeps its chrome, because there it IS the surface.
   */
  empty?: ReactNode
  /** Omit for a table whose columns declare no `sortField`. */
  sort?: DataTableSorting<Field>
  className?: string
}

interface DataTableSortLinkProps<Field extends string> {
  /** The field this link asks the server-owned sort to order by. */
  field: Field
  /** The sort the handed rows are already in. */
  active: DataTableSort<Field>
  /** Builds the navigation URL; the caller owns its query contract. */
  buildHref: (sort: DataTableSort<Field>) => string
  children: ReactNode
}

/**
 * The sort a click on `field` asks for. Pure, and exported for its own test —
 * it is a two-line rule with a direction flip in it, which is exactly the shape
 * of thing that reads correct and is backwards.
 *
 * Clicking the ACTIVE column flips it. Clicking any other starts at `'desc'`,
 * and that default is not a coin toss: the standard only admits columns that
 * answer "which is the most X", so "most first" is the answer being asked for
 * every time. Newest dates, biggest amounts. It is a universal default here
 * precisely BECAUSE label columns are not sortable — no per-column knob needed.
 */
function nextSort<Field extends string>(
  field: Field,
  active: DataTableSort<Field>,
): DataTableSort<Field> {
  if (active.field !== field) return { field, direction: 'desc' }
  return { field, direction: active.direction === 'desc' ? 'asc' : 'desc' }
}

/**
 * The `aria-sort` for a SORTABLE header. Pure, and exported for its own test.
 *
 * Note what it does not have: a value for "not sortable". `aria-sort="none"`
 * means "this column can be sorted and currently is not" — announcing it on a
 * label column promises an affordance that is not there, so a non-sortable
 * header must carry no `aria-sort` at all. Hence `undefined` at the call site
 * rather than a fourth case in here.
 */
function ariaSort(
  active: boolean,
  direction: DataTableSort['direction'],
): 'ascending' | 'descending' | 'none' {
  if (!active) return 'none'
  return direction === 'asc' ? 'ascending' : 'descending'
}

/**
 * The sortable-header affordance shared by server and interactive tables.
 * It navigates rather than manages sorting state, so both callers retain their
 * own table implementation while using the same URL-safe link invariant.
 */
function DataTableSortLink<Field extends string>({
  field,
  active,
  buildHref,
  children,
}: DataTableSortLinkProps<Field>) {
  const isActive = active.field === field

  return (
    <Link
      href={buildHref(nextSort(field, active))}
      data-slot="data-table-sort"
      className={cn(
        'inline-flex items-center gap-1 rounded-sm outline-none',
        'hover:text-muted-foreground',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >
      {children}
      {/* Decorative: `aria-sort` on the <th> already states the column's sort
          to a screen reader, so a label here would say it twice. */}
      {!isActive ? (
        <ChevronsUpDownIcon
          aria-hidden
          className="size-3.5 text-muted-foreground/60"
        />
      ) : active.direction === 'asc' ? (
        <ArrowUpIcon aria-hidden className="size-3.5" />
      ) : (
        <ArrowDownIcon aria-hidden className="size-3.5" />
      )}
    </Link>
  )
}

/**
 * THE ACCESSIBLE NAME OF A DATA TABLE — one strategy, owned here, used by every
 * table in the app. It is a VISUALLY HIDDEN NATIVE `<caption>`, and it is
 * REQUIRED (see `DataTableProps.caption`), not optional.
 *
 * Why a `<caption>` and not the two obvious alternatives:
 *
 * - NOT `aria-labelledby` pointing at the page's `<h1>`. It reads as free — the
 *   heading is already on screen and already says "Aset" — but it needs an `id`
 *   on an element this module does not own. `Page.Header`
 *   (components/shell/page-container.tsx) renders that `<h1>` with no id, so
 *   every call site would have to mint one, keep it unique, and keep the two
 *   halves in sync across a refactor; a table rendered on a page with two lists,
 *   or inside a card, would point at a heading that names the PAGE rather than
 *   this table. A dangling `aria-labelledby` also fails SILENTLY — the name goes
 *   empty and nothing in typecheck, lint or the browser complains.
 * - NOT `aria-label` on the `<table>`. It works, but it is an ARIA override of a
 *   native mechanism the element already has, which is the first rule of ARIA
 *   backwards. `<caption>` is what a table's name IS in HTML; it survives with
 *   CSS off, it is what a table-of-tables rotor reads, and it needs no id
 *   contract with anything above it.
 *
 * Why REQUIRED rather than optional: an optional name is a name that drifts off.
 * `rowKey` is required for the same reason — the prop that cannot be guessed
 * correctly is the prop the type system has to ask for. A new table is named at
 * the moment it is written or it does not compile.
 *
 * Why VISUALLY HIDDEN: every surface that renders one of these already carries a
 * visible `<h1>` naming the same list, so a visible caption would say it twice.
 * `sr-only` keeps the programmatic name without adding a second visible title.
 * If a table ever needs a visible caption (two tables on one page, say), the
 * honest change is a variant here — never a hand-written `<caption>` at the call
 * site, which is how the two spellings start.
 *
 * Exported because `assets-table.tsx` renders a raw `<table>` (its `Table`
 * wrapper would nest a second horizontal scroller) and must produce the SAME
 * name the same way. One strategy, two renderers, one component.
 */
function DataTableCaption({ children }: { children: ReactNode }) {
  return <TableCaption className="sr-only">{children}</TableCaption>
}

interface DataTableEmptyRowProps {
  colSpan: number
  children: ReactNode
}

/** The empty body row shared by table implementations with different row models. */
function DataTableEmptyRow({ colSpan, children }: DataTableEmptyRowProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        // The caller's node is usually an `<Empty>`, which draws its own
        // dashed, rounded panel — correct in a card view, where it IS the
        // surface, and a box inside a box here. Strip it and let the table's
        // frame be the only border. `p-0` hands spacing to the node's own
        // padding rather than adding a second source of it.
        className="p-0 [&>*]:rounded-none [&>*]:border-0"
      >
        {children}
      </TableCell>
    </TableRow>
  )
}

function DataTable<Row, Field extends string = string>({
  data,
  columns,
  caption,
  rowKey,
  empty,
  sort,
  className,
}: DataTableProps<Row, Field>) {
  return (
    // The frame is the TABLE's, not the page's, and it lives here so every page
    // renders through one definition and they read identically by construction.
    // The alternative — each table hand-rolling this same div — drifts into
    // different spellings of it. A boilerplate exists to be copied, so a frame
    // every copy must remember to draw is a frame that will differ per copy.
    //
    // `overflow-hidden` is load-bearing, not decoration: it clips the table's
    // square corners to the radius. Without it the rows punch through the
    // rounding.
    <div className="overflow-hidden rounded-lg border">
      <Table className={className} data-slot="data-table">
        {/* FIRST child of <table>, which is not a style choice: HTML requires
            `<caption>` to be the first element child, and a caption that is not
            is dropped by the parser — the name would vanish with no error. */}
        <DataTableCaption>{caption}</DataTableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const sortField = column.sortField
              // Sortable means BOTH: the column opted in, and the caller wired the
              // sort. A column that declares `sortField` into a table with no
              // `sort` prop stays a plain header rather than rendering a dead link.
              const sortable = sort !== undefined && sortField !== undefined
              const active = sortable && sort.active.field === sortField

              return (
                <TableHead
                  key={column.id}
                  aria-sort={
                    sortable
                      ? ariaSort(active, sort.active.direction)
                      : undefined
                  }
                  className={cn(
                    column.align === 'end' && 'text-right',
                    column.headerClassName,
                  )}
                >
                  {sortable ? (
                    // A styled <Link>, for the same reason the pager below is one:
                    // this navigates, so it must stay a link. It also means sorting
                    // survives with JS off — the header is an href, and the server
                    // re-queries.
                    <DataTableSortLink
                      field={sortField}
                      active={sort.active}
                      buildHref={sort.href}
                    >
                      {column.header}
                    </DataTableSortLink>
                  ) : (
                    column.header
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && empty ? (
            // Zero rows swaps the BODY, never the whole table. The
            // frame and the headers are the surface the reader is filtering; if
            // they vanish, an empty result re-lays-out the page and reads as a
            // different screen rather than the same one with nothing in it. What
            // makes the swap honest is that the copy is the CALLER's — only the
            // page can tell "no items yet" from "nothing matches this filter".
            //
            // `hover:bg-transparent` because the row highlight advertises a row
            // to act on, and there is none.
            <DataTableEmptyRow colSpan={columns.length}>
              {empty}
            </DataTableEmptyRow>
          ) : (
            data.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      column.align === 'end' && 'text-right tabular-nums',
                      column.cellClassName,
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

interface DataTableCursorNavProps {
  /** `null` on the first page — the Previous control then renders nothing. */
  prevCursor?: string | null
  /** `null` on the last page — the Next control then renders nothing. */
  nextCursor: string | null
  /** Builds a page's href from its cursor; keeps this part route-agnostic. */
  buildHref: (cursor: string) => string
  className?: string
  /** Overrides the Previous / Next labels. */
  prevText?: string
  nextText?: string
}

/**
 * Bidirectional cursor pager for `Page<T>` (lib/data/pagination.contract.ts).
 *
 * Deliberately does NOT use `components/ui/pagination` — that primitive models
 * PAGE-NUMBER pagination (first/last/active, ellipsis windows), and an opaque
 * cursor has no total and no random access, so there are no page numbers to
 * build. It is a different model, not a narrowing of that one.
 *
 * Previous and Next are BOTH cursor links: the token `Page<T>` mints for each
 * carries its own nav direction (`startAfter` for next, `endBefore` +
 * `limitToLast` for prev), so a single `buildHref` swaps only the `?cursor` and
 * the same URL contract drives both. A control renders only when its cursor
 * exists — no Previous on the first page, no Next on the last — so the pager
 * never offers a link to nowhere. The browser Back button still works too: every
 * page's cursor lives in the URL.
 */
function DataTableCursorNav({
  prevCursor,
  nextCursor,
  buildHref,
  className,
  prevText = 'Sebelumnya',
  nextText = 'Berikutnya',
}: DataTableCursorNavProps) {
  if (!prevCursor && !nextCursor) return null

  return (
    <nav
      aria-label="Navigasi halaman"
      data-slot="data-table-cursor-nav"
      className={cn('flex items-center justify-end gap-2', className)}
    >
      {/* Styled <Link>s, NOT <Button render={<Link/>}>. Base UI's Button stamps
          role="button" + tabindex onto whatever it renders, which overrides the
          anchor's native link role — a screen reader would announce this
          navigation as a button and it would vanish from the links rotor.
          `buttonVariants` exists for exactly this case. */}
      {prevCursor ? (
        <Link
          href={buildHref(prevCursor)}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          {prevText}
        </Link>
      ) : null}
      {nextCursor ? (
        <Link
          href={buildHref(nextCursor)}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          {nextText}
          <ChevronRightIcon data-icon="inline-end" />
        </Link>
      ) : null}
    </nav>
  )
}

interface CountLabelArgs {
  /** Rows on the page in hand — `items.length`, not the page limit. */
  shown: number
  /** Rows matching the active filter. The denominator. */
  filtered: number
  /** Rows before any filter. Pass `filtered` when no filter is active. */
  total: number
}

/**
 * The table's status line: `Menampilkan 20 dari 87 (disaring dari 120)`.
 *
 * Pure and exported for its own sake — this is the off-by-one/windowing logic a
 * unit test catches and a review does not, and it cannot be tested through the
 * page (an RSC that awaits Firestore). See data-table.test.ts.
 *
 * WHY THERE IS NO `21–40` RANGE. A `countLabel(from, to, filtered, total)` can
 * print one when the whole collection is loaded and paged in memory, so
 * `from`/`to` are array indices — free and exact. Here paging is an OPAQUE CURSOR
 * (`{ sortValue, docId }`, lib/data/pagination.contract.ts): you know you hold 20 rows,
 * nothing says they are rows 21–40. There is no page ordinal anywhere.
 *
 * A range is nonetheless COMPUTABLE, and it is worth being precise about why it
 * is absent, because "impossible" would be false:
 *   `from = count(query.orderBy(...).endBefore(cursor)) + 2`
 * Aggregations honour cursors — verified against the emulator (a 25-row seed,
 * page 2: `count(endBefore(cursor))` = 19 → from = 21, matching a full ordered
 * scan). That number is also HONEST, unlike a page ordinal carried in the URL
 * beside the cursor: it is re-derived from the cursor on every render, so a row
 * inserted or deleted upstream moves it correctly instead of silently drifting
 * from a second source of truth.
 *
 * It is omitted because it was not asked for and is not free: it is a THIRD
 * billed aggregation on every render. It costs no INDEX, though — unlike the
 * counts below it must carry the `orderBy` that `endBefore` needs, but the index
 * that implies, `(status ASC, createdAt DESC)`, is the one `listAssets` already
 * requires and `firestore.indexes.json` already declares. So the price is one
 * aggregation, not a deploy artifact. The ask was "X of X"; `Menampilkan 20
 * dari 87` answers it completely and states nothing it does not know. If the
 * range is
 * ever wanted, the recipe above is the whole change — take it deliberately.
 */
function countLabel({ shown, filtered, total }: CountLabelArgs): string {
  const label = `Menampilkan ${formatNumber(shown)} dari ${formatNumber(filtered)}`
  // Strictly `>`: an equal total means no filter is narrowing anything, and
  // "(filtered from 87)" beside "of 87" is noise that reads like a bug.
  //
  // Deliberately NOT special-cased on `shown === 0`. Zero rows under a filter is
  // exactly when the denominator matters most — "Menampilkan 0 dari 0 (disaring
  // dari 120)" tells the reader their filter is the reason the table is empty,
  // which a bare "No rows" hides.
  return total > filtered
    ? `${label} (disaring dari ${formatNumber(total)})`
    : label
}

export {
  DataTable,
  DataTableCaption,
  DataTableCursorNav,
  DataTableEmptyRow,
  DataTableSortLink,
  ariaSort,
  countLabel,
  nextSort,
  type DataTableColumn,
  type DataTableSort,
}
