import { describe, expect, it } from 'vitest'

import { HISTORY_ACTION_LABEL, JOB_KIND_LABEL, labelOf } from './aisa.labels'
import { compareByGrade } from './aisa.ranking'
import {
  CriterionAssessmentSchema,
  DailyStatsSchema,
  DigestSchema,
  HistorySchema,
  isOutsideFocus,
  JobSchema,
  type Proposal,
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
  weights: {
    manajemen: 0.25,
    kinerja: 0.2,
    risiko: 0.2,
    rencana: 0.25,
    dampak: 0.1,
  },
  anchors: {
    manajemen: anchor,
    kinerja: anchor,
    risiko: anchor,
    rencana: anchor,
    dampak: anchor,
  },
  fit: {
    sectors: ['agritech'],
    stages: ['seed'],
    fundingMinIdr: 1,
    fundingMaxIdr: 2,
  },
  thresholds: {
    sangatLayak: 85,
    layakBersyarat: 75,
    perluPenyesuaian: 65,
    risikoTinggi: 50,
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

  it('parses and labels the re-grade row with its old kategori', () => {
    const row = HistorySchema.parse({
      id: 'h2',
      at,
      via: 'sistem',
      action: 'dinilai_ulang',
      before: 'cocok',
      after: 'perlu_penyesuaian',
      detail: 'Tani Maju dinilai ulang dengan skala baru',
    })
    expect(labelOf(HISTORY_ACTION_LABEL, row.action)).toBe('Dinilai ulang')
    expect(row.before).toBe('cocok')
  })

  it('does not treat an inherited property name as a known label', () => {
    expect(labelOf(HISTORY_ACTION_LABEL, 'toString')).toBe('toString')
  })
})

describe('rules', () => {
  it('refuses the old threshold keys', () => {
    expect(
      RulesSchema.safeParse({
        ...rules,
        thresholds: { sangatCocok: 80, cocok: 65, kurangCocok: 45 },
      }).success,
    ).toBe(false)
  })

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

const digest = {
  id: 'd2',
  slot: '17.00',
  windowStart: at,
  sentAt: at,
  text: 'teks',
  proposalIds: [],
  usedTemplate: true,
}

describe('grade scale change', () => {
  it('reads a ringkasan with the old count keys, current keys at 0', () => {
    const parsed = DigestSchema.parse({
      ...digest,
      counts: { sangat_cocok: 1, cocok: 2, kualitasLuarFokus: 1, baruMasuk: 4 },
    })
    expect(parsed.counts.sangat_layak).toBe(0)
    expect(parsed.counts.luarFokus).toBe(0)
    expect(parsed.counts.baruMasuk).toBe(4)
    expect(parsed.counts).toMatchObject({ sangat_cocok: 1, cocok: 2 })
  })

  it('reads a ringkasan with the new count keys', () => {
    const parsed = DigestSchema.parse({
      ...digest,
      counts: { sangat_layak: 2, tidak_layak: 1, luarFokus: 1 },
    })
    expect(parsed.counts).toMatchObject({
      sangat_layak: 2,
      layak_bersyarat: 0,
      tidak_layak: 1,
      luarFokus: 1,
    })
  })

  it('keeps legacy byCategory keys in dailyStats', () => {
    const parsed = DailyStatsSchema.parse({
      id: '2026-10-01',
      date: '2026-10-01',
      byCategory: { cocok: 2, sangat_layak: 1 },
    })
    expect(parsed.byCategory).toEqual({ cocok: 2, sangat_layak: 1 })
  })
})

const fit = (passed: boolean) => ({
  passed,
  checks: {
    sector: { passed, reason: 'x' },
    stage: { passed: true, reason: 'x' },
    funding: { passed: true, reason: 'x' },
  },
})

describe('focus and ranking', () => {
  const p = (
    name: string,
    grade: Proposal['effectiveCategory'],
    score: number,
    inFocus = true,
  ) => ({
    name,
    effectiveCategory: grade,
    fit: fit(inFocus),
    assessment: { criteria: {}, score, rulesVersion: 1, model: 'm' },
  })

  it('is out of focus only when fit failed', () => {
    expect(isOutsideFocus({ fit: fit(false) })).toBe(true)
    expect(isOutsideFocus({ fit: fit(true) })).toBe(false)
    expect(isOutsideFocus({ fit: null })).toBe(false)
  })

  it('ranks grade first, then in focus, then score', () => {
    const ranked = [
      p('rendah', 'risiko_tinggi', 60),
      p('luar', 'sangat_layak', 95, false),
      p('dalam', 'sangat_layak', 86),
      p('bersyarat', 'layak_bersyarat', 80),
      p('kosong', null, 0),
    ].toSorted(compareByGrade)
    expect(ranked.map((x) => x.name)).toEqual([
      'dalam',
      'luar',
      'bersyarat',
      'rendah',
      'kosong',
    ])
  })
})
