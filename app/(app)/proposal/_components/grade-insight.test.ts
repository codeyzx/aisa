import { describe, expect, it } from 'vitest'

import type {
  Criterion,
  CriterionAssessment,
  Rules,
} from '@/features/aisa/aisa.schema'

import { gradeInsight } from './grade-insight'

const item = (
  value: number,
  fields: Partial<CriterionAssessment> = {},
): CriterionAssessment => ({
  value,
  reason: `Alasan nilai ${value}.`,
  notMentioned: false,
  citations: [{ page: value + 1, quote: 'kutipan' }],
  citationsUnverified: false,
  ...fields,
})

const all = (values: Record<Criterion, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, item(v)]),
  ) as Record<Criterion, CriterionAssessment>

const WEIGHTS: Rules['weights'] = {
  manajemen: 0.25,
  kinerja: 0.2,
  risiko: 0.2,
  rencana: 0.25,
  dampak: 0.1,
}

describe('gradeInsight', () => {
  it('returns null when there are no criteria, so the caller falls back', () => {
    expect(gradeInsight('tidak_layak', {})).toBeNull()
  })

  it('Sangat layak with nothing weak shows its three strongest criteria', () => {
    const insight = gradeInsight(
      'sangat_layak',
      all({ manajemen: 5, kinerja: 5, risiko: 4, rencana: 5, dampak: 4 }),
      WEIGHTS,
    )
    expect(insight).toEqual({
      summary: 'Bukti kuat di 5 dari 5 kriteria, tanpa kriteria yang lemah.',
      points: [
        // 5s tie; the heavier weight (25%) wins, then A–E order.
        {
          criterion: 'manajemen',
          tone: 'strong',
          text: 'Tim manajemen 5/5 — Alasan nilai 5 (hal. 6)',
        },
        {
          criterion: 'rencana',
          tone: 'strong',
          text: 'Rencana & imbal hasil 5/5 — Alasan nilai 5 (hal. 6)',
        },
        {
          criterion: 'kinerja',
          tone: 'strong',
          text: 'Kinerja bisnis 5/5 — Alasan nilai 5 (hal. 6)',
        },
      ],
    })
  })

  it('Sangat layak still names what holds it back', () => {
    const insight = gradeInsight(
      'sangat_layak',
      all({ manajemen: 5, kinerja: 5, risiko: 5, rencana: 5, dampak: 2 }),
    )!
    expect(insight.summary).toBe(
      'Bukti kuat di 4 dari 5 kriteria, tetapi 1 kriteria masih lemah.',
    )
    expect(insight.points.map((p) => [p.criterion, p.tone])).toEqual([
      ['manajemen', 'strong'],
      ['kinerja', 'strong'],
      ['dampak', 'weak'],
    ])
  })

  it('Layak bersyarat leads with the conditions, then one strength', () => {
    const insight = gradeInsight(
      'layak_bersyarat',
      all({ manajemen: 5, kinerja: 4, risiko: 3, rencana: 4, dampak: 3 }),
      WEIGHTS,
    )!
    expect(insight.summary).toBe(
      '3 dari 5 kriteria sudah kuat. Syaratnya: bagian yang masih kurang perlu dipenuhi dulu.',
    )
    // risiko and dampak tie at 3; risiko weighs 20% against dampak's 10%.
    expect(insight.points.map((p) => [p.criterion, p.tone])).toEqual([
      ['risiko', 'weak'],
      ['dampak', 'weak'],
      ['manajemen', 'strong'],
    ])
  })

  it('Perlu penyesuaian counts every criterion below 4', () => {
    const insight = gradeInsight(
      'perlu_penyesuaian',
      all({ manajemen: 4, kinerja: 3, risiko: 3, rencana: 4, dampak: 2 }),
    )!
    expect(insight.summary).toBe(
      'Ada yang menjanjikan, tetapi 3 dari 5 kriteria belum cukup kuat dan perlu disesuaikan.',
    )
    expect(insight.points.map((p) => p.criterion)).toEqual([
      'dampak',
      'kinerja',
      'manajemen',
    ])
  })

  it('Risiko tinggi with no weak criterion says none is strong', () => {
    const insight = gradeInsight(
      'risiko_tinggi',
      all({ manajemen: 3, kinerja: 3, risiko: 3, rencana: 3, dampak: 3 }),
      WEIGHTS,
    )!
    expect(insight.summary).toBe(
      'Belum ada kriteria yang kuat: 5 dari 5 kriteria bernilai 3 atau kurang.',
    )
    // All tie at 3: by weight (25, 25, 20), then A–E order.
    expect(insight.points.map((p) => p.criterion)).toEqual([
      'manajemen',
      'rencana',
      'kinerja',
    ])
    expect(insight.points.every((p) => p.tone === 'weak')).toBe(true)
  })

  it('Tidak layak names up to three weakest, not mentioned first among equals', () => {
    const criteria = all({
      manajemen: 2,
      kinerja: 1,
      risiko: 2,
      rencana: 1,
      dampak: 4,
    })
    criteria.rencana = item(1, { notMentioned: true, citations: [] })
    const insight = gradeInsight('tidak_layak', criteria, WEIGHTS)!
    expect(insight.summary).toBe(
      '4 dari 5 kriteria lemah atau tidak dibahas, jadi buktinya belum cukup untuk dipertimbangkan.',
    )
    expect(insight.points.map((p) => p.text)).toEqual([
      'Rencana & imbal hasil 1/5 — tidak disebut di deck',
      'Kinerja bisnis 1/5 — Alasan nilai 1 (hal. 2)',
      'Tim manajemen 2/5 — Alasan nilai 2 (hal. 3)',
    ])
  })

  it('Risiko tinggi says the risk is high when criteria are weak', () => {
    const insight = gradeInsight(
      'risiko_tinggi',
      all({ manajemen: 2, kinerja: 3, risiko: 2, rencana: 4, dampak: 3 }),
    )!
    expect(insight.summary).toBe(
      '2 dari 5 kriteria lemah atau tidak dibahas, jadi risikonya tinggi.',
    )
  })

  it('writes a point without pages, or flags a quote it could not find', () => {
    const insight = gradeInsight('tidak_layak', {
      kinerja: item(2, { citations: [], reason: 'Baru uji coba kecil.' }),
      risiko: item(2, {
        citations: [],
        citationsUnverified: true,
        reason: 'Pesaing banyak.',
      }),
    })!
    expect(insight.points.map((p) => p.text)).toEqual([
      'Kinerja bisnis 2/5 — Baru uji coba kecil',
      'Risiko & tren makro 2/5 — Pesaing banyak (kutipannya tidak ditemukan di deck)',
    ])
  })

  it('lists each quoted page once, in order, and keeps the reason to one sentence', () => {
    const insight = gradeInsight('tidak_layak', {
      kinerja: item(2, {
        reason: 'Hanya klaim umum. Tidak ada angka pengguna sama sekali.',
        citations: [
          { page: 7, quote: 'a' },
          { page: 3, quote: 'b' },
          { page: 7, quote: 'c' },
        ],
      }),
    })!
    expect(insight.points[0]!.text).toBe(
      'Kinerja bisnis 2/5 — Hanya klaim umum (hal. 3, 7)',
    )
  })

  it('cuts a long sentence at a word boundary', () => {
    const reason = `${'kata '.repeat(40)}akhir.`
    const text = gradeInsight('tidak_layak', {
      kinerja: item(2, { reason, citations: [] }),
    })!.points[0]!.text
    expect(text.endsWith('kata…')).toBe(true)
    expect(text.length).toBeLessThan(150)
  })

  it('a corrected grade with no criterion below 4 says so', () => {
    const insight = gradeInsight(
      'perlu_penyesuaian',
      all({ manajemen: 4, kinerja: 4, risiko: 5, rencana: 4, dampak: 4 }),
    )!
    expect(insight.summary).toBe('Semua 5 kriteria bernilai 4 atau 5.')
    expect(insight.points).toEqual([
      expect.objectContaining({ criterion: 'risiko', tone: 'strong' }),
      expect.objectContaining({ criterion: 'manajemen', tone: 'strong' }),
      expect.objectContaining({ criterion: 'kinerja', tone: 'strong' }),
    ])
  })

  it('Risiko tinggi held down by one criterion names it and shows what holds up', () => {
    const insight = gradeInsight(
      'risiko_tinggi',
      all({ manajemen: 4, kinerja: 4, risiko: 1, rencana: 4, dampak: 4 }),
      WEIGHTS,
    )!
    expect(insight.summary).toBe(
      'Risiko & tren makro hanya 1/5 dan menarik skor turun, jadi risikonya tinggi, meski 4 dari 5 kriteria sudah kuat.',
    )
    expect(insight.points.map((p) => [p.criterion, p.tone])).toEqual([
      ['risiko', 'weak'],
      ['manajemen', 'strong'],
      ['rencana', 'strong'],
    ])
  })
})

describe('gradeInsight with an API downgrade note', () => {
  it('leaves the parenthesised note out of the point', () => {
    const insight = gradeInsight('tidak_layak', {
      risiko: item(2, {
        citations: [],
        citationsUnverified: true,
        reason:
          'Risiko disebut. (nilai diturunkan dari 4 ke 2: 1 dari 1 kutipan tidak ditemukan di halaman yang disebut)',
      }),
    })!
    expect(insight.points[0]!.text).toBe(
      'Risiko & tren makro 2/5 — Risiko disebut (kutipannya tidak ditemukan di deck)',
    )
  })
})
