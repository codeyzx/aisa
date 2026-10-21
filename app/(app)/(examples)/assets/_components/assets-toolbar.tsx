'use client'

/**
 * The Assets list toolbar — PRESENTATION and COMPOSITION over the shared
 * list-toolbar controller (lib/list-toolbar). Navigation policy lives in
 * assets-toolbar-nav.ts; the scope/value set in assets-toolbar-scope.ts. This
 * file owns only what a reader sees: the labels, the options, the control widths,
 * the card-only sort, and how the pieces sit around the server-rendered list.
 *
 * The provider spans the WHOLE list coordination region — header, the
 * server-rendered list children (passed straight through), and the footer — so
 * every control shares one optimistic model. The footer is a plain slot; the
 * count and the pager stay feature/server-owned inside it.
 *
 * `AssetsListToolbar` replaces the old hand-rolled `UrlSelect` / `UrlViewToggle` /
 * search-timer trio and the `AssetsPageSize` prop-drilled select.
 */

import { useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGridIcon, TableIcon } from 'lucide-react'

import {
  effectiveValue,
  isControlPending,
  ListToolbarControls,
  ListToolbarFooter,
  ListToolbarLeading,
  ListToolbarRoot,
  ListToolbarRow,
} from '@/lib/list-toolbar'
import { ChoiceSelect } from '@/components/ui/choice-select'
import { SearchInput } from '@/components/ui/search-input'
import type { ViewToggleOption } from '@/components/ui/view-toggle'
import {
  ASSET_SORT_FIELDS,
  ASSET_STATUS_LABEL,
  type AssetSort,
  type AssetSortField,
} from '@/features/asset/asset.schema'

import {
  ASSET_PAGE_SIZES,
  ASSETS_VIEWS,
  assetSortParser,
  ASSET_STATUS_FILTER_VALUES,
  type AssetPageSize,
  type AssetsQuery,
  type AssetsStatusFilterValue,
  type AssetsView,
} from '../search-params'
import { createAssetsToolbarAdapter } from './assets-toolbar-nav'
import {
  toAssetsToolbarValues,
  useAssetsToolbar,
  useAssetsToolbarContext,
  useAssetsToolbarSelector,
} from './assets-toolbar-scope'

// ─────────────────────────── labels & options ───────────────────────────
// Each map is `Record<Member, string>` for the same reason the schema's
// ASSET_STATUS_LABEL is: adding a member is a compile error until it is named,
// so a control can never offer a value the URL parser would reject.

const VIEW_LABEL: Record<AssetsView, string> = { table: 'Tabel', card: 'Kartu' }

const STATUS_FILTER_LABEL: Record<AssetsStatusFilterValue, string> = {
  all: 'Semua status',
  ...ASSET_STATUS_LABEL,
}

const PAGE_SIZE_LABEL = Object.fromEntries(
  ASSET_PAGE_SIZES.map((size) => [size, size]),
) as Record<AssetPageSize, string>

const SORT_LABEL: Record<AssetSortField, { asc: string; desc: string }> = {
  createdAt: { desc: 'Terbaru dulu', asc: 'Terlama dulu' },
  value: { desc: 'Nilai tertinggi', asc: 'Nilai terendah' },
}

const SORT_DIRECTIONS = ['desc', 'asc'] as const

const CARD_SORT_OPTIONS = ASSET_SORT_FIELDS.flatMap((field) =>
  SORT_DIRECTIONS.map((direction) => ({
    value: assetSortParser.serialize({ field, direction })[0],
    sort: { field, direction } satisfies AssetSort,
    label: SORT_LABEL[field][direction],
  })),
)

const CARD_SORT_VALUES = CARD_SORT_OPTIONS.map((option) => option.value)

const CARD_SORT_LABELS = Object.fromEntries(
  CARD_SORT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>

const CARD_SORT_BY_VALUE = Object.fromEntries(
  CARD_SORT_OPTIONS.map((option) => [option.value, option.sort]),
) as Record<string, AssetSort>

const VIEW_OPTIONS: ViewToggleOption<AssetsView>[] = ASSETS_VIEWS.map(
  (value) => ({
    value,
    icon: value === 'table' ? <TableIcon /> : <LayoutGridIcon />,
    label: VIEW_LABEL[value],
  }),
)

// ─────────────────────────── presentation ───────────────────────────

/**
 * Debounced search over `code` + `name`. Reads its OWN control slice via the
 * feature selector (reactive value + pending + a min-length hint), and drives the
 * controller's search lifecycle (a keystroke drafts + schedules, Enter flushes,
 * clear cancels + commits). Committing pushes `?q` through the adapter, which
 * drops the cursor; the server returns the unsearched list for a <2-char term, so
 * a 1-char search is a cheap round-trip rather than a suppressed one.
 */
function AssetsSearch() {
  const toolbar = useAssetsToolbarContext()
  const value = useAssetsToolbarSelector((state) => effectiveValue(state, 'q'))
  const pending = useAssetsToolbarSelector((state) =>
    isControlPending(state, 'q'),
  )
  const tooShort = value.trim().length === 1

  return (
    <search className="contents">
      <SearchInput
        id={`${toolbar.id}-q`}
        label="Cari kode atau nama"
        value={value}
        pending={pending}
        placeholder="Cari kode atau nama…"
        hint={tooShort ? 'Min. 2 karakter' : undefined}
        onValueChange={(next) =>
          toolbar.search.change({ name: 'q', value: next })
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            toolbar.search.enter('q')
          }
        }}
        onClear={() => toolbar.search.clear('q')}
        clearLabel="Bersihkan pencarian"
        className="w-[220px]"
      />
    </search>
  )
}

