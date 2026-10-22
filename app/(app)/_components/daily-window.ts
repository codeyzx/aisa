import type { DailyStats } from '@/features/aisa/aisa.schema'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'

const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export interface DailyWindowDay {
  date: string
  stats: DailyStats | null
}

/**
 * The last `days` WIB dates ending today, each paired with its stats row or
 * `null`. A day with no row is a real zero (nothing came in), so the charts keep
 * a continuous axis instead of silently skipping it.
 */
export function dailyWindow(
  stats: DailyStats[],
  days: number,
  now = new Date(),
): DailyWindowDay[] {
  const byDate = new Map(stats.map((row) => [row.date, row]))
  return Array.from({ length: days }, (_, index) => {
    const date = isoDate.format(
      new Date(now.getTime() - (days - 1 - index) * 86_400_000),
    )
    return { date, stats: byDate.get(date) ?? null }
  })
}

/** The WIB calendar date of an instant, as `YYYY-MM-DD`. */
export function wibIsoDate(date: Date): string {
  return isoDate.format(date)
}

/** Today's WIB date as `YYYY-MM-DD`. */
export function todayIso(now = new Date()): string {
  return wibIsoDate(now)
}

/** Whole days from `fromIso` to `toIso` (both `YYYY-MM-DD`). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)
}

/**
 * How many trailing days of a `limit`-row `listDailyStats` read are actually
 * covered by the record. Rows exist only from the day recording began, so a
 * read that came back short started at the first row ever written: days before
 * it are "not recorded", not "zero". A full read covers at least `limit` days.
 */
export function recordedDays(
  stats: DailyStats[],
  limit: number,
  now = new Date(),
): number {
  if (stats.length >= limit) return limit
  const first = stats[0]
  if (!first) return 0
  return Math.min(limit, daysBetween(first.date, todayIso(now)) + 1)
}

const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})
const weekdayDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** `2026-10-08` → `8 Okt`. The ISO date is already a WIB date. */
export function dayLabel(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`))
}

/** `2026-10-08` → `Kamis, 8 Oktober`. */
export function fullDayLabel(iso: string): string {
  return weekdayDate.format(new Date(`${iso}T00:00:00Z`))
}

/**
 * Drops the days before the first one with a value, so a daily chart starts
 * where its data starts instead of at the window's edge. Only the start is
 * trimmed: a quiet day after the first value is a real zero and stays. Returns
 * `[]` when no day has a value; the caller decides what an empty chart shows.
 */
export function trimLeadingEmpty<T>(
  rows: readonly T[],
  isEmpty: (row: T) => boolean,
): T[] {
  const first = rows.findIndex((row) => !isEmpty(row))
  return first === -1 ? [] : rows.slice(first)
}

/**
 * `trimLeadingEmpty` for a chart with no empty state of its own: a window with
 * no value at all keeps every day, so the chart still draws its empty axis.
 */
export function fromFirstValue<T>(
  rows: readonly T[],
  isEmpty: (row: T) => boolean,
): T[] {
  const trimmed = trimLeadingEmpty(rows, isEmpty)
  return trimmed.length ? trimmed : [...rows]
}
