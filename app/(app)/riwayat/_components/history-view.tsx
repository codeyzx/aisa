'use client'

import { DownloadIcon, SearchIcon, SearchXIcon, XIcon } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VIA_LABEL } from '@/features/aisa/aisa.labels'
import { TIME_ZONE } from '@/lib/format/locale'
import { formatNumber, formatPercent } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { downloadCsv } from './csv'
import { ACTOR_LABEL, type ActorType, type RiwayatEvent } from './events'
import { Actor, HistoryRow, type Thresholds } from './history-row'
import {
  CHANNEL_FILTER_LABEL,
  type ChannelFilter,
  dayKey,
  dayLabel,
  type EventStat,
  eventStats,
  eventTone,
  inPeriod,
  KIND_LABEL,
  KIND_TABS,
  type KindFilter,
  type Period,
  PERIOD_LABEL,
} from './metrics'

const PAGE_SIZE = 40

interface Filters {
  kind: KindFilter
  text: string
  period: Period
  channel: ChannelFilter
}
const INITIAL: Filters = {
  kind: 'semua',
  text: '',
  period: 'semua',
  channel: 'semua',
}

const STAT_LABEL: Record<EventStat['kind'], string> = {
  keputusan: 'Keputusan dibuat',
  penilaian: 'Dinilai AI',
  whatsapp: 'Ringkasan terkirim',
  koreksi: 'Koreksi grade',
}

const matchesText = (event: RiwayatEvent, q: string) =>
  !q ||
  [event.proposal?.name, ACTOR_LABEL[event.actor], event.detail, event.reason]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(q))

