import type { DailyStats } from '@/features/aisa/aisa.schema'
import { TIME_ZONE } from '@/lib/format/locale'

const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * The last `days` WIB dates ending today, each paired with its stats row or
 * `null`. A day with no row is a real zero (nothing came in), so the charts keep
 * a continuous axis instead of silently skipping it.
 */
export function dailyWindow(
  stats: DailyStats[],
  days: number,
  now = new Date(),
): { date: string; stats: DailyStats | null }[] {
  const byDate = new Map(stats.map((row) => [row.date, row]))
  return Array.from({ length: days }, (_, index) => {
    const date = isoDate.format(
      new Date(now.getTime() - (days - 1 - index) * 86_400_000),
    )
    return { date, stats: byDate.get(date) ?? null }
  })
}