/**
 * The card view's sort affordance — the table sorts through its header row, the
 * card grid has none. Rendered ONLY in card view, decided by a SELECTOR on the
 * optimistic `view` so it appears/vanishes the instant the view switch is clicked,
 * before the server answers. `sort` is a structured `AssetSort`, so it binds
 * through `toolbar.Control`, which serializes it only for the `ChoiceSelect` UI.
 */
function AssetsCardSort() {
  const toolbar = useAssetsToolbarContext()
  const view = useAssetsToolbarSelector((state) =>
    effectiveValue(state, 'view'),
  )
  if (view !== 'card') return null
  return (
    <toolbar.Control name="sort">
      {({ state, handleChange }) => (
        <ChoiceSelect
          aria-label="Urutkan aset"
          value={assetSortParser.serialize(state.value)[0]}
          values={CARD_SORT_VALUES}
          labels={CARD_SORT_LABELS}
          pending={state.pending}
          className="w-[168px]"
          onValueChange={(next) => handleChange(CARD_SORT_BY_VALUE[next])}
        />
      )}
    </toolbar.Control>
  )
}

/**
 * Rows per page — a labelled select in the footer. A visible `<label>` (not an
 * aria-label): a select reading "25" can only name a number, so something beside
 * it has to say what 25 is. Bound through `toolbar.Control` so it can carry an
 * explicit id the label points at.
 */
function AssetsPageSize() {
  const toolbar = useAssetsToolbarContext()
  const id = `${toolbar.id}-pageSize`
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-sm whitespace-nowrap text-muted-foreground"
      >
        Baris
      </label>
      <toolbar.Control name="pageSize">
        {({ state, handleChange }) => (
          <ChoiceSelect
            id={id}
            value={state.value}
            values={ASSET_PAGE_SIZES}
            labels={PAGE_SIZE_LABEL}
            pending={state.pending}
            className="w-[72px]"
            onValueChange={handleChange}
          />
        )}
      </toolbar.Control>
    </div>
  )
}

// ─────────────────────────── composition ───────────────────────────

interface AssetsListToolbarProps {
  /** The server-confirmed query for this render (the URL). */
  query: AssetsQuery
  /** The server-rendered list region (bulk bar + the list wrapper) — untouched. */
  children: ReactNode
  /**
   * The footer chrome, feature/server-owned. Omitted by the search-not-ready
   * shell, which has no results to count or page.
   */
  footer?: { count: ReactNode; cursorNav: ReactNode }
}

/**
 * Wraps the whole list coordination region in the toolbar provider: the control
 * header, the server-rendered list children, and the footer. The adapter is
 * memoized over the router and reads the live cursor through a ref, so a changing
 * `query` never rebuilds it or recreates the controller's store.
 */
export function AssetsListToolbar({
  query,
  children,
  footer,
}: AssetsListToolbarProps) {
  const router = useRouter()
  const queryRef = useRef(query)
  queryRef.current = query
  const adapter = useMemo(
    () => createAssetsToolbarAdapter(router, queryRef),
    [router],
  )
  const toolbar = useAssetsToolbar({
    server: toAssetsToolbarValues(query),
    adapter,
  })

  return (
    <toolbar.Provider>
      <ListToolbarRoot>
        <ListToolbarRow>
          <ListToolbarLeading>
            <AssetsSearch />
          </ListToolbarLeading>
          <ListToolbarControls>
            {/* Card-only; a selector renders it in card view alone. */}
            <AssetsCardSort />
            <toolbar.Select
              name="status"
              values={ASSET_STATUS_FILTER_VALUES}
              labels={STATUS_FILTER_LABEL}
              aria-label="Filter aset berdasarkan status"
              className="w-[160px]"
            />
            <toolbar.View
              name="view"
              options={VIEW_OPTIONS}
              aria-label="Tampilkan aset sebagai"
            />
          </ListToolbarControls>
        </ListToolbarRow>
      </ListToolbarRoot>

      {children}

      {footer ? (
        <ListToolbarFooter>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {footer.count}
            <div className="flex flex-wrap items-center gap-4">
              <AssetsPageSize />
              {footer.cursorNav}
            </div>
          </div>
        </ListToolbarFooter>
      ) : null}
    </toolbar.Provider>
  )
}
