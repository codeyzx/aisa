import {
  ArrowRightIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ChevronRightIcon,
  Clock3Icon,
  FileWarningIcon,
  GemIcon,
  InboxIcon,
  LayersIcon,
  type LucideIcon,
  PauseCircleIcon,
  SparklesIcon,
} from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CATEGORY_LABEL,
  HISTORY_ACTION_LABEL,
  labelOf,
  QUALITY_OUTSIDE_FOCUS_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  CATEGORIES,
  type Category,
  type DailyStats,
  awaitsDecision,
  type Digest,
  DELETED_PROPOSAL_NAME,
  type History,
  type Proposal,
  RESPONSE_KINDS,
  type Rules,
  showsQualityOutsideFocus,
} from '@/features/aisa/aisa.schema'
import { formatDate, formatTime } from '@/lib/format/date'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { formatDecimal, formatNumber, formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import {
  CategoryBadge,
  DECISION_LABEL,
  ScoreBar,
  scoreTone,
} from '../../_components/badges'
import { UploadDeckButton } from '../../_components/upload-deck-button'
import { dayLabel } from '../../_components/daily-window'
import { ProposalTrendChart } from './proposal-trend-chart'
import { Timeline } from './timeline'
import { TREND_WEEKS, weeklyTrend } from './weekly-trend'

const COLOR: Record<Category, string> = {
  sangat_cocok: 'var(--category-1)',
  cocok: 'var(--category-2)',
  kurang_cocok: 'var(--category-3)',
  tidak_cocok: 'var(--category-4)',
}

/** The categories "Disarankan untuk Anda" and "Paling cocok" draw from. */
const RECOMMENDED: ReadonlySet<Category> = new Set(['sangat_cocok', 'cocok'])

const TOP_COUNT = 5

const shortDay = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
})

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')

const score = (p: Proposal) => p.assessment?.score ?? 0

