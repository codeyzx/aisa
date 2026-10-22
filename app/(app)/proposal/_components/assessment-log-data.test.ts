import { describe, expect, it } from 'vitest'

import type { JobWithSteps } from '@/features/aisa/aisa.repo'
import type {
  History,
  Proposal,
  Rules,
  Step,
} from '@/features/aisa/aisa.schema'

import { buildAssessmentLog } from './assessment-log-data'

const T0 = new Date('2026-10-22T03:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

let seq = 0
/** A step the way the API records it: `at` is when it ended. */
const step = (
  action: string,
  tool: string,
  endMs: number,
  durationMs: number,
  fields: Partial<Step> = {},
): Step => {
  seq += 1
  return {
    id: String(seq).padStart(3, '0'),
    seq,
    at: at(endMs),
    action,
    tool,
    actor: 'kode',
    tokensIn: 0,
    tokensOut: 0,
    durationMs,
    status: 'ok',
    ...fields,
  }
}

const criterion = (value: number, page: number) => ({
  value,
  reason: `alasan ${value}`,
  notMentioned: false,
  citationsUnverified: false,
  citations: [{ page, quote: `kutipan hal ${page}` }],
})

const proposal = {
  id: 'upload-1',
  name: 'Tani Maju',
  status: 'dinilai',
  pageCount: 10,
  assessment: {
    criteria: {
      manajemen: criterion(5, 2),
      kinerja: criterion(5, 3),
      risiko: criterion(4, 4),
      rencana: criterion(5, 5),
      dampak: criterion(4, 6),
    },
    score: 92.5,
    rulesVersion: 1,
    model: 'gemini-3.8-flash',
  },
  fit: {
    passed: true,
    checks: {
      sector: { passed: true, reason: 'agritech termasuk sektor fokus' },
      stage: { passed: true, reason: 'seed sesuai' },
      funding: { passed: true, reason: 'Rp5 M dalam rentang' },
    },
  },
  category: 'sangat_layak',
} as unknown as Proposal

const rules = {
  version: 1,
  weights: {
    manajemen: 0.25,
    kinerja: 0.2,
    risiko: 0.2,
    rencana: 0.25,
    dampak: 0.1,
  },
  thresholds: {
    sangatLayak: 85,
    layakBersyarat: 75,
    perluPenyesuaian: 65,
    risikoTinggi: 50,
  },
} as unknown as Rules

/** The seven steps `run_intake` records for an uploaded deck. */
function productionJob(): JobWithSteps {
  seq = 0
  return {
    id: 'penilaian-20261022030000-abc123',
    kind: 'penilaian',
    agent: 'Penilai',
    title: 'Menilai proposal Tani Maju',
    model: 'gemini-3.8-flash',
    status: 'selesai',
    startedAt: T0,
    endedAt: at(23_500),
    durationMs: 23_500,
    stepCount: 7,
    tokensIn: 10_100,
    tokensOut: 1_284,
    steps: [
      step('Ekstrak teks per halaman', 'pypdf', 1_800, 1_800),
      step('Cek jumlah teks', 'kode', 1_810, 4),
      step('Menilai 5 kriteria', 'gemini.generate_content', 23_300, 21_400, {
        actor: 'model',
        model: 'gemini-3.8-flash',
        tokensIn: 10_100,
        tokensOut: 1_284,
      }),
      step('Hitung skor', 'kode', 23_305, 3),
      step('Cek kecocokan', 'kode', 23_310, 2),
      step('Tentukan grade', 'kode', 23_312, 1),
      step('Simpan hasil penilaian', 'firestore', 23_460, 140),
    ],
  }
}

describe('buildAssessmentLog', () => {
  it('reads the real tool names: criteria, score, fit and grade rincian render', () => {
    const log = buildAssessmentLog(productionJob(), proposal, [], rules)
    expect(log.steps.map((s) => s.detail?.type ?? null)).toEqual([
      null,
      null,
      'criteria',
      'score',
      'fit',
      'category',
      null,
    ])
    expect(log.steps.map((s) => s.by)).toEqual([
      'sistem',
      'sistem',
      'ai',
      'sistem',
      'sistem',
      'sistem',
      'sistem',
    ])
    expect(log.counts).toEqual({ ai: 1, sistem: 6, manajer: 0 })
    expect(log.model).toBe('gemini-3.8-flash')
    expect(log.tokens).toBe(11_384)
  })

  it('explains each step in plain words and says what it concluded', () => {
    const [ekstrak, cek, nilai, skor, fokus, grade] = buildAssessmentLog(
      productionJob(),
      proposal,
      [],
      rules,
    ).steps
    expect(ekstrak).toMatchObject({
      title: 'Membaca teks tiap halaman',
      result: '10 halaman',
      recorded: 'Ekstrak teks per halaman · pypdf',
    })
    expect(cek?.result).toBe('Teks cukup')
    expect(nilai).toMatchObject({
      title: 'AI menilai 5 kriteria',
      result: '5 kriteria, 5 kutipan',
      tokens: 11_384,
    })
    expect(nilai?.explain).toContain('nilai 1–5')
    expect(skor?.result).toBe('Skor 92,5')
    expect(fokus?.result).toBe('3 dari 3 syarat terpenuhi')
    expect(grade).toMatchObject({
      title: 'Menentukan grade',
      result: 'Sangat layak',
    })
    expect(grade?.detail).toMatchObject({
      type: 'category',
      category: 'sangat_layak',
      outsideFocus: false,
    })
  })

  it('still reads a job recorded before the step was renamed', () => {
    const job = productionJob()
    const old = job.steps.map((s) =>
      s.action === 'Tentukan grade' ? { ...s, action: 'Tentukan kategori' } : s,
    )
    const grade = buildAssessmentLog(
      { ...job, steps: old },
      proposal,
      [],
      rules,
    ).steps[5]
    expect(grade).toMatchObject({
      title: 'Menentukan grade',
      recorded: 'Tentukan kategori · kode',
    })
  })

  it('times each step from its start: recorded end minus its duration', () => {
    const log = buildAssessmentLog(productionJob(), proposal, [], rules)
    expect(log.steps[0]!.startedAt).toEqual(T0)
    expect(log.steps[2]!.startedAt).toEqual(at(1_900))
    expect(log.durationMs).toBe(23_500)
  })

  it('gives no rincian to a failed attempt, only to the retry that succeeded', () => {
    const job = productionJob()
    job.steps.splice(
      2,
      1,
      step('Menilai 5 kriteria', 'gemini.generate_content', 9_000, 7_000, {
        actor: 'model',
        status: 'gagal',
        error: 'format tidak valid',
      }),
      step(
        'Menilai 5 kriteria (ulang)',
        'gemini.generate_content',
        23_300,
        14_000,
        {
          actor: 'model',
        },
      ),
    )
    const [, , first, retry] = buildAssessmentLog(
      job,
      proposal,
      [],
      rules,
    ).steps
    expect(first).toMatchObject({ detail: null, error: 'format tidak valid' })
    expect(retry?.title).toBe('AI menilai 5 kriteria (ulang)')
    expect(retry?.detail?.type).toBe('criteria')
  })

  it('says a deck ended at Cek jumlah teks had too little text', () => {
    const job = productionJob()
    job.steps = job.steps.slice(0, 2)
    const manual = {
      ...proposal,
      status: 'perlu_dicek_manual',
      assessment: null,
      fit: null,
      category: null,
    } as Proposal
    const log = buildAssessmentLog(job, manual, [], rules)
    expect(log.steps[1]?.result).toBe('Teks terlalu sedikit')
    expect(log.counts.ai).toBe(0)
  })

  it('says a scanned deck read as images had too little text, then enough', () => {
    const job = productionJob()
    job.steps.splice(
      2,
      0,
      step('Baca teks dari gambar', 'gemini.generate_content', 9_000, 7_000, {
        actor: 'model',
        model: 'gemini-3.8-flash',
        tokensIn: 5_000,
        tokensOut: 800,
      }),
    )
    const log = buildAssessmentLog(job, proposal, [], rules)
    const [, cek, gambar, nilai] = log.steps
    expect(cek?.result).toBe('Teks terlalu sedikit')
    expect(gambar).toMatchObject({
      by: 'ai',
      title: 'AI membaca proposal sebagai gambar',
      result: 'Teks terbaca',
      recorded: 'Baca teks dari gambar · gemini.generate_content',
      tokens: 5_800,
      detail: null,
    })
    expect(gambar?.explain).toContain('hasil pindai')
    expect(nilai?.detail?.type).toBe('criteria')
    expect(log.counts).toEqual({ ai: 2, sistem: 6, manajer: 0 })
  })

  it('says a deck still unreadable after the image read ended perlu dicek manual', () => {
    const job = productionJob()
    job.steps = [
      ...job.steps.slice(0, 2),
      step('Baca teks dari gambar', 'gemini.generate_content', 9_000, 7_000, {
        actor: 'model',
      }),
    ]
    const manual = {
      ...proposal,
      status: 'perlu_dicek_manual',
      assessment: null,
      fit: null,
      category: null,
    } as Proposal
    const log = buildAssessmentLog(job, manual, [], rules)
    expect(log.steps.map((s) => s.result)).toEqual([
      '10 halaman',
      'Teks terlalu sedikit',
      'Teks tetap terlalu sedikit',
    ])
  })

  it('gives a failed image read no result, only its error', () => {
    const job = productionJob()
    job.steps = [
      ...job.steps.slice(0, 2),
      step('Baca teks dari gambar', 'gemini.generate_content', 9_000, 7_000, {
        actor: 'model',
        status: 'gagal',
        error: 'model tidak menjawab',
      }),
    ]
    const manual = {
      ...proposal,
      status: 'perlu_dicek_manual',
      assessment: null,
      fit: null,
      category: null,
    } as Proposal
    const [, cek, gambar] = buildAssessmentLog(job, manual, [], rules).steps
    expect(cek?.result).toBe('Teks terlalu sedikit')
    expect(gambar).toMatchObject({
      result: null,
      status: 'gagal',
      error: 'model tidak menjawab',
    })
  })

  it('omits category thresholds that changed since scoring', () => {
    const log = buildAssessmentLog(productionJob(), proposal, [], {
      ...rules,
      version: 2,
    })
    const detail = log.steps[5]!.detail
    expect(detail).toMatchObject({ type: 'category', thresholds: null })
    expect(log.steps[3]!.detail).toMatchObject({
      type: 'score',
      versions: [1, 2],
    })
  })

  it('puts the manager’s decisions after the assessment, oldest first', () => {
    const history: History[] = [
      {
        id: 'b',
        at: at(90_000),
        via: 'dashboard',
        action: 'tanggapan',
        proposalId: 'upload-1',
        detail: 'Tani Maju: setuju',
      },
      {
        id: 'a',
        at: at(60_000),
        via: 'wa',
        action: 'koreksi',
        proposalId: 'upload-1',
        reason: 'Traksi kuat',
        detail: 'Grade Tani Maju dikoreksi',
      },
      {
        id: 'c',
        at: at(1_000),
        via: 'sistem',
        action: 'proposal_masuk',
        proposalId: 'upload-1',
        detail: 'Proposal Tani Maju masuk',
      },
    ]
    const log = buildAssessmentLog(productionJob(), proposal, history, rules)
    expect(log.after.map((s) => [s.title, s.by])).toEqual([
      ['Koreksi grade', 'manajer'],
      ['Tanggapan', 'manajer'],
    ])
    expect(log.after[0]!.result).toBe(
      'Grade Tani Maju dikoreksi. Alasan: “Traksi kuat”',
    )
    expect(log.counts.manajer).toBe(2)
  })
})
