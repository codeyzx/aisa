// TEMPLATE — copy-me starter for a new entity's LIST surface. See
// `_template.schema.ts` for the token legend. Copy to
// `app/(app)/<entities>/page.tsx`, beside the `new/` and `[id]/edit/` copies of
// the two sibling route templates.
//
// The `./__entity__.*` imports are relative here so the copy compiles beside its
// generated siblings; once this file sits under `app/` none of them resolve —
// repoint every one at `@/features/<entity>/…`.
//
// SCOPE: the standard baseline (docs/explanation/reusability-model.md) — a
// capability gate, a status filter, cursor paging in both directions, a count,
// and a server-rendered table. NOT here, on purpose, because each is a per-entity
// argument with its own bill: search, a sortable header, a page-size control, a
// table/card toggle, bulk selection, export, and a delete row action (that one
// also needs a client island for its confirm dialog). `features/asset/**` plus
// `app/(app)/(examples)/assets/**` is the version that carries all of them.
//
// This page is a SERVER COMPONENT and nothing here needs to change that: the
// filter is a link, the pager is a link, and the table is `components/ui/data-table`,
// which deliberately ships without 'use client'. Reach for an island only when a
// control needs interactive state — see docs/reference/contracts/ui.md.
//
// Every reader-facing string below is placeholder copy. Rewrite it in your
// entity's own words (the rest of this app speaks Indonesian).
//
// EXCLUDED from typecheck by the `_template.*` name.

import { type ComponentProps } from 'react'
import { type Metadata } from 'next'
import Link from 'next/link'
import { PlusIcon } from 'lucide-react'

import { requireCapability } from '@/lib/auth/guards'
import { formatDate } from '@/lib/format/date'
import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  countLabel,
  DataTable,
  DataTableCursorNav,
  type DataTableColumn,
} from '@/components/ui/data-table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

import { __ENTITY___READ } from './__entity__.capability'
import { __entities__Collection } from './__entity__.collection'
import { list__Entities__ } from './__entity__.repo'
import {
  __ENTITY___STATUS_LABEL,
  type __Entity__,
  type __Entity__Status,
} from './__entity__.schema'
import {
  __ENTITY___STATUS_FILTER_VALUES,
  __entities__CurrentHref,
  __entities__PageHref,
  __entities__QueryHref,
  __entity__EditHref,
  __entity__NewHref,
  load__Entity__ListSearchParams,
  to__Entity__StatusFilter,
  type __Entity__StatusFilterValue,
} from './__entity__.search-params'

export const metadata: Metadata = {
  title: '__Entities__',
}

/**
 * Rows per page — a CONSTANT, because the baseline has no page-size control.
 *
 * If you add one, it belongs in the URL contract as a CLOSED literal set, never
 * `parseAsInteger`: this number reaches Firestore's `limit`, so it is the count
 * of documents you are billed for and an arbitrary integer is an arbitrary bill.
 * `app/(app)/(examples)/assets/search-params.ts` is that version.
 */
const PAGE_SIZE = 25

/**
 * The filter's words, DERIVED from the entity's own label map plus the one value
 * the entity does not have — "not filtered". Spelling the members again here
 * would be a second taxonomy that goes stale the first time you add a status.
 *
 * The `Record<…, string>` annotation is what makes a new filter value a COMPILE
 * error until it has a word, so a raw enum member can never reach the screen.
 */
const STATUS_FILTER_LABEL: Record<__Entity__StatusFilterValue, string> = {
  all: 'Semua status',
  ...__ENTITY___STATUS_LABEL,
}

/**
 * How the list PAINTS each status. Closed over the enum for the same reason the
 * labels are: a `status === 'active' ? … : …` ternary quietly hands every future
 * member the else-arm, while this stops the build until the list says how to
 * draw it.
 *
 * A variant is a SURFACE's choice, so it lives with the surface rather than in
 * the schema beside the words — another list of the same entity may badge it
 * differently and is allowed to.
 */
const STATUS_VARIANT: Record<
  __Entity__Status,
  ComponentProps<typeof Badge>['variant']
> = {
  active: 'secondary',
  retired: 'outline',
}

