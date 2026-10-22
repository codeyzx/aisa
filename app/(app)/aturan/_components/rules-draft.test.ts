import { describe, expect, it } from 'vitest'

import { CRITERIA, RulesSchema, type Rules } from '@/features/aisa/aisa.schema'

import {
  changesRules,
  checkDraft,
  draftFromRules,
  hasPercent,
  withPercent,
} from './rules-draft'
import { GUIDE_PERCENT, WEIGHT_PRESETS } from './weight-presets'

const five = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e' }
const stored = (anchor: Record<string, string>): Rules =>
  RulesSchema.parse({
    id: 'rules',
    version: 3,
    weights: {
      manajemen: 0.25,
      kinerja: 0.2,
      risiko: 0.2,
      rencana: 0.25,
      dampak: 0.1,
    },
    anchors: Object.fromEntries(CRITERIA.map((c) => [c, anchor])),
    fit: {
      sectors: ['agritech'],
      stages: ['seed'],
      fundingMinIdr: 1_000_000_000,
      fundingMaxIdr: 2_000_000_000,
    },
    thresholds: {
      sangatLayak: 85,
      layakBersyarat: 75,
      perluPenyesuaian: 65,
      risikoTinggi: 50,
    },
    models: { penilai: 'm', ringkasan: 'm', insight: 'm', asisten: 'a' },
    changedAt: new Date('2026-10-21T02:00:00Z'),
    reason: 'awal',
  })

describe('rubric levels in the draft', () => {
  it('sends all five levels of every criterion', () => {
    const { rules, errors } = checkDraft(draftFromRules(stored(five)), 90)
    expect(errors).toEqual({})
    for (const c of CRITERIA) expect(rules?.anchors[c]).toEqual(five)
  })

  it('refuses to save rules stored before levels 2 and 4 until they are filled', () => {
    const old = stored({ '1': 'a', '3': 'c', '5': 'e' })
    const draft = draftFromRules(old)
    expect(checkDraft(draft, 90)).toEqual({
      rules: null,
      errors: { patokan: ['Setiap patokan skor 1 sampai 5 wajib diisi.'] },
    })

    const filled = {
      ...draft,
      anchors: Object.fromEntries(
        CRITERIA.map((c) => [c, { ...draft.anchors[c], '2': 'b', '4': 'd' }]),
      ) as Rules['anchors'],
    }
    const { rules } = checkDraft(filled, 90)
    expect(rules?.anchors.dampak).toEqual(five)
    expect(rules && changesRules(rules, old)).toBe(true)
  })

  it('reads an edit to level 2 or 4 as a change', () => {
    const rules = stored(five)
    const draft = draftFromRules(rules)
    draft.anchors.risiko['4'] = 'baru'
    const next = checkDraft(draft, 90).rules!
    expect(changesRules(next, rules)).toBe(true)
  })
})

describe('weight presets', () => {
  it('each sums to exactly 100%', () => {
    for (const preset of WEIGHT_PRESETS) {
      const total = CRITERIA.reduce((sum, c) => sum + preset.percent[c], 0)
      expect(total, preset.label).toBe(100)
    }
  })

  it('Baseline Arunami is the guide weights; Fokus dampak raises dampak above it', () => {
    const [baseline, impact] = WEIGHT_PRESETS
    expect(baseline?.label).toBe('Baseline Arunami')
    expect(baseline?.percent).toEqual(GUIDE_PERCENT)
    expect(impact?.label).toBe('Fokus dampak')
    expect(impact!.percent.dampak).toBeGreaterThan(GUIDE_PERCENT.dampak)
  })

  it('only fills the weights, and the result saves as fractions', () => {
    const rules = stored(five)
    const impact = WEIGHT_PRESETS[1]!
    const draft = withPercent(draftFromRules(rules), impact.percent)
    expect(hasPercent(draft, impact.percent)).toBe(true)
    expect(hasPercent(draft, GUIDE_PERCENT)).toBe(false)
    expect(draft.anchors).toEqual(rules.anchors)
    expect(checkDraft(draft, 90).rules?.weights).toEqual({
      manajemen: 0.2,
      kinerja: 0.15,
      risiko: 0.15,
      rencana: 0.2,
      dampak: 0.3,
    })
  })
})
