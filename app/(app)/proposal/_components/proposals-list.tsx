'use client'

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  InboxIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useQueryStates } from 'nuqs'
import { useId, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CATEGORY_ACTION,
  CATEGORY_LABEL,
  OUTSIDE_FOCUS_LABEL,
  sectorLabel,
  STATUS_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  CATEGORIES,
  PROPOSAL_STATUSES,
  type Category,
  type Thresholds,
} from '@/features/aisa/aisa.schema'
import { compareByGrade } from '@/features/aisa/aisa.ranking'
import { formatNumber, formatScore } from '@/lib/format/number'
import { formatRupiah } from '@/lib/format/currency'
import { cn } from '@/lib/utils'

import {
  DECISION_LABEL,
  DecisionBadge,
  GradeBadge,
  OutsideFocusBadge,
  ScoreBar,
  scoreTone,
  StatusBadge,
} from '../../_components/badges'
import { UploadDeckButton } from '../../_components/upload-deck-button'
import {
  naturalDescending,
  proposalListParams,
  TANGGAPAN_FILTERS,
  type ProposalListParams,
  type SortKey,
} from '../search-params'
import { BulkRespond } from './bulk-respond'
import { initials, selectAllLabel, shortDate } from './proposal-format'
import { type ProposalRow } from './proposal-row'
import { SelectionBar } from './selection-bar'

const PAGE_SIZE = 12

type Tanggapan = (typeof TANGGAPAN_FILTERS)[number] | null

const TABS: { value: Tanggapan; label: string }[] = [
  { value: null, label: 'Semua' },
  { value: 'belum', label: 'Belum ditanggapi' },
  { value: 'sudah', label: 'Sudah ditanggapi' },
  { value: 'setuju', label: DECISION_LABEL.setuju },
  { value: 'tolak', label: DECISION_LABEL.tolak },
]

const TOP_GRADES_LABEL = 'Sangat layak + Layak bersyarat'
const CATEGORY_OPTIONS: Record<string, string> = {
  semua: 'Semua grade',
  ...CATEGORY_LABEL,
  atas: TOP_GRADES_LABEL,
}
const FOCUS_OPTIONS: Record<string, string> = {
  semua: 'Semua fokus',
  '0': 'Sesuai fokus',
  '1': OUTSIDE_FOCUS_LABEL,
}
const STATUS_OPTIONS: Record<string, string> = {
  semua: 'Semua status',
  ...STATUS_LABEL,
}

const matchesTanggapan = (row: ProposalRow, filter: Tanggapan) =>
  filter === null ||
  (filter === 'belum'
    ? !row.responded
    : filter === 'sudah'
      ? row.responded
      : row.response === filter)

function matchesFilters(row: ProposalRow, f: ProposalListParams) {
  const needle = f.q?.trim().toLowerCase()
  return (
    (!f.kategori ||
      (f.kategori === 'atas'
        ? row.category === 'sangat_layak' || row.category === 'layak_bersyarat'
        : row.category === f.kategori)) &&
    // "Sesuai fokus" is a fit check that passed: a proposal with no fit yet
    // (queued, or flagged for a manual check) is in neither focus filter.
    (!f.luarFokus ||
      (f.luarFokus === '1' ? row.outsideFocus : row.fit?.passed === true)) &&
    (!f.status || row.status === f.status) &&
    (!f.sektor ||
      (row.sector !== null &&
        sectorLabel(row.sector) === sectorLabel(f.sektor))) &&
    (!needle ||
      [row.name, row.founderName, row.oneLiner, row.sector].some((text) =>
        text?.toLowerCase().includes(needle),
      ))
  )
}

// The list's rows in the shape the shared ranking reads; it reads only the
// grade, the fit and the score, so a row carries all it needs.
const ranked = (row: ProposalRow) =>
  ({
    effectiveCategory: row.category,
    fit: row.fit,
    assessment: row.score === null ? null : { score: row.score },
  }) as Parameters<typeof compareByGrade>[0]