/**
 * How many __entities__ match `status` — all of them when it is omitted.
 * Server-side `count()`: only the number crosses the wire, never the documents.
 *
 * It lives at the CALL SITE rather than in the repo, because the repo is a thin
 * typed accessor: only `cache()`d reads, pagination and transactions earn a slot
 * there, and a one-off query goes direct off `__entities__Collection()`. A
 * pass-through wrapper per query is how a typed accessor becomes a CRUD facade.
 *
 * That leaves the status equality spelled TWICE — here, and inside
 * `list__Entities__`. It holds while the filter is one `==`, and it is the first
 * thing to break when the filter grows: a count built from a different `where`
 * than the rows is a denominator that silently stops describing them. At that
 * point export the query builder from the repo and share it between the list and
 * the count — `assetsQuery` in `features/asset/asset.repo.ts` is that shape.
 *
 * NOTE THE ABSENT `orderBy`, and do not tidy one on. A count has no order, and
 * asking for one is not free: `.where(status).orderBy(createdAt)` needs a
 * COMPOSITE index — a deploy artifact — while this shape rides Firestore's
 * automatic single-field index.
 *
 * `count()` is BILLED. Call it when a reader will see the number, and never
 * twice to learn one fact — with no filter active, the total IS the filtered
 * count.
 */
async function count__Entities__(status?: __Entity__Status): Promise<number> {
  const base = __entities__Collection()
  const query = status ? base.where('status', '==', status) : base
  const snap = await query.count().get()
  return snap.data().count
}

