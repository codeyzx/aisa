import { describe, expect, it } from 'vitest'

import {
  categorize,
  computeScore,
  fitCheck,
  normalizeToken,
  simulate,
  type ScoredProposal,
  type ScoringRules,
} from './scoring'

const RULES: ScoringRules = {
  weights: { tim: 0.275, pasar: 0.3, produk: 0.2, traksi: 0.125, bisnis: 0.1 },
  fit: {
    sectors: ['agritech', 'fintech'],
    stages: ['pre-seed', 'seed'],
    fundingMinIdr: 1_000_000_000,
    fundingMaxIdr: 20_000_000_000,
  },
  thresholds: {
    sangatCocok: 80,
    cocok: 65,
    kurangCocok: 45,
    qualityOutsideFocus: 65,
  },
}

const proposal = (over: Partial<ScoredProposal>): ScoredProposal => ({
  id: 'p',
  name: 'P',
  score: 0,
  values: { tim: 5, pasar: 5, produk: 4, traksi: 5, bisnis: 4 },
  sector: 'agritech',
  stage: 'seed',
  fundingAskIdr: 5_000_000_000,
  category: 'sangat_cocok',
  qualityOutsideFocus: false,
  rulesVersion: 1,
  ...over,
})

const all = (n: number) => ({
  tim: n,
  pasar: n,
  produk: n,
  traksi: n,
  bisnis: n,
})

describe('computeScore mirrors scoring.py', () => {
  it('maps all-1 to 0 and all-5 to 100', () => {
    expect(computeScore(RULES.weights, all(1))).toBe(0)
    expect(computeScore(RULES.weights, all(5))).toBe(100)
  })

  it('weights (nilai − 1) / 4 and keeps one decimal', () => {
    // 0.275 + 0.3 + 0.2×0.75 + 0.125 + 0.1×0.75 = 0.925
    expect(
      computeScore(RULES.weights, {
        tim: 5,
        pasar: 5,
        produk: 4,
        traksi: 5,
        bisnis: 4,
      }),
    ).toBe(92.5)
  })
})

describe('fitCheck and categorize', () => {
  it('compares sectors and stages as normalised tokens', () => {
    expect(normalizeToken(' Pre Seed ')).toBe('pre-seed')
    expect(
      fitCheck(
        { sector: 'AgriTech', stage: 'pre_seed', fundingAskIdr: 1_000_000_000 },
        RULES.fit,
      ).passed,
    ).toBe(true)
  })

  it('fails a check the deck does not state', () => {
    expect(
      fitCheck({ sector: null, stage: 'seed', fundingAskIdr: 2e9 }, RULES.fit),
    ).toMatchObject({ sector: false, passed: false })
  })

  it('sends a failed fit to Tidak cocok and flags quality outside focus', () => {
    const v = { tim: 5, pasar: 5, produk: 5, traksi: 5, bisnis: 5 }
    expect(categorize(70, v, false, RULES.thresholds)).toEqual([
      'tidak_cocok',
      true,
    ])
    expect(categorize(60, v, false, RULES.thresholds)).toEqual([
      'tidak_cocok',
      false,
    ])
  })

  it('keeps a criterion at 1 out of Sangat cocok', () => {
    const v = { tim: 1, pasar: 5, produk: 5, traksi: 5, bisnis: 5 }
    expect(categorize(85, v, true, RULES.thresholds)).toEqual(['cocok', false])
  })
})

describe('simulate', () => {
  it('counts moves when a threshold rises', () => {
    const sim = simulate([proposal({})], RULES, {
      ...RULES,
      thresholds: { ...RULES.thresholds, sangatCocok: 95 },
    })
    expect(sim.moves).toHaveLength(1)
    expect(sim).toMatchObject({ total: 1, up: 0, down: 1 })
  })

  it('skips a proposal missing a criterion', () => {
    expect(simulate([proposal({ values: null })], RULES, RULES).total).toBe(0)
  })
})