function StatTile({
  stat,
  active,
  onSelect,
}: {
  stat: EventStat
  active: boolean
  onSelect: () => void
}) {
  const { icon: Icon, tone } = eventTone({
    kind: stat.kind,
    decision: 'setuju',
  })
  const max = Math.max(1, ...stat.daily.map((d) => d.count))
  const diff = stat.value - stat.previous
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      style={{ '--tone': tone } as CSSProperties}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active && 'border-[var(--tone)] ring-1 ring-[var(--tone)]',
      )}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-[color-mix(in_oklch,var(--tone)_13%,var(--card))] text-[var(--tone)]">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="leading-tight">{STAT_LABEL[stat.kind]}</span>
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[26px] leading-none font-semibold tracking-tight tabular-nums">
            {formatNumber(stat.value)}
          </span>
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              diff > 0
                ? 'text-success'
                : diff < 0
                  ? 'text-danger'
                  : 'text-muted-foreground',
            )}
            title={`7 hari sebelumnya: ${stat.previous}`}
          >
            {diff === 0 ? 'sama' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}`}
          </span>
        </span>
        <span
          aria-hidden
          className="hidden h-7 items-end gap-[3px] min-[420px]:flex"
        >
          {stat.daily.map(({ day, count }, i) => (
            <span
              key={day}
              className={cn(
                'w-1.5 rounded-sm',
                count ? 'bg-[var(--tone)]' : 'bg-muted',
              )}
              style={{
                height: `${count ? Math.max(18, (count / max) * 100) : 12}%`,
                opacity: count ? 0.35 + (i / 6) * 0.65 : 1,
              }}
            />
          ))}
        </span>
      </span>
      <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
        {stat.hint}
      </span>
    </button>
  )
}

function Insights({ events }: { events: RiwayatEvent[] }) {
  const actors = (['ai', 'manajer', 'sistem'] as ActorType[])
    .map((actor) => ({
      actor,
      count: events.filter((e) => e.actor === actor).length,
    }))
    .filter((a) => a.count > 0)
    .toSorted((a, b) => b.count - a.count)
  const max = Math.max(1, ...actors.map((a) => a.count))
  const decisions = events.filter((e) => e.kind === 'keputusan' && !e.migrated)
  const viaWhatsapp = decisions.filter((e) => e.via === 'wa').length
  const share = decisions.length ? (viaWhatsapp / decisions.length) * 100 : 0

  return (
    <aside className="hidden flex-col gap-3 xl:flex">
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <h3 className="text-[13px] font-semibold">Siapa yang terlibat</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Dari kejadian yang tampil
        </p>
        <ul className="space-y-2.5">
          {actors.map((item) => (
            <li key={item.actor} className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <Actor actor={item.actor} className="min-w-0 truncate" />
                <span className="font-mono text-muted-foreground tabular-nums">
                  {item.count}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <h3 className="text-[13px] font-semibold">Kanal keputusan</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {decisions.length
            ? `${decisions.length} keputusan dari kejadian yang tampil`
            : 'Belum ada keputusan di filter ini'}
        </p>
        {decisions.length > 0 ? (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-primary/70">
              <div
                className="h-full bg-[var(--agent-2)]"
                style={{ width: `${share}%` }}
              />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-primary/70"
                  />
                  Dashboard
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatPercent(Math.round(100 - share))}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-[var(--agent-2)]"
                  />
                  WhatsApp
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatPercent(Math.round(share))}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
      </div>
    </aside>
  )
}

const csvTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
})

export function HistoryView({
  events,
  now,
  thresholds,
  windowFull,
}: {
  events: RiwayatEvent[]
  /** The server's clock, so day labels and windows match the render. */
  now: number
  thresholds: Thresholds
  /** The page loaded a full window, so older events exist that are not here. */
  windowFull: boolean
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const change = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setLimit(PAGE_SIZE)
  }
  const reset = () => {
    setFilters(INITIAL)
    setLimit(PAGE_SIZE)
  }

  const stats = useMemo(() => eventStats(events, now), [events, now])

  // Every filter except the kind, for the counts on the kind tabs.
  const base = useMemo(() => {
    const q = filters.text.trim().toLowerCase()
    return events.filter(
      (e) =>
        inPeriod(e, filters.period, now) &&
        (filters.channel === 'semua' || e.via === filters.channel) &&
        matchesText(e, q),
    )
  }, [events, filters.channel, filters.period, filters.text, now])

  const counts = useMemo(() => {
    const map = new Map<KindFilter, number>([['semua', base.length]])
    for (const e of base) map.set(e.kind, (map.get(e.kind) ?? 0) + 1)
    return map
  }, [base])

  const rows = useMemo(
    () =>
      filters.kind === 'semua'
        ? base
        : base.filter((e) => e.kind === filters.kind),
    [base, filters.kind],
  )

  const groups = useMemo(() => {
    const map = new Map<string, RiwayatEvent[]>()
    for (const e of rows.slice(0, limit)) {
      const day = dayKey(e.at)
      map.set(day, [...(map.get(day) ?? []), e])
    }
    return [...map]
  }, [limit, rows])

  // The "Lainnya" tab only exists for an action newer than this build, and
  // "Dinilai ulang" only once the grade scale change has re-graded proposals.
  const tabs = KIND_TABS.filter(
    (tab) =>
      (tab.value !== 'lainnya' && tab.value !== 'nilai_ulang') ||
      events.some((e) => e.kind === tab.value),
  )

  const selectStat = (kind: KindFilter) => {
    const active = filters.kind === kind && filters.period === '7'
    change(active ? { kind: 'semua', period: 'semua' } : { kind, period: '7' })
  }

  const exportCsv = () =>
    downloadCsv('riwayat-aisa', [
      ['Waktu', 'Jenis', 'Kejadian', 'Proposal', 'Pelaku', 'Kanal', 'Alasan'],
      ...rows.map((e) => [
        csvTime.format(e.at),
        KIND_LABEL[e.kind],
        e.detail,
        e.proposal?.name ?? '',
        ACTOR_LABEL[e.actor],
        VIA_LABEL[e.via],
        e.reason ?? '',
      ]),
    ])

  const narrowed =
    filters.text.trim() !== '' ||
    filters.period !== 'semua' ||
    filters.channel !== 'semua'
  const onlyKind = filters.kind !== 'semua' && !narrowed

  if (events.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Belum ada riwayat</EmptyTitle>
          <EmptyDescription>
            Penilaian AI, keputusan, dan ringkasan WhatsApp akan tercatat di
            sini.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="history-stats-title" className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="history-stats-title"
            className="shrink-0 text-sm font-semibold"
          >
            7 hari terakhir
          </h2>
          <span className="text-xs text-muted-foreground">
            Dibanding 7 hari sebelumnya
            <span className="hidden sm:inline">
              {' '}
              · klik kartu untuk menyaring
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <StatTile
              key={stat.kind}
              stat={stat}
              active={filters.period === '7' && filters.kind === stat.kind}
              onSelect={() => selectStat(stat.kind)}
            />
          ))}
        </div>
      </section>

      <section aria-label="Daftar kejadian" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div
            className="-mx-1 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b px-1"
            role="tablist"
            aria-label="Jenis kejadian"
          >
            {tabs.map((tab) => {
              const active = filters.kind === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => change({ kind: tab.value })}
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
                    {counts.get(tab.value) ?? 0}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="a-search min-w-52 flex-1 basis-full sm:max-w-80 sm:basis-auto">
              <SearchIcon className="a-ic size-4 shrink-0" />
              <input
                type="search"
                value={filters.text}
                onChange={(event) => change({ text: event.target.value })}
                placeholder="Cari startup atau kejadian…"
                aria-label="Cari riwayat"
              />
              {filters.text ? (
                <button
                  type="button"
                  className="a-search-clear"
                  aria-label="Hapus pencarian"
                  onClick={() => change({ text: '' })}
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : null}
            </label>
            <Select
              items={PERIOD_LABEL}
              value={filters.period}
              onValueChange={(period) => change({ period: period as Period })}
            >
              <SelectTrigger
                className="h-9 min-w-0 flex-1 bg-card sm:w-44 sm:flex-none"
                aria-label="Periode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as Period[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {PERIOD_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={CHANNEL_FILTER_LABEL}
              value={filters.channel}
              onValueChange={(channel) =>
                change({ channel: channel as ChannelFilter })
              }
            >
              <SelectTrigger
                className="h-9 min-w-0 flex-1 bg-card sm:w-40 sm:flex-none"
                aria-label="Kanal"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CHANNEL_FILTER_LABEL) as ChannelFilter[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {CHANNEL_FILTER_LABEL[value]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {narrowed ? (
              <Button variant="ghost" size="sm" onClick={reset}>
                <XIcon />
                Reset filter
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-9 sm:ml-auto"
              onClick={exportCsv}
              disabled={rows.length === 0}
              aria-label="Ekspor CSV"
              title="Ekspor kejadian yang tampil ke CSV"
            >
              <DownloadIcon />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyTitle>
                {onlyKind
                  ? `Belum ada ${KIND_LABEL[filters.kind as keyof typeof KIND_LABEL].toLowerCase()}`
                  : 'Tidak ada kejadian yang cocok'}
              </EmptyTitle>
              <EmptyDescription>
                {onlyKind
                  ? 'Kejadian jenis ini akan tercatat di sini begitu terjadi.'
                  : 'Coba kata kunci lain, perpanjang periode, atau pilih jenis “Semua”.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={reset}>
                {onlyKind ? 'Lihat semua kejadian' : 'Reset filter'}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
                {groups.map(([day, items]) => {
                  const { label, date } = dayLabel(items[0]!.at, now)
                  return (
                    <section
                      key={day}
                      aria-label={label}
                      className="border-b last:border-0"
                    >
                      <header className="flex items-baseline justify-between gap-3 border-b bg-muted/40 px-4 py-2 sm:px-5">
                        <h3 className="text-[13px] font-semibold">
                          {label}
                          {date ? (
                            <span className="ml-2 font-normal text-muted-foreground">
                              {date}
                            </span>
                          ) : null}
                        </h3>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {items.length} kejadian
                        </span>
                      </header>
                      <ol>
                        {items.map((event) => (
                          <HistoryRow
                            key={event.id}
                            event={event}
                            thresholds={thresholds}
                          />
                        ))}
                      </ol>
                    </section>
                  )
                })}
              </div>
              <div className="flex flex-col items-center gap-2 pb-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Menampilkan {formatNumber(Math.min(limit, rows.length))} dari{' '}
                  {formatNumber(rows.length)} kejadian
                  {windowFull
                    ? ` · hanya ${formatNumber(events.length)} kejadian terbaru yang dimuat`
                    : ''}
                </p>
                {limit < rows.length ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLimit((value) => value + PAGE_SIZE)}
                  >
                    Tampilkan {Math.min(PAGE_SIZE, rows.length - limit)} lagi
                  </Button>
                ) : null}
              </div>
            </div>
            <Insights events={rows} />
          </div>
        )}
      </section>
    </div>
  )
}
