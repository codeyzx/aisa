import {
  CATEGORIES,
  type Category,
  type DailyStats,
  type Proposal,
} from '@/features/aisa/aisa.schema'

import {
  dailyWindow,
  type DailyWindowDay,
  dayLabel,
  fullDayLabel,
  wibIsoDate,
} from '../_components/daily-window'

export const TREND_DAYS = 14
const WEEK = 7

export type DayRow = {
  date: string
  label: string
  full: string
  total: number
  manual: number
  /** Mean quality score of the day's scored proposals; `null` when none were. */
  avg: number | null
} & Record<Category, number>

export interface SectorRow {
  sector: string
  now: number
  before: number
}

export interface TokenDay {
  label: string
  full: string
  input: number
  output: number
}

export interface TrendData {
  days: DayRow[]
  sectors: SectorRow[]
  tokens: TokenDay[]
  /** Mean score over the last 7 and the 7 before; `null` without scored proposals. */
  scoreWeek: { now: number | null; before: number | null }
}

const mean = (values: number[]) =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : null

const sectorSum = (slice: DailyWindowDay[]) => {
  const sums = new Map<string, number>()
  for (const d of slice)
    for (const [sector, n] of Object.entries(d.stats?.bySector ?? {}))
      sums.set(sector, (sums.get(sector) ?? 0) + n)
  return sums
}

/**
 * The Tren page's numbers: counts and tokens from `dailyStats` (the durable
 * daily record), the mean score from the proposals themselves, grouped by the
 * WIB day they came in, because `dailyStats` stores no score.
 */
export function buildTrend(
  stats: DailyStats[],
  proposals: Proposal[],
  now = new Date(),
): TrendData {
  const window = dailyWindow(stats, TREND_DAYS, now)
  const scoresByDate = new Map<string, number[]>()
  for (const p of proposals) {
    if (!p.assessment) continue
    const date = wibIsoDate(p.createdAt)
    scoresByDate.set(date, [
      ...(scoresByDate.get(date) ?? []),
      p.assessment.score,
    ])
  }

  const days: DayRow[] = window.map(({ date, stats: row }) => ({
    date,
    label: dayLabel(date),
    full: fullDayLabel(date),
    total: row?.proposalsIn ?? 0,
    manual: row?.perluDicekManual ?? 0,
    avg: mean(scoresByDate.get(date) ?? []),
    ...(Object.fromEntries(
      CATEGORIES.map((category) => [category, row?.byCategory[category] ?? 0]),
    ) as Record<Category, number>),
  }))

  const current = sectorSum(window.slice(-WEEK))
  const previous = sectorSum(window.slice(0, -WEEK))
  const sectors = [...new Set([...current.keys(), ...previous.keys()])]
    .map((sector) => ({
      sector,
      now: current.get(sector) ?? 0,
      before: previous.get(sector) ?? 0,
    }))
    .toSorted((a, b) => b.now - a.now || b.before - a.before)

  const tokens = window.map(({ date, stats: row }) => ({
    label: dayLabel(date),
    full: fullDayLabel(date),
    input: row?.tokensIn ?? 0,
    output: row?.tokensOut ?? 0,
  }))

  const scoresOf = (slice: DayRow[]) =>
    slice.flatMap((d) => scoresByDate.get(d.date) ?? [])
  return {
    days,
    sectors,
    tokens,
    scoreWeek: {
      now: mean(scoresOf(days.slice(-WEEK))),
      before: mean(scoresOf(days.slice(0, -WEEK))),
    },
  }
}
