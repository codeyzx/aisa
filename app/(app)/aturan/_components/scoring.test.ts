import { describe, expect, it } from 'vitest'

import {
  categorize,
  computeScore,
  fitCheck,
  normalizeToken,
  simulate,
  toScored,
  type ScoredProposal,
  type ScoringRules,
} from './scoring'

const RULES: ScoringRules = {
  weights: {
    manajemen: 0.25,
    kinerja: 0.2,
    risiko: 0.2,
    rencana: 0.25,
    dampak: 0.1,
  },
  fit: {
    sectors: ['agritech', 'fintech'],
    stages: ['pre-seed', 'seed'],
    fundingMinIdr: 1_000_000_000,
    fundingMaxIdr: 20_000_000_000,
  },
  thresholds: {
    sangatLayak: 85,
    layakBersyarat: 75,
    perluPenyesuaian: 65,
    risikoTinggi: 50,
  },
}

const proposal = (over: Partial<ScoredProposal>): ScoredProposal => ({
  id: 'p',
  name: 'P',
  score: 0,
  values: { manajemen: 5, kinerja: 5, risiko: 4, rencana: 5, dampak: 4 },
  sector: 'agritech',
  stage: 'seed',
  fundingAskIdr: 5_000_000_000,
  category: 'sangat_layak',
  corrected: false,
  outsideFocus: false,
  rulesVersion: 1,
  ...over,
})

const all = (n: number) => ({
  manajemen: n,
  kinerja: n,
  risiko: n,
  rencana: n,
  dampak: n,
})

describe('computeScore mirrors scoring.py', () => {
  it('maps all-1 to 0 and all-5 to 100', () => {
    expect(computeScore(RULES.weights, all(1))).toBe(0)
    expect(computeScore(RULES.weights, all(5))).toBe(100)
  })

  it('weights (nilai − 1) / 4 and keeps one decimal', () => {
    // 0.25 + 0.2 + 0.2×0.75 + 0.25 + 0.1×0.75 = 0.925
    expect(
      computeScore(RULES.weights, {
        manajemen: 5,
        kinerja: 5,
        risiko: 4,
        rencana: 5,
        dampak: 4,
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

  it('grades by score bands alone, each threshold inclusive', () => {
    const t = RULES.thresholds
    expect(categorize(100, t)).toBe('sangat_layak')
    expect(categorize(85, t)).toBe('sangat_layak')
    expect(categorize(84.9, t)).toBe('layak_bersyarat')
    expect(categorize(75, t)).toBe('layak_bersyarat')
    expect(categorize(74.9, t)).toBe('perlu_penyesuaian')
    expect(categorize(65, t)).toBe('perlu_penyesuaian')
    expect(categorize(64.9, t)).toBe('risiko_tinggi')
    expect(categorize(50, t)).toBe('risiko_tinggi')
    expect(categorize(49.9, t)).toBe('tidak_layak')
    expect(categorize(0, t)).toBe('tidak_layak')
  })
})

describe('simulate', () => {
  it('keeps the grade of a proposal outside focus: fit never moves it', () => {
    const outside = proposal({ sector: 'f&b' })
    const sim = simulate([outside], RULES, {
      ...RULES,
      fit: { ...RULES.fit, sectors: ['f&b'] },
    })
    expect(sim.before.sangat_layak).toBe(1)
    expect(sim.moves).toHaveLength(0)
  })

  it('counts moves when a threshold rises', () => {
    const sim = simulate([proposal({})], RULES, {
      ...RULES,
      thresholds: { ...RULES.thresholds, sangatLayak: 95 },
    })
    expect(sim.moves).toHaveLength(1)
    expect(sim).toMatchObject({ total: 1, up: 0, down: 1 })
  })

  it('skips a proposal missing a criterion', () => {
    expect(simulate([proposal({ values: null })], RULES, RULES).total).toBe(0)
  })

  it('compares AI grades on both sides, never the grade a koreksi set', () => {
    // The AI puts it in Sangat layak; a manager corrected it to Tidak layak.
    const corrected = proposal({ category: 'tidak_layak', corrected: true })
    const unchanged = simulate([corrected], RULES, RULES)
    expect(unchanged.before.sangat_layak).toBe(1)
    expect(unchanged.before.tidak_layak).toBe(0)
    expect(unchanged).toMatchObject({ moves: [], held: 0 })
  })

  it('counts a move a koreksi holds as held', () => {
    const draft = {
      ...RULES,
      thresholds: { ...RULES.thresholds, sangatLayak: 95 },
    }
    const sim = simulate(
      [proposal({ id: 'a' }), proposal({ id: 'b', corrected: true })],
      RULES,
      draft,
    )
    expect(sim).toMatchObject({ total: 2, down: 2, held: 1 })
    expect(sim.moves.map((m) => [m.proposal.id, m.proposal.corrected])).toEqual(
      [
        ['a', false],
        ['b', true],
      ],
    )
  })
})

const criterion = (value: number) => ({ value, reason: 'r' })

describe('toScored', () => {
  const stored = (over: object) =>
    ({
      id: 'p',
      name: 'P',
      status: 'dinilai',
      category: 'sangat_layak',
      effectiveCategory: 'sangat_layak',
      correction: null,
      fit: { passed: true },
      profile: { sector: 'agritech', stage: 'seed', fundingAskIdr: 5e9 },
      assessment: {
        score: 92.5,
        rulesVersion: 1,
        criteria: {
          manajemen: criterion(5),
          kinerja: criterion(5),
          risiko: criterion(4),
          rencana: criterion(5),
          dampak: criterion(4),
        },
      },
      ...over,
    }) as unknown as Parameters<typeof toScored>[0]

  it('marks a proposal a koreksi holds and shows its effective grade', () => {
    expect(
      toScored(
        stored({
          effectiveCategory: 'layak_bersyarat',
          correction: { category: 'layak_bersyarat', reason: 'x' },
        }),
      ),
    ).toMatchObject({ category: 'layak_bersyarat', corrected: true })
    expect(toScored(stored({}))).toMatchObject({
      category: 'sangat_layak',
      corrected: false,
      outsideFocus: false,
    })
  })

  it('reads "di luar fokus" from a failed fit', () => {
    expect(toScored(stored({ fit: { passed: false } }))).toMatchObject({
      outsideFocus: true,
    })
  })
})
