import type { DailyStats } from '@/features/aisa/aisa.schema'

import {
  dailyWindow,
  dayLabel,
  recordedDays,
} from '../../_components/daily-window'

export const TREND_WEEKS = 12
/** Two periods of `TREND_WEEKS`, so the current one can be compared. */
export const TREND_DAYS = TREND_WEEKS * 7 * 2

export interface WeekPoint {
  minggu: string
  total: number
  sangatCocok: number
}

export interface WeeklyTrend {
  /** Weeks shown — fewer than `TREND_WEEKS` while the record is younger. */
  weeks: number
  points: WeekPoint[]
  current: { total: number; sangatCocok: number }
  /** The same span just before, or `null` when the record does not reach it. */
  previous: { total: number; sangatCocok: number } | null
  /** First recorded date when the record is younger than the window. */
  recordedSince: string | null
}

const sumWeeks = (list: WeekPoint[]) => ({
  total: list.reduce((s, p) => s + p.total, 0),
  sangatCocok: list.reduce((s, p) => s + p.sangatCocok, 0),
})

/**
 * Weekly totals from `dailyStats`, newest week ending today (WIB). "Sangat
 * cocok" is the AI category at scoring time that `dailyStats` stores, not a
 * later correction. Weeks before recording began are left out rather than drawn
 * as zero, so a young record never reads as a quiet quarter.
 */
export function weeklyTrend(
  stats: DailyStats[],
  now = new Date(),
): WeeklyTrend {
  const covered = recordedDays(stats, TREND_DAYS, now)
  const weeks = Math.min(TREND_WEEKS, Math.ceil(covered / 7))
  const days = dailyWindow(stats, TREND_DAYS, now)
  const week = (index: number) => {
    const slice = days.slice(index * 7, index * 7 + 7)
    return {
      minggu: dayLabel(slice[0]?.date ?? ''),
      total: slice.reduce((sum, d) => sum + (d.stats?.proposalsIn ?? 0), 0),
      sangatCocok: slice.reduce(
        (sum, d) => sum + (d.stats?.byCategory.sangat_cocok ?? 0),
        0,
      ),
    }
  }
  const all = Array.from({ length: TREND_DAYS / 7 }, (_, i) => week(i))
  const points = all.slice(all.length - weeks)

  const hasPrevious = weeks > 0 && covered >= weeks * 7 * 2
  return {
    weeks,
    points,
    current: sumWeeks(points),
    previous: hasPrevious
      ? sumWeeks(all.slice(all.length - weeks * 2, all.length - weeks))
      : null,
    recordedSince:
      covered < TREND_DAYS && stats[0] ? (stats[0].date ?? null) : null,
  }
}