export interface DashboardOverviewProps {
  unresponded: Proposal[]
  responded: Proposal[]
  digest: Digest | null
  /** Proposals created after `digest.sentAt`; `null` without a digest. */
  newSinceDigest: number | null
  insightDigest: Digest | null
  paused: boolean
  thresholds: Rules['thresholds'] | null
  stats: DailyStats[]
  history: History[]
  canUpload: boolean
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  hint,
  primary = false,
}: {
  href: string
  icon: LucideIcon
  label: string
  value: number
  hint: string
  primary?: boolean
}) {
  return (
    <Link href={href} className="group block">
      <Card
        className={cn(
          'gap-0 py-0 transition-colors',
          primary
            ? 'border-primary bg-primary text-primary-foreground shadow-sm group-hover:bg-primary/90'
            : 'group-hover:border-primary/40 group-hover:bg-muted/40',
        )}
      >
        <CardContent className="p-4">
          <p
            className={cn(
              'flex items-center gap-2 text-sm',
              primary ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {formatNumber(value)}
          </p>
          <p
            className={cn(
              'mt-1 flex items-center gap-1 text-sm',
              primary ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {hint}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

export function DashboardOverview({
  unresponded,
  responded,
  digest,
  newSinceDigest,
  insightDigest,
  paused,
  thresholds,
  stats,
  history,
  canUpload,
}: DashboardOverviewProps) {
  const pending = unresponded.filter(awaitsDecision)
  const recommended = pending
    .filter((p) => p.effectiveCategory && RECOMMENDED.has(p.effectiveCategory))
    .toSorted((a, b) => score(b) - score(a))
  const top = recommended.slice(0, TOP_COUNT)
  const counts = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      pending.filter((p) => p.effectiveCategory === category).length,
    ]),
  ) as Record<Category, number>
  const uncategorized = pending.filter((p) => !p.effectiveCategory).length
  const decisions = Object.fromEntries(
    RESPONSE_KINDS.map((kind) => [
      kind,
      responded.filter((p) => p.response?.kind === kind).length,
    ]),
  ) as Record<(typeof RESPONSE_KINDS)[number], number>
  const total = unresponded.length + responded.length
  const assessed = [...unresponded, ...responded].filter((p) => p.assessment)
  const average = assessed.length
    ? assessed.reduce((sum, p) => sum + score(p), 0) / assessed.length
    : null
  const outsideFocus = pending.filter(
    (p) => p.status === 'dinilai' && showsQualityOutsideFocus(p),
  ).length
  const manual = pending.filter((p) => p.status === 'perlu_dicek_manual').length
  const share = (n: number) => (pending.length ? (n / pending.length) * 100 : 0)

  const notes = [
    {
      icon: BarChart3Icon,
      title: 'Rata-rata skor',
      text:
        average === null
          ? 'Belum ada proposal yang dinilai'
          : `${formatDecimal(average, { max: 1 })} dari 100`,
      href: '/tren',
    },
    {
      icon: Clock3Icon,
      title: digest
        ? `Sejak ringkasan ${digest.slot} · ${formatDate(digest.sentAt)}`
        : 'Ringkasan WhatsApp',
      text: digest
        ? `${formatNumber(newSinceDigest ?? 0)} proposal baru masuk`
        : 'Belum ada ringkasan terkirim',
      href: '/proposal',
    },
    {
      icon: GemIcon,
      title: QUALITY_OUTSIDE_FOCUS_LABEL,
      text: `${formatNumber(outsideFocus)} proposal patut dilihat lagi`,
      href: '/proposal?luarFokus=1&tanggapan=belum',
    },
    {
      icon: FileWarningIcon,
      title: 'Perlu dicek manual',
      text: `${formatNumber(manual)} proposal tidak bisa dinilai otomatis`,
      href: '/proposal?status=perlu_dicek_manual&tanggapan=belum',
    },
  ]

  const trend = weeklyTrend(stats)
  const trendDescription =
    trend.previous && trend.weeks === TREND_WEEKS
      ? `${TREND_WEEKS} minggu terakhir, dibanding ${TREND_WEEKS} minggu sebelumnya`
      : trend.recordedSince
        ? `${trend.weeks} minggu terakhir · pencatatan harian sejak ${dayLabel(trend.recordedSince)}`
        : `${trend.weeks} minggu terakhir`

  return (
    <div className="flex w-full flex-col gap-5">
      {paused ? (
        <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <PauseCircleIcon className="size-4 shrink-0" />
          <span>
            AI sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai
            LANJUT di{' '}
            <Link
              href="/pengaturan?tab=integrasi"
              className="font-medium underline"
            >
              Pengaturan
            </Link>
            .
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          primary
          href="/proposal?tanggapan=belum"
          icon={InboxIcon}
          label="Menunggu keputusan"
          value={pending.length}
          hint="Belum Anda tanggapi"
        />
        <StatCard
          href="/proposal?kategori=atas&tanggapan=belum"
          icon={SparklesIcon}
          label="Disarankan untuk Anda"
          value={recommended.length}
          hint="Kategori sangat cocok dan cocok"
        />
        <StatCard
          href="/proposal?tanggapan=sudah"
          icon={CheckCircle2Icon}
          label="Sudah ditanggapi"
          value={responded.length}
          hint="Diundang, dipantau, atau diarsipkan"
        />
        <StatCard
          href="/proposal"
          icon={LayersIcon}
          label="Total proposal"
          value={total}
          hint="Semua yang tersimpan"
        />
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="grid gap-px overflow-hidden rounded-xl bg-border p-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:bg-card">
          {notes.map((note) => (
            <Link
              key={note.title}
              href={note.href}
              className="group flex items-start gap-3 p-4 transition-colors hover:bg-muted/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <note.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  {note.title}
                </span>
                <span className="mt-0.5 block text-sm leading-snug font-medium">
                  {note.text}
                </span>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>

      {insightDigest?.insight ? (
        <ul className="a-ins" aria-label="Insight terbaru">
          <li>
            <span
              aria-hidden
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ background: 'var(--primary)' }}
            />
            <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span>Yang menarik: {insightDigest.insight}</span>
              <span className="text-xs text-muted-foreground">
                Ringkasan {insightDigest.slot} ·{' '}
                {formatDate(insightDigest.sentAt)}
              </span>
            </span>
          </li>
        </ul>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="gap-0 pb-0 lg:col-span-2">
          <CardHeader className="border-b pb-4">
            <CardTitle>Paling cocok untuk Anda</CardTitle>
            <CardDescription>
              Proposal dengan skor tertinggi yang belum ditanggapi
            </CardDescription>
            <CardAction>
              <Link
                href="/proposal?kategori=atas&tanggapan=belum"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Lihat semua
                <ArrowRightIcon />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {top.length ? (
              <ul>
                {top.map((proposal, index) => {
                  const tone = scoreTone(score(proposal), thresholds)
                  const subtitle = [
                    proposal.profile?.oneLiner,
                    proposal.profile?.sector,
                    proposal.profile?.stage,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={proposal.id} className="border-b last:border-0">
                      <Link
                        href={`/proposal/${encodeURIComponent(proposal.id)}`}
                        className="group flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/40"
                      >
                        <span className="w-4 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                          {initials(proposal.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold transition-colors group-hover:text-primary">
                              {proposal.name}
                            </span>
                            {proposal.effectiveCategory ? (
                              <CategoryBadge
                                category={proposal.effectiveCategory}
                                className="hidden sm:inline-flex"
                              />
                            ) : null}
                          </span>
                          {subtitle ? (
                            <span className="block truncate text-[13px] text-muted-foreground">
                              {subtitle}
                            </span>
                          ) : null}
                        </span>
                        <span className="hidden w-40 shrink-0 items-center gap-3 sm:flex">
                          <ScoreBar
                            score={score(proposal)}
                            thresholds={thresholds}
                            className="h-2 flex-1"
                          />
                          <span
                            className={cn(
                              'w-9 text-right text-sm font-semibold tabular-nums',
                              tone.text,
                            )}
                          >
                            {formatScore(score(proposal))}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'text-sm font-semibold tabular-nums sm:hidden',
                            tone.text,
                          )}
                        >
                          {formatScore(score(proposal))}
                        </span>
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-3 p-6">
                <p className="font-medium">
                  {pending.length
                    ? 'Belum ada proposal yang sangat cocok atau cocok.'
                    : 'Semua proposal sudah ditanggapi.'}
                </p>
                <Link
                  href="/proposal"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Buka semua proposal
                  <ArrowRightIcon />
                </Link>
              </div>
            )}
          </CardContent>
          {canUpload ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3 text-sm text-muted-foreground">
              Pitch deck tidak lewat Form? Unggah agar ikut dinilai.
              <UploadDeckButton />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menunggu keputusan</CardTitle>
            <CardDescription>
              {formatNumber(pending.length)} proposal, dikelompokkan per
              kategori
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {CATEGORIES.map((category) => (
                <span
                  key={category}
                  style={{
                    width: `${share(counts[category])}%`,
                    background: COLOR[category],
                  }}
                />
              ))}
            </div>
            <ul
              className="space-y-1"
              aria-label="Menunggu keputusan per kategori"
            >
              {CATEGORIES.map((category) => (
                <li key={category}>
                  <Link
                    href={`/proposal?kategori=${category}&tanggapan=belum`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-[3px]"
                        style={{ background: COLOR[category] }}
                      />
                      {CATEGORY_LABEL[category]}
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-semibold tabular-nums">
                        {formatNumber(counts[category])}
                      </span>
                      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                        {Math.round(share(counts[category]))}%
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {uncategorized ? (
                <li className="-mx-2 flex items-center justify-between gap-3 px-2 py-2">
                  <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-[3px] bg-muted-foreground/30"
                    />
                    Perlu dicek manual
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums">
                      {formatNumber(uncategorized)}
                    </span>
                    <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                      {Math.round(share(uncategorized))}%
                    </span>
                  </span>
                </li>
              ) : null}
            </ul>
            <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-4 text-center">
              {RESPONSE_KINDS.map((kind) => (
                <Link
                  key={kind}
                  href={`/proposal?tanggapan=${kind}`}
                  className="rounded-lg py-2 transition-colors hover:bg-muted/60"
                >
                  <p className="text-lg font-semibold tabular-nums">
                    {formatNumber(decisions[kind])}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {DECISION_LABEL[kind]}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ProposalTrendChart
          trend={trend}
          description={trendDescription}
          className="lg:col-span-2"
        />
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas terakhir</CardTitle>
            <CardDescription>
              Proposal masuk, keputusan, dan ringkasan WhatsApp
            </CardDescription>
            <CardAction>
              <Link
                href="/riwayat"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Semua
                <ArrowRightIcon />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {history.length ? (
              <Timeline
                clamp
                items={history.map((row) => ({
                  key: row.id,
                  title:
                    row.proposalName &&
                    row.proposalName !== DELETED_PROPOSAL_NAME
                      ? `${labelOf(HISTORY_ACTION_LABEL, row.action)} · ${row.proposalName}`
                      : labelOf(HISTORY_ACTION_LABEL, row.action),
                  description: row.detail,
                  time: `${shortDay.format(row.at)}, ${formatTime(row.at)}`,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Belum ada aktivitas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
