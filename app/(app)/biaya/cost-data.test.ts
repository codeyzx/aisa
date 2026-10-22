import { describe, expect, it } from 'vitest'

import type { DailyStats, Job, Rules } from '@/features/aisa/aisa.schema'

import { costData, unitCosts, unitUsdOn } from './cost-data'

const FLASH = 'gemini-3.8-flash'
const models: Rules['models'] = {
  penilai: FLASH,
  ringkasan: FLASH,
  insight: FLASH,
  asisten: FLASH,
}

function day(
  date: string,
  byKind: DailyStats['tokensByKind'],
  extra: Partial<DailyStats> = {},
): DailyStats {
  const tin = Object.values(byKind).reduce((t, k) => t + k.in, 0)
  const tout = Object.values(byKind).reduce((t, k) => t + k.out, 0)
  return {
    id: date,
    date,
    proposalsIn: 0,
    byCategory: {},
    bySector: {},
    perluDicekManual: 0,
    tokensIn: tin,
    tokensOut: tout,
    modelCalls: 1,
    tokensByKind: byKind,
    ...extra,
  }
}

function job(fields: Partial<Job> & Pick<Job, 'id' | 'kind'>): Job {
  return {
    agent: 'Penilai',
    title: fields.id,
    model: FLASH,
    status: 'selesai',
    startedAt: new Date('2026-10-21T05:00:00Z'),
    stepCount: 1,
    tokensIn: 0,
    tokensOut: 0,
    ...fields,
  }
}

describe('costData', () => {
  it('prices each day at its own tariff, across the 2027 switch', () => {
    const stats = [
      day('2026-12-31', { penilaian: { in: 1_000_000, out: 0 } }),
      day('2027-01-01', { penilaian: { in: 1_000_000, out: 0 } }),
    ]
    const data = costData({
      stats,
      limit: 400,
      models,
      jobs: [],
      now: new Date('2027-01-01T12:00:00+07:00'),
    })
    expect(data.cost.usd).toBeCloseTo(0.75 + 1.5)
    expect(data.daily.map((d) => d.usd)).toEqual([0.75, 1.5])
    expect(data.firstDate).toBe('2026-12-31')
    expect(data.truncated).toBe(false)
  })

  it('splits by kind and by input vs output', () => {
    const data = costData({
      stats: [
        day('2026-10-21', {
          penilaian: { in: 1_000_000, out: 100_000 },
          asisten: { in: 2_000_000, out: 0 },
        }),
      ],
      limit: 400,
      models,
      jobs: [],
      now: new Date('2026-10-21T12:00:00+07:00'),
    })
    const of = (kind: string) => data.kinds.find((k) => k.kind === kind)
    expect(of('penilaian')?.cost?.usd).toBeCloseTo(0.75 + 0.375)
    expect(of('asisten')?.cost?.usd).toBeCloseTo(1.5)
    expect(data.cost.inputUsd).toBeCloseTo(2.25)
    expect(data.cost.outputUsd).toBeCloseTo(0.375)
    expect(data.unpricedTokens).toBe(0)
  })

  it('leaves tokens unpriced when the model has no tariff or the kind is unknown', () => {
    const data = costData({
      stats: [
        day(
          '2026-10-21',
          { asisten: { in: 1000, out: 0 } },
          // 500 tokens of a kind this build does not price.
          { tokensIn: 1500 },
        ),
      ],
      limit: 400,
      models: { ...models, asisten: 'gemini-9-ultra' },
      jobs: [],
      now: new Date('2026-10-21T12:00:00+07:00'),
    })
    expect(data.cost.usd).toBe(0)
    expect(data.kinds.find((k) => k.kind === 'asisten')?.cost).toBeNull()
    expect(data.unpricedTokens).toBe(1500)
  })

  it('reads the proposal pace over the recorded days, scaled to 30', () => {
    const data = costData({
      stats: [
        day('2026-10-20', {}, { proposalsIn: 4 }),
        day('2026-10-21', {}, { proposalsIn: 2 }),
      ],
      limit: 400,
      models,
      jobs: [],
      now: new Date('2026-10-21T12:00:00+07:00'),
    })
    expect(data.pace).toEqual({ perMonth: 90, days: 2 })
  })

  it('starts the daily chart at the first day with a cost', () => {
    const data = costData({
      stats: [
        day('2026-10-19', {}, { proposalsIn: 1 }),
        day('2026-10-20', { penilaian: { in: 1_000_000, out: 0 } }),
        day('2026-10-21', {}),
        day('2026-10-22', { penilaian: { in: 1_000_000, out: 0 } }),
      ],
      limit: 400,
      models,
      jobs: [],
      now: new Date('2026-10-22T12:00:00+07:00'),
    })
    expect(data.daily.map((d) => [d.date, d.usd])).toEqual([
      ['2026-10-20', 0.75],
      ['2026-10-21', 0],
      ['2026-10-22', 0.75],
    ])
  })
})

describe('unitCosts', () => {
  it('sums a proposal assessed twice as one unit and skips zero-token jobs', () => {
    const units = unitCosts([
      job({
        id: 'a1',
        kind: 'penilaian',
        proposalId: 'a',
        tokensIn: 1000,
        tokensOut: 1000,
      }),
      job({
        id: 'a2',
        kind: 'penilaian',
        proposalId: 'a',
        tokensIn: 1000,
        tokensOut: 0,
      }),
      job({
        id: 'b',
        kind: 'penilaian',
        proposalId: 'b',
        tokensIn: 2000,
        tokensOut: 0,
      }),
      job({ id: 'c', kind: 'penilaian', proposalId: 'c', model: null }),
      job({ id: 'q', kind: 'asisten', tokensIn: 10_000, tokensOut: 1000 }),
    ])
    expect(units.penilaian?.n).toBe(2)
    expect(units.penilaian?.tokens).toEqual({ in: 2000, out: 500 })
    expect(units.penilaian?.usd).toBeCloseTo(
      (2000 * 0.75 + 500 * 3.75) / 1_000_000,
    )
    expect(units.asisten?.n).toBe(1)
    expect(units.ringkasan).toBeNull()
  })

  it('reprices a unit at the 2027 tariff', () => {
    const units = unitCosts([
      job({ id: 'q', kind: 'asisten', tokensIn: 1_000_000, tokensOut: 0 }),
    ])
    if (!units.asisten) throw new Error('no unit')
    expect(unitUsdOn(units.asisten, '2027-01-01')).toBeCloseTo(1.5)
  })
})
