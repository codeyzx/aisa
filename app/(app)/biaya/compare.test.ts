import { describe, expect, it } from 'vitest'

import { USD_IDR } from '@/features/aisa/aisa.pricing'

import { COMPARE_DEFAULTS, compare, DIGESTS_PER_MONTH } from './compare'

const inputs = { ...COMPARE_DEFAULTS, proposalsPerMonth: 100 }

describe('compare', () => {
  it('prices manual screening from pay, hours and minutes per deck', () => {
    const result = compare(inputs, { proposalUsd: 0, digestUsd: 0 })
    const hourly = 14_500_000 / 173
    expect(result.hourlyIdr).toBeCloseTo(hourly)
    expect(result.manual.perProposalIdr).toBeCloseTo((15 / 60) * hourly)
    expect(result.manual.monthIdr).toBeCloseTo(100 * (15 / 60) * hourly)
  })

  it('counts the AI cost, the review minutes and the month of ringkasan on the AISA side', () => {
    const result = compare(inputs, { proposalUsd: 0.01, digestUsd: 0.005 })
    const hourly = 14_500_000 / 173
    const aiPer = 0.01 * USD_IDR.rate
    const reviewPer = (2 / 60) * hourly
    expect(result.aisa.perProposalIdr).toBeCloseTo(aiPer + reviewPer)
    expect(result.aisa.digestsMonthIdr).toBeCloseTo(
      DIGESTS_PER_MONTH * 0.005 * USD_IDR.rate,
    )
    expect(result.aisa.monthIdr).toBeCloseTo(
      100 * (aiPer + reviewPer) + result.aisa.digestsMonthIdr,
    )
    expect(result.savedMonthIdr).toBeCloseTo(
      result.manual.monthIdr - result.aisa.monthIdr,
    )
    expect(result.times).toBeCloseTo(
      result.manual.monthIdr / result.aisa.monthIdr,
    )
    // 13 minutes back per proposal.
    expect(result.hoursBackPerMonth).toBeCloseTo((100 * 13) / 60)
  })

  it('returns no ratio when a side is zero instead of dividing by it', () => {
    const none = compare(
      { ...inputs, proposalsPerMonth: 0, reviewMinutes: 0 },
      { proposalUsd: 0, digestUsd: 0 },
    )
    expect(none.times).toBeNull()
    expect(none.savedPercent).toBeNull()
  })

  it('never returns negative hours when review takes longer than screening', () => {
    expect(
      compare(
        { ...inputs, reviewMinutes: 30 },
        { proposalUsd: 0, digestUsd: 0 },
      ).hoursBackPerMonth,
    ).toBe(0)
  })
})