// Rows without the sorted value (no grade or score yet, no funding ask) stay at
// the bottom in either direction: "unknown" is not the lowest score.
function compareRows(a: ProposalRow, b: ProposalRow, key: SortKey) {
  // Ascending is "worse first": the lower grade, then out of focus, then the
  // lower score — so the natural (descending) order puts the best first.
  if (key === 'grade') return compareByGrade(ranked(b), ranked(a))
  if (key === 'nama') return a.name.localeCompare(b.name, 'id')
  if (key === 'masuk') return a.createdAt.getTime() - b.createdAt.getTime()
  const field = key === 'skor' ? 'score' : 'fundingAskIdr'
  return (a[field] ?? 0) - (b[field] ?? 0)
}

function sortRows(rows: ProposalRow[], key: SortKey, desc: boolean) {
  const field =
    key === 'skor'
      ? 'score'
      : key === 'dana'
        ? 'fundingAskIdr'
        : key === 'grade'
          ? 'category'
          : null
  return rows.toSorted((a, b) => {
    if (field) {
      if (a[field] === null && b[field] !== null) return 1
      if (b[field] === null && a[field] !== null) return -1
    }
    return (desc ? -1 : 1) * compareRows(a, b, key)
  })
}

function SortHeader({
  label,
  column,
  active,
  desc,
  onSort,
  align = 'left',
}: {
  label: string
  column: SortKey
  active: boolean
  desc: boolean
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const Icon = !active ? ChevronsUpDownIcon : desc ? ArrowDownIcon : ArrowUpIcon
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Urutkan menurut ${label}`}
      className={cn(
        '-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground',
        active && 'text-foreground',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <Icon className={cn('size-3.5', !active && 'opacity-50')} />
    </button>
  )
}

const capitalized = 'inline-block first-letter:uppercase'

// A cell keeps its text plain for the CSV: no thousands dots in a number, an
// ISO day for the date, and a quote around anything with a comma or newline.
const csvDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
function downloadCsv(filename: string, rows: unknown[][]) {
  const csv =
    String.fromCharCode(0xfeff) +
    rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  )
  const anchor = Object.assign(document.createElement('a'), {
    href: url,
    download: `${filename}.csv`,
  })
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ProposalsList({
  rows: all,
  thresholds,
  canRespond,
  windowLimit,
}: {
  rows: ProposalRow[]
  thresholds: Thresholds | null
  canRespond: boolean
  /** Set when the list hit the repo's window, so older proposals are not loaded. */
  windowLimit: number | null
}) {
  const [filters, setFilters] = useQueryStates(proposalListParams)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectAllId = useId()

  const sortKey = filters.urut ?? 'grade'
  const desc = filters.arah
    ? filters.arah === 'turun'
    : naturalDescending(sortKey)

  // Sectors are compared and listed by their display label, so "f&b" and
  // "F&B" from two decks are one option, named as the table names it.
  const sectors = useMemo(
    () =>
      [
        ...new Set(
          all.flatMap((row) => (row.sector ? [sectorLabel(row.sector)] : [])),
        ),
      ].toSorted((a, b) => a.localeCompare(b, 'id')),
    [all],
  )

  // A sector in the URL that no loaded proposal has is still a real filter
  // (with nothing in it), so it stays selectable and named on the trigger.
  const sectorValue = filters.sektor ? sectorLabel(filters.sektor) : 'semua'
  const sectorItems = useMemo(() => {
    const items: Record<string, string> = { semua: 'Semua sektor' }
    for (const sector of sectors) items[sector] = sector
    if (sectorValue !== 'semua') items[sectorValue] = sectorValue
    return items
  }, [sectors, sectorValue])

  // Every filter except the tab: the tab counts are counted over this.
  const base = useMemo(
    () => all.filter((row) => matchesFilters(row, filters)),
    [all, filters],
  )
  const rows = useMemo(
    () =>
      sortRows(
        base.filter((row) => matchesTanggapan(row, filters.tanggapan)),
        sortKey,
        desc,
      ),
    [base, filters.tanggapan, sortKey, desc],
  )

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(Math.max(0, (filters.hal ?? 1) - 1), pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const selectedRows = rows.filter((row) => selected.has(row.id))
  const pageSelected = visible.filter((row) => selected.has(row.id)).length
  const filtered = Boolean(
    filters.kategori ||
    filters.luarFokus ||
    filters.sektor ||
    filters.status ||
    filters.q?.trim(),
  )

  // The API answers a whole grade, so the box is offered only when the grade is
  // the one narrowing filter: with a sector, status, search or the focus filter
  // on top, its count and its action would reach proposals the table hides.
  const bulkCategory: Category | null =
    filters.kategori &&
    filters.kategori !== 'atas' &&
    !filters.luarFokus &&
    !filters.sektor &&
    !filters.status &&
    !filters.q?.trim()
      ? filters.kategori
      : null
  const bulkCount = bulkCategory
    ? all.filter((row) => !row.responded && row.category === bulkCategory)
        .length
    : 0

  function setCategory(value: string | null) {
    if (value === null) return
    void setFilters({
      kategori:
        value === 'semua' ? null : (value as ProposalListParams['kategori']),
      hal: null,
    })
  }

  function setFocus(value: string | null) {
    if (value === null) return
    void setFilters({
      luarFokus:
        value === 'semua' ? null : (value as ProposalListParams['luarFokus']),
      hal: null,
    })
  }

  function onSort(key: SortKey) {
    const nextDesc = key === sortKey ? !desc : naturalDescending(key)
    void setFilters({
      urut: key === 'grade' ? null : key,
      arah:
        nextDesc === naturalDescending(key)
          ? null
          : nextDesc
            ? 'turun'
            : 'naik',
      hal: null,
    })
  }

  const toggle = (id: string) =>
    setSelected((value) => {
      const next = new Set(value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const togglePage = () =>
    setSelected((value) => {
      const next = new Set(value)
      const allOn = pageSelected === visible.length
      for (const row of visible) {
        if (allOn) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })

  // Founder name and email are personal data (UU PDP): the export carries the
  // startup and its assessment only, never who submitted it.
  function exportCsv() {
    const target = selectedRows.length ? selectedRows : rows
    downloadCsv('proposal-aisa', [
      [
        'Startup',
        'Sektor',
        'Tahap',
        'Skor',
        'Grade',
        'Aksi',
        'Di luar fokus',
        'Status',
        'Tanggapan',
        'Dana dicari',
        'Masuk',
      ],
      ...target.map((row) => [
        row.name,
        row.sector ? sectorLabel(row.sector) : '',
        row.stage ?? '',
        row.score ?? '',
        row.category ? CATEGORY_LABEL[row.category] : '',
        row.category ? CATEGORY_ACTION[row.category] : '',
        row.fit ? (row.outsideFocus ? 'Ya' : 'Tidak') : '',
        STATUS_LABEL[row.status],
        DECISION_LABEL[row.response ?? 'baru'],
        row.fundingAskIdr ?? '',
        csvDay.format(row.createdAt),
      ]),
    ])
  }

  function clearFilters() {
    void setFilters({
      kategori: null,
      luarFokus: null,
      sektor: null,
      status: null,
      q: null,
      hal: null,
    })
  }

  if (all.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center"
        data-tour="proposal-empty"
      >
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <InboxIcon className="size-5" />
        </span>
        <p className="mt-4 font-medium">Belum ada proposal</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Proposal yang masuk dari Google Form akan muncul di sini.
        </p>
        {canRespond ? (
          <div className="mt-4">
            <UploadDeckButton />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="-mx-1 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b px-1"
        role="tablist"
        aria-label="Tanggapan"
      >
        {TABS.map((tab) => {
          const count = base.filter((row) =>
            matchesTanggapan(row, tab.value),
          ).length
          const active = filters.tanggapan === tab.value
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() =>
                void setFilters({ tanggapan: tab.value, hal: null })
              }
              className={cn(
                'relative -mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          className="a-search min-w-52 flex-1 sm:max-w-80"
          style={{ order: 0 }}
        >
          <SearchIcon className="a-ic" />
          <input
            type="search"
            value={filters.q ?? ''}
            onChange={(event) =>
              void setFilters({ q: event.target.value || null, hal: null })
            }
            placeholder="Cari startup, founder, sektor…"
            aria-label="Cari proposal"
          />
          {filters.q ? (
            <button
              type="button"
              className="a-search-clear"
              aria-label="Hapus pencarian"
              onClick={() => void setFilters({ q: null, hal: null })}
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </label>
        <Select
          items={CATEGORY_OPTIONS}
          value={filters.kategori ?? 'semua'}
          onValueChange={setCategory}
        >
          <SelectTrigger
            className="h-9 w-full bg-card sm:w-56"
            aria-label="Grade"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua grade</SelectItem>
            {CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {CATEGORY_LABEL[value]}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value="atas">{TOP_GRADES_LABEL}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          items={FOCUS_OPTIONS}
          value={filters.luarFokus ?? 'semua'}
          onValueChange={setFocus}
        >
          <SelectTrigger
            className="h-9 w-full bg-card sm:w-40"
            aria-label="Fokus investasi"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FOCUS_OPTIONS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={sectorItems}
          value={sectorValue}
          onValueChange={(value) =>
            value !== null &&
            void setFilters({
              sektor: value === 'semua' ? null : value,
              hal: null,
            })
          }
        >
          <SelectTrigger
            className="h-9 w-full bg-card sm:w-40"
            aria-label="Sektor"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua sektor</SelectItem>
            {Object.keys(sectorItems)
              .slice(1)
              .map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          items={STATUS_OPTIONS}
          value={filters.status ?? 'semua'}
          onValueChange={(value) =>
            value !== null &&
            void setFilters({
              status:
                value === 'semua'
                  ? null
                  : (value as ProposalListParams['status']),
              hal: null,
            })
          }
        >
          <SelectTrigger
            className="h-9 w-full bg-card sm:w-44"
            aria-label="Status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua status</SelectItem>
            {PROPOSAL_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon />
            Reset filter
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" className="h-9" onClick={exportCsv}>
            <DownloadIcon />
            {selectedRows.length
              ? `Ekspor ${selectedRows.length}`
              : 'Ekspor CSV'}
          </Button>
          {canRespond ? <UploadDeckButton className="h-9" /> : null}
        </div>
      </div>

      {canRespond && bulkCategory && bulkCount > 0 ? (
        <BulkRespond
          category={bulkCategory}
          categoryLabel={CATEGORY_LABEL[bulkCategory]}
          count={bulkCount}
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13.5px]">
            <caption className="sr-only">
              Daftar proposal — startup, sektor, grade, status, dana dicari,
              tanggal masuk, skor. Urutan bawaan: grade terbaik dulu, lalu yang
              sesuai fokus, lalu skor tertinggi.
            </caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="w-12 py-2.5 pr-0 pl-4">
                  <Checkbox
                    checked={
                      visible.length > 0 && pageSelected === visible.length
                    }
                    indeterminate={
                      pageSelected > 0 && pageSelected < visible.length
                    }
                    onCheckedChange={togglePage}
                    aria-labelledby={visible.length ? selectAllId : undefined}
                    aria-label={visible.length ? undefined : 'Pilih semua'}
                    disabled={visible.length === 0}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Startup"
                    column="nama"
                    active={sortKey === 'nama'}
                    desc={desc}
                    onSort={onSort}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Sektor</th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Grade"
                    column="grade"
                    active={sortKey === 'grade'}
                    desc={desc}
                    onSort={onSort}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <SortHeader
                    label="Dana dicari"
                    column="dana"
                    active={sortKey === 'dana'}
                    desc={desc}
                    onSort={onSort}
                    align="right"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Masuk"
                    column="masuk"
                    active={sortKey === 'masuk'}
                    desc={desc}
                    onSort={onSort}
                  />
                </th>
                <th className="w-52 py-2.5 pr-4 pl-3 font-medium">
                  <SortHeader
                    label="Skor"
                    column="skor"
                    active={sortKey === 'skor'}
                    desc={desc}
                    onSort={onSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <p className="font-medium">Tidak ada proposal yang cocok</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Coba ubah kata kunci atau filter.
                    </p>
                    {filtered ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={clearFilters}
                      >
                        Reset filter
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              {visible.map((row, index) => {
                const checked = selected.has(row.id)
                const href = `/proposal/${encodeURIComponent(row.id)}`
                return (
                  <tr
                    key={row.id}
                    data-state={checked ? 'selected' : undefined}
                    data-tour={index === 0 ? 'proposal-first' : undefined}
                    className="group relative cursor-pointer border-b transition-colors outline-none last:border-0 focus-within:bg-muted/50 hover:bg-muted/50 data-[state=selected]:bg-primary/5"
                  >
                    <td className="relative z-10 py-3 pr-0 pl-4">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(row.id)}
                        aria-label={`Pilih ${row.name}`}
                      />
                    </td>
                    {/* The cell's label is the link's text, nested deeper than
                        the rule looks. */}
                    {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                    <td className="max-w-80 px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                          {initials(row.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={href}
                            className="block truncate font-semibold transition-colors outline-none group-hover:text-primary after:absolute after:inset-0 focus-visible:underline"
                          >
                            {row.name}
                          </Link>
                          {row.founderName || row.oneLiner ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {[row.founderName, row.oneLiner]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.sector ? (
                        <p>{sectorLabel(row.sector)}</p>
                      ) : (
                        <p className="text-muted-foreground">—</p>
                      )}
                      {row.stage ? (
                        <p
                          className={cn(
                            capitalized,
                            'block text-xs text-muted-foreground',
                          )}
                        >
                          {row.stage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        {row.category ? (
                          <>
                            <GradeBadge category={row.category} />
                            <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                              {CATEGORY_ACTION[row.category]}
                            </span>
                            {row.corrected ? (
                              <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                                dikoreksi
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <StatusBadge status={row.status} />
                        )}
                        {row.outsideFocus ? (
                          <OutsideFocusBadge
                            fit={row.fit}
                            className="relative z-10"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <DecisionBadge decision={row.response} />
                    </td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                      {row.fundingAskIdr !== null ? (
                        formatRupiah(row.fundingAskIdr)
                      ) : (
                        <span className="font-normal text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {shortDate(row.createdAt)}
                    </td>
                    <td className="py-3 pr-4 pl-3">
                      {row.score !== null ? (
                        <div className="flex items-center gap-3">
                          <ScoreBar
                            score={row.score}
                            thresholds={thresholds}
                            className="h-2 flex-1"
                          />
                          <span
                            className={cn(
                              'min-w-8 text-right text-sm font-semibold tabular-nums',
                              scoreTone(row.score, thresholds).text,
                            )}
                          >
                            {formatScore(row.score)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-muted" />
                          <span className="w-8 text-right text-sm text-muted-foreground">
                            —
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-1.5">
            <span>
              {rows.length
                ? `Menampilkan ${current * PAGE_SIZE + 1}–${Math.min(rows.length, (current + 1) * PAGE_SIZE)} dari ${formatNumber(rows.length)} proposal`
                : '0 proposal'}
              {windowLimit
                ? ` · hanya ${formatNumber(windowLimit)} proposal terbaru yang dimuat`
                : ''}
            </span>
            {/* The header checkbox's name: the scope it reaches, visibly. */}
            {visible.length ? (
              <>
                <span aria-hidden>·</span>
                <span id={selectAllId}>{selectAllLabel(visible.length)}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 tabular-nums">
              Halaman {current + 1} dari {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Halaman sebelumnya"
              disabled={current === 0}
              onClick={() =>
                void setFilters({ hal: current === 1 ? null : current })
              }
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Halaman berikutnya"
              disabled={current >= pageCount - 1}
              onClick={() => void setFilters({ hal: current + 2 })}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>

      {selectedRows.length > 0 ? (
        <SelectionBar
          rows={selectedRows}
          canRespond={canRespond}
          onDone={(ids) =>
            setSelected((value) => {
              const next = new Set(value)
              for (const id of ids) next.delete(id)
              return next
            })
          }
          onClear={() => setSelected(new Set())}
        />
      ) : null}
    </div>
  )
}
