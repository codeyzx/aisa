import { CATEGORIES, type DailyStats } from '@/features/aisa/aisa.schema'

import { dayLabel, todayIso } from '../../_components/daily-window'

/** Calendar weeks the card shows at most, the running one included. */
export const TREND_WEEKS = 8
/** Enough daily rows to cover `TREND_WEEKS` Monday–Sunday weeks ending this week. */
export const TREND_DAYS = TREND_WEEKS * 7

/** A stacked segment: the five grades, best first, then the ungraded manual pile. */
export const TREND_SERIES = [...CATEGORIES, 'manual'] as const
export type TrendSeries = (typeof TREND_SERIES)[number]

export interface WeekBucket {
  /** WIB Monday, `YYYY-MM-DD`. */
  start: string
  /** WIB Sunday, `YYYY-MM-DD`. */
  end: string
  /** `13–19 Okt`, or `29 Sep–5 Okt` across a month. */
  label: string
  /** The week holds today, so its count is still growing. */
  current: boolean
  /** Last day counted: `end`, or today in the running week. */
  through: string
  /** First recorded day when recording began after this week's Monday. */
  recordedFrom: string | null
  counts: Record<TrendSeries, number>
  /** Sum of `counts`, so it equals the height of the stack. */
  total: number
}

export interface WeeklyTrend {
  /** Oldest first; empty when nothing is recorded. */
  weeks: WeekBucket[]
  /** First recorded WIB date when it falls inside the shown weeks, else `null`. */
  recordedSince: string | null
  /** Any week holds a "Perlu dicek manual" proposal. */
  hasManual: boolean
}

const DAY_MS = 86_400_000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (iso: string, days: number) => toIso(toMs(iso) + days * DAY_MS)

/** The Monday of the Monday–Sunday week holding `iso`. */
export function mondayOf(iso: string): string {
  const weekday = new Date(toMs(iso)).getUTCDay()
  return addDays(iso, -((weekday + 6) % 7))
}

/** `13–19 Okt` within a month, `29 Sep–5 Okt` across one. */
export function weekLabel(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8))}–${dayLabel(end)}`
  }
  return `${dayLabel(start)}–${dayLabel(end)}`
}

const emptyCounts = (): Record<TrendSeries, number> =>
  Object.fromEntries(TREND_SERIES.map((s) => [s, 0])) as Record<
    TrendSeries,
    number
  >

/**
 * Proposals per WIB Monday–Sunday week by the AI grade `dailyStats` stored at
 * scoring time, plus "Perlu dicek manual", for up to `TREND_WEEKS` weeks ending
 * with the running one. `stats` is a `listDailyStats(TREND_DAYS)` read, oldest
 * first. A read that came back short started at the first row ever written, so
 * weeks before that row are left out rather than drawn as zero: a young record
 * must not read as a quiet quarter. A day with no row inside the shown weeks is
 * a real zero.
 */
export function weeklyTrend(
  stats: DailyStats[],
  now = new Date(),
): WeeklyTrend {
  const first = stats[0]?.date
  if (!first) return { weeks: [], recordedSince: null, hasManual: false }

  const today = todayIso(now)
  const thisMonday = mondayOf(today)
  const windowStart = addDays(thisMonday, -7 * (TREND_WEEKS - 1))
  // A full read may have cut older rows off, so its first row is not where
  // recording began; only a short read proves that.
  const since = stats.length < TREND_DAYS && first > windowStart ? first : null
  const firstMonday = since ? mondayOf(since) : windowStart
  const count = Math.max(
    0,
    Math.round((toMs(thisMonday) - toMs(firstMonday)) / (7 * DAY_MS)) + 1,
  )

  const weeks = Array.from({ length: count }, (_, index): WeekBucket => {
    const start = addDays(firstMonday, index * 7)
    const end = addDays(start, 6)
    return {
      start,
      end,
      label: weekLabel(start, end),
      current: start === thisMonday,
      through: end < today ? end : today,
      recordedFrom: since && since > start && since <= end ? since : null,
      counts: emptyCounts(),
      total: 0,
    }
  })

  for (const row of stats) {
    if (row.date > today) continue
    const week = weeks.find((w) => w.start <= row.date && row.date <= w.end)
    if (!week) continue
    for (const category of CATEGORIES) {
      week.counts[category] += row.byCategory[category] ?? 0
    }
    week.counts.manual += row.perluDicekManual
  }
  for (const week of weeks) {
    week.total = TREND_SERIES.reduce((sum, s) => sum + week.counts[s], 0)
  }

  return {
    weeks,
    recordedSince: since,
    hasManual: weeks.some((w) => w.counts.manual > 0),
  }
}

/** A week whose seven days all counted: not running, not cut by the record's start. */
export const isFullWeek = (week: WeekBucket) =>
  !week.current && week.recordedFrom === null

export interface TrendSummary {
  /** The running week so far, or `null` when it is not shown. */
  thisWeek: number | null
  /** The newest full week, compared with the full week before it. */
  lastWeek: { total: number; change: number | undefined } | null
  /** Mean over full weeks only, or `null` while there is none. */
  perWeek: number | null
}

/**
 * Headline numbers that never compare a part-week with a whole one: the running
 * week and a week recording began inside are left out of the change and mean.
 */
export function summarize({ weeks }: WeeklyTrend): TrendSummary {
  const full = weeks.filter(isFullWeek)
  const last = full.at(-1)
  const before = full.at(-2)
  const current = weeks.find((w) => w.current)
  return {
    thisWeek: current ? current.total : null,
    lastWeek: last
      ? {
          total: last.total,
          change: before?.total
            ? ((last.total - before.total) / before.total) * 100
            : undefined,
        }
      : null,
    perWeek: full.length
      ? full.reduce((sum, w) => sum + w.total, 0) / full.length
      : null,
  }
}

/** The card subtitle: how many weeks, how they are cut, and since when when young. */
export function trendDescription({ weeks, recordedSince }: WeeklyTrend) {
  const span = `${weeks.length} minggu terakhir, Senin–Minggu WIB`
  return recordedSince
    ? `${span} · pencatatan sejak ${dayLabel(recordedSince)}`
    : span
}
