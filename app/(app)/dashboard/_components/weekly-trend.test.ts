import { describe, expect, it } from 'vitest'

import { type DailyStats, DailyStatsSchema } from '@/features/aisa/aisa.schema'

import {
  mondayOf,
  summarize,
  TREND_DAYS,
  TREND_WEEKS,
  trendDescription,
  weekLabel,
  weeklyTrend,
} from './weekly-trend'

const row = (
  date: string,
  byCategory: Record<string, number> = {},
  perluDicekManual = 0,
): DailyStats =>
  DailyStatsSchema.parse({ id: date, date, byCategory, perluDicekManual })

/** Thursday 22 Oct 2026, 10:00 WIB. */
const NOW = new Date('2026-10-22T03:00:00Z')

describe('mondayOf / weekLabel', () => {
  it('cuts weeks Monday to Sunday', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19')
    expect(mondayOf('2026-10-22')).toBe('2026-10-19')
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
  })

  it('names the month once inside it and twice across it', () => {
    expect(weekLabel('2026-10-12', '2026-10-18')).toBe('12–18 Okt')
    expect(weekLabel('2026-09-28', '2026-10-04')).toBe('28 Sep–4 Okt')
  })
})

describe('weeklyTrend', () => {
  it('starts at the week recording began, not at an empty history', () => {
    const trend = weeklyTrend(
      [row('2026-10-09', { sangat_layak: 2 }), row('2026-10-20')],
      NOW,
    )
    expect(trend.weeks.map((w) => w.label)).toEqual([
      '5–11 Okt',
      '12–18 Okt',
      '19–25 Okt',
    ])
    expect(trend.recordedSince).toBe('2026-10-09')
    expect(trend.weeks[0]?.recordedFrom).toBe('2026-10-09')
    expect(trend.weeks[1]?.recordedFrom).toBeNull()
  })

  it('marks only the week holding today as running', () => {
    const { weeks } = weeklyTrend([row('2026-10-09')], NOW)
    expect(weeks.map((w) => w.current)).toEqual([false, false, true])
    expect(weeks.map((w) => w.through)).toEqual([
      '2026-10-11',
      '2026-10-18',
      '2026-10-22',
    ])
  })

  it('sums every grade and the manual pile into its WIB week', () => {
    const { weeks, hasManual } = weeklyTrend(
      [
        row('2026-10-12', { sangat_layak: 1, tidak_layak: 2 }),
        row('2026-10-18', { sangat_layak: 3, risiko_tinggi: 1 }, 2),
        row('2026-10-19', { layak_bersyarat: 4, perlu_penyesuaian: 1 }),
      ],
      NOW,
    )
    expect(weeks[0]?.counts).toEqual({
      sangat_layak: 4,
      layak_bersyarat: 0,
      perlu_penyesuaian: 0,
      risiko_tinggi: 1,
      tidak_layak: 2,
      manual: 2,
    })
    expect(weeks[0]?.total).toBe(9)
    expect(weeks[1]?.counts.layak_bersyarat).toBe(4)
    expect(weeks[1]?.total).toBe(5)
    expect(hasManual).toBe(true)
  })

  it('reports no manual series when no day had one', () => {
    expect(weeklyTrend([row('2026-10-12')], NOW).hasManual).toBe(false)
  })

  it('counts a day with no row as zero instead of dropping its week', () => {
    const { weeks } = weeklyTrend(
      [
        row('2026-09-28', { sangat_layak: 1 }),
        row('2026-10-21', { tidak_layak: 1 }),
      ],
      NOW,
    )
    expect(weeks.map((w) => w.total)).toEqual([1, 0, 0, 1])
  })

  it('rolls into a new week at WIB midnight, not UTC midnight', () => {
    const stats = [row('2026-10-19'), row('2026-10-26', { sangat_layak: 1 })]
    // Sunday 25 Oct 23:30 WIB is still the 19–25 week.
    const sunday = weeklyTrend(stats, new Date('2026-10-25T16:30:00Z'))
    expect(sunday.weeks.at(-1)?.label).toBe('19–25 Okt')
    expect(sunday.weeks.at(-1)?.total).toBe(0)
    // Monday 26 Oct 00:30 WIB is already Sunday 17:30 UTC.
    const monday = weeklyTrend(stats, new Date('2026-10-25T17:30:00Z'))
    expect(monday.weeks.at(-1)?.label).toBe('26 Okt–1 Nov')
    expect(monday.weeks.at(-1)?.current).toBe(true)
    expect(monday.weeks.at(-1)?.total).toBe(1)
  })

  it('caps at TREND_WEEKS and drops the since note for an old record', () => {
    const stats = Array.from({ length: TREND_DAYS }, (_, i) =>
      row(
        new Date(Date.parse('2026-08-28T00:00:00Z') + i * 86_400_000)
          .toISOString()
          .slice(0, 10),
        { sangat_layak: 1 },
      ),
    )
    const trend = weeklyTrend(stats, NOW)
    expect(trend.weeks).toHaveLength(TREND_WEEKS)
    expect(trend.weeks[0]?.start).toBe('2026-08-31')
    expect(trend.recordedSince).toBeNull()
    expect(trend.weeks.every((w) => w.recordedFrom === null)).toBe(true)
  })

  it('shows nothing when nothing is recorded', () => {
    expect(weeklyTrend([], NOW).weeks).toEqual([])
  })
})

describe('summarize', () => {
  it('compares and averages full weeks only', () => {
    const trend = weeklyTrend(
      [
        row('2026-10-01', { sangat_layak: 9 }),
        row('2026-10-05', { sangat_layak: 4 }),
        row('2026-10-12', { sangat_layak: 6 }),
        row('2026-10-20', { tidak_layak: 2 }),
      ],
      NOW,
    )
    // 28 Sep–4 Okt began on 1 Okt, so it is neither compared nor averaged.
    expect(summarize(trend)).toEqual({
      thisWeek: 2,
      lastWeek: { total: 6, change: 50 },
      perWeek: 5,
    })
  })

  it('has no comparison or mean before a full week exists', () => {
    const trend = weeklyTrend([row('2026-10-21', { sangat_layak: 3 })], NOW)
    expect(summarize(trend)).toEqual({
      thisWeek: 3,
      lastWeek: null,
      perWeek: null,
    })
  })
})

describe('trendDescription', () => {
  it('says since when while the record is young', () => {
    expect(trendDescription(weeklyTrend([row('2026-10-09')], NOW))).toBe(
      '3 minggu terakhir, Senin–Minggu WIB · pencatatan sejak 9 Okt',
    )
  })
})