interface __Entities__PageProps {
  // Next 16: `searchParams` is a Promise. nuqs's loader takes it directly and
  // hands back typed values — `__entity__.search-params.ts` owns every key, every
  // fallback, and every href on this page.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function __Entities__Page({
  searchParams,
}: __Entities__PageProps) {
  // THE GATE COMES FIRST, before any read. `requireCapability` redirects rather
  // than returning, so an anonymous or unauthorized visitor never reaches the
  // query below — the repo uses the Admin SDK, which bypasses Firestore rules,
  // so this guard is the only lock on this data.
  //
  // The capability comes from `__entity__.capability.ts`, which will not compile
  // until you declare it in `lib/auth/rbac.ts` — see that file.
  await requireCapability(__ENTITY___READ)

  const query = load__Entity__ListSearchParams(await searchParams)
  // The filter's `'all'` translated into the repo's `undefined`, through the ONE
  // function that owns that conversion. Pass `'all'` through and you build
  // `.where('status','==','all')` — a query that matches nothing, renders an
  // empty list, and raises no error to explain it.
  const status = to__Entity__StatusFilter(query.status)
  // The way back to the top of this filtered list — same filter, no cursor.
  const listHref = __entities__QueryHref(query, {})
  // The EXACT list URL the reader is on, cursor included. Threaded into every
  // link that opens the create/edit form as `?returnTo`, so a save or a Cancel
  // lands back on the page they left rather than the default list. Both form
  // routes re-validate it (`safeInternalPath`) before trusting it.
  const returnTo = __entities__CurrentHref(query)

  // Started together, so the reads overlap instead of queueing (the Next docs'
  // parallel data-fetching idiom — a request starts when it is called, not when
  // it is awaited).
  const [{ items, nextCursor, prevCursor }, filtered, unfilteredTotal] =
    await Promise.all([
      list__Entities__({ limit: PAGE_SIZE, cursor: query.cursor, status }),
      count__Entities__(status),
      // The pre-filter total, for the "(disaring dari N)" clause `countLabel`
      // adds. Pay this SECOND billed aggregation only when the filter is
      // actually narrowing something; unfiltered, it would buy a number we
      // already hold.
      status === undefined ? undefined : count__Entities__(),
    ])
  const total = unfilteredTotal ?? filtered

  const columns: DataTableColumn<__Entity__>[] = [
    { id: 'name', header: 'Nama', cell: (item) => item.name },
    {
      id: 'status',
      header: 'Status',
      cell: (item) => (
        <Badge variant={STATUS_VARIANT[item.status]}>
          {__ENTITY___STATUS_LABEL[item.status]}
        </Badge>
      ),
    },
    {
      id: 'createdAt',
      header: 'Dibuat',
      // `'end'` right-aligns and switches on tabular figures — dates and numbers
      // read down a column that way.
      align: 'end',
      cell: (item) => formatDate(item.createdAt),
    },
    {
      id: 'actions',
      // The column has a name for a screen reader and none on screen: the
      // controls under it say what they do, and a visible "Aksi" header would
      // only repeat them.
      header: <span className="sr-only">Aksi</span>,
      align: 'end',
      cell: (item) => (
        // A styled <Link>, NOT <Button render={<Link/>}>: Base UI's Button
        // stamps role="button" onto anything it renders that is NOT a native
        // button, which is exactly the `render` case — and that role overrides
        // the anchor's link role. This navigates, so it must stay a link.
        <Link
          href={__entity__EditHref(item.id, returnTo)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          Ubah
        </Link>
      ),
    },
  ]

  return (
    <Page.Root>
      <Page.Header
        title="__Entities__"
        description="Daftar __entities__ — ganti judul dan deskripsi ini dengan milik entitas Anda."
      >
        <Link
          href={__entity__NewHref(returnTo)}
          className={cn(buttonVariants())}
        >
          <PlusIcon data-icon="inline-start" />
          __Entity__ baru
        </Link>
      </Page.Header>

      {/* THE FILTER IS A ROW OF LINKS, which is why this page needs no client
          bundle to filter and why a filtered list is a shareable URL. Each href
          comes from `__entities__QueryHref`, whose argument type cannot name a
          cursor — so "page 3 of a different filter", a URL that would resume
          past rows the new filter does not contain, is unspellable by clicking.

          A link row fits a handful of values. When the filter set outgrows it,
          the next step is a GET form around a native `<select>` — see
          `app/(app)/admin/audit/_components/audit-history.tsx`, which submits
          without a cursor field and so drops the cursor the same way. A
          `ChoiceSelect` is a client island; a filter that cannot submit until
          the bundle hydrates is a filter the reader loses on a slow first
          paint. */}
      <nav aria-label="Filter status" className="flex flex-wrap gap-2">
        {__ENTITY___STATUS_FILTER_VALUES.map((value) => {
          const active = query.status === value
          return (
            <Link
              key={value}
              href={__entities__QueryHref(query, { status: value })}
              // What the reader is looking at, announced rather than only
              // painted — a filled button and an outlined one are the same
              // control to a screen reader.
              aria-current={active ? true : undefined}
              className={cn(
                buttonVariants({
                  variant: active ? 'default' : 'outline',
                  size: 'sm',
                }),
              )}
            >
              {STATUS_FILTER_LABEL[value]}
            </Link>
          )
        })}
      </nav>

      <DataTable
        data={items}
        columns={columns}
        // The table's ACCESSIBLE NAME — a visually hidden `<caption>`, required
        // by `DataTable` so a table cannot ship unnamed. Answer "what is this a
        // list of", naming the columns; do not restate the page title.
        caption="Daftar __entities__ — nama, status, dan tanggal dibuat"
        rowKey={(item) => item.id}
        empty={
          <Empty className="border">
            <EmptyHeader>
              {/* THREE DIFFERENT FACTS, never one "Belum ada data". An empty
                  CURSOR page is end-of-list, not an empty collection: a cursor
                  minted while a next row existed still lands empty if that row
                  is deleted before the reader follows the link. Saying "none
                  yet" there would be a lie, and the pager is gone with the
                  rows — so offer the way back instead. */}
              <EmptyTitle>
                {query.cursor
                  ? 'Tidak ada apa pun di halaman ini'
                  : status === undefined
                    ? 'Belum ada __entity__'
                    : `Tidak ada __entity__ ${__ENTITY___STATUS_LABEL[status]}`}
              </EmptyTitle>
              <EmptyDescription>
                {query.cursor ? (
                  <Link href={listHref}>Kembali ke halaman pertama</Link>
                ) : status === undefined ? (
                  'Buat yang pertama untuk melihatnya di sini.'
                ) : (
                  'Coba filter status yang berbeda.'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      {/* The count and the pager sit OUTSIDE the table, so an empty result keeps
          both: "Menampilkan 0 dari 0 (disaring dari 120)" is what tells a reader
          the filter is why the screen is blank. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {/* `shown` is the rows in hand, not `PAGE_SIZE` — the last page holds
              fewer. */}
          {countLabel({ shown: items.length, filtered, total })}
        </p>
        {/* Both directions from ONE param: each token carries its own nav
            direction, so Previous and Next swap the same `?cursor`. A control
            renders only when its cursor exists, so the pager never offers a link
            to nowhere. */}
        <DataTableCursorNav
          prevCursor={prevCursor}
          nextCursor={nextCursor}
          buildHref={(cursor) => __entities__PageHref(query, cursor)}
        />
      </div>
    </Page.Root>
  )
}
