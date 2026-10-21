import { describe, expect, it } from 'vitest'

import { HISTORY_ACTION_LABEL, JOB_KIND_LABEL, labelOf } from './aisa.labels'
import {
  CriterionAssessmentSchema,
  DigestSchema,
  HistorySchema,
  JobSchema,
  RulesSchema,
} from './aisa.schema'

const at = new Date('2026-10-21T02:00:00Z')

const job = {
  id: 'j1',
  kind: 'penilaian',
  agent: 'Penilai',
  title: 'Menilai proposal',
  status: 'selesai',
  startedAt: at,
}

const anchor = { '1': 'a', '3': 'b', '5': 'c' }
const rules = {
  id: 'rules',
  version: 3,
  weights: { tim: 0.2, pasar: 0.2, produk: 0.2, traksi: 0.2, bisnis: 0.2 },
  anchors: {
    tim: anchor,
    pasar: anchor,
    produk: anchor,
    traksi: anchor,
    bisnis: anchor,
  },
  fit: {
    sectors: ['agritech'],
    stages: ['seed'],
    fundingMinIdr: 1,
    fundingMaxIdr: 2,
  },
  thresholds: {
    sangatCocok: 80,
    cocok: 65,
    kurangCocok: 45,
    qualityOutsideFocus: 65,
  },
  models: { penilai: 'm', ringkasan: 'm', insight: 'm', asisten: 'a' },
  changedAt: at,
  reason: 'awal',
}

describe('open enums written by a newer aisa-api', () => {
  it('parses a job kind this build does not know, and labels it raw', () => {
    const parsed = JobSchema.parse({ ...job, kind: 'arsip_bulanan' })
    expect(parsed.kind).toBe('arsip_bulanan')
    expect(labelOf(JOB_KIND_LABEL, parsed.kind)).toBe('arsip_bulanan')
  })

  it('labels the known kinds and actions in Indonesian', () => {
    expect(
      labelOf(
        JOB_KIND_LABEL,
        JobSchema.parse({ ...job, kind: 'retensi' }).kind,
      ),
    ).toBe('Retensi')
    const row = HistorySchema.parse({
      id: 'h1',
      at,
      via: 'dashboard',
      action: 'proposal_dihapus',
      detail: 'Data proposal dihapus',
    })
    expect(labelOf(HISTORY_ACTION_LABEL, row.action)).toBe('Proposal dihapus')
  })

  it('does not treat an inherited property name as a known label', () => {
    expect(labelOf(HISTORY_ACTION_LABEL, 'toString')).toBe('toString')
  })
})

describe('rules', () => {
  it('defaults retention to 90 days and strips the retired orchestrator model', () => {
    const parsed = RulesSchema.parse({
      ...rules,
      models: { ...rules.models, orchestrator: 'lama' },
    })
    expect(parsed.retentionDays).toBe(90)
    expect(parsed.models).toEqual(rules.models)
  })

  it('refuses a retention below one day', () => {
    expect(RulesSchema.safeParse({ ...rules, retentionDays: 0 }).success).toBe(
      false,
    )
  })
})

describe('new optional fields', () => {
  it('defaults citationsUnverified to false', () => {
    const parsed = CriterionAssessmentSchema.parse({
      value: 3,
      reason: 'ok',
      notMentioned: false,
    })
    expect(parsed.citationsUnverified).toBe(false)
  })

  it('reads a digest with and without an insight', () => {
    const digest = {
      id: 'd1',
      slot: '09.00',
      windowStart: at,
      sentAt: at,
      text: 'teks',
      counts: {},
      proposalIds: [],
      usedTemplate: false,
    }
    expect(DigestSchema.parse(digest).insight ?? null).toBeNull()
    expect(DigestSchema.parse({ ...digest, insight: 'naik' }).insight).toBe(
      'naik',
    )
  })
})
