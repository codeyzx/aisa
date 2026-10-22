import { describe, expect, it } from 'vitest'

import {
  CATEGORY_ACTION,
  categoryText,
  CRITERION_LETTER,
  failedFitChecks,
  gradeBands,
  gradeOf,
  historyDetailText,
  responseText,
  sectorLabel,
} from './aisa.labels'
import { CRITERIA, type Thresholds } from './aisa.schema'

const GUIDE: Thresholds = {
  sangatLayak: 85,
  layakBersyarat: 75,
  perluPenyesuaian: 65,
  risikoTinggi: 50,
}

describe('sectorLabel', () => {
  it('capitalises the first letter and the letter after & or /', () => {
    expect(sectorLabel('f&b')).toBe('F&B')
    expect(sectorLabel('F&B')).toBe('F&B')
    expect(sectorLabel('agritech')).toBe('Agritech')
    expect(sectorLabel('health / wellness')).toBe('Health / Wellness')
  })
})

describe('historyDetailText', () => {
  it('rewrites the raw intake shape into display words', () => {
    expect(
      historyDetailText(
        'Proposal Kopi Teras Senja masuk: skor 63.1, tidak_cocok',
      ),
    ).toBe(
      'Proposal Kopi Teras Senja masuk: skor 63,1, Tidak cocok (skala lama)',
    )
    expect(historyDetailText('Proposal A masuk: skor 80, sangat_layak')).toBe(
      'Proposal A masuk: skor 80,0, Sangat layak',
    )
    expect(
      historyDetailText(
        'Proposal A masuk: skor 70.5, perlu_penyesuaian, di luar fokus',
      ),
    ).toBe('Proposal A masuk: skor 70,5, Perlu penyesuaian, di luar fokus')
  })

  it('leaves every other text unchanged', () => {
    for (const text of [
      'Proposal A masuk: skor 63,1, Tidak cocok',
      'Proposal A masuk: skor 70,5, Perlu penyesuaian, di luar fokus',
      'Proposal A masuk: skor 63,1, Tidak cocok, berkualitas di luar fokus',
      'Proposal A masuk: perlu dicek manual (teks terlalu sedikit)',
      'Undang semua cocok: 2 proposal (A, B)',
    ])
      expect(historyDetailText(text)).toBe(text)
  })
})

describe('grades', () => {
  it('grades by the score bands alone, edges inclusive', () => {
    expect(gradeOf(100, GUIDE)).toBe('sangat_layak')
    expect(gradeOf(85, GUIDE)).toBe('sangat_layak')
    expect(gradeOf(84.9, GUIDE)).toBe('layak_bersyarat')
    expect(gradeOf(75, GUIDE)).toBe('layak_bersyarat')
    expect(gradeOf(65, GUIDE)).toBe('perlu_penyesuaian')
    expect(gradeOf(64.9, GUIDE)).toBe('risiko_tinggi')
    expect(gradeOf(50, GUIDE)).toBe('risiko_tinggi')
    expect(gradeOf(49.9, GUIDE)).toBe('tidak_layak')
    expect(gradeOf(0, GUIDE)).toBe('tidak_layak')
  })

  it('writes the bands as the guide does, from the thresholds', () => {
    expect(gradeBands(GUIDE).map((b) => [b.category, b.text])).toEqual([
      ['sangat_layak', '85–100'],
      ['layak_bersyarat', '75–84'],
      ['perlu_penyesuaian', '65–74'],
      ['risiko_tinggi', '50–64'],
      ['tidak_layak', '< 50'],
    ])
    expect(gradeBands({ ...GUIDE, sangatLayak: 90 })[0]!.text).toBe('90–100')
  })

  it('names the action for each grade', () => {
    expect(CATEGORY_ACTION.tidak_layak).toBe('Sebaiknya ditolak')
    expect(CATEGORY_ACTION.sangat_layak).toBe('Lanjutkan investasi')
  })

  it('labels a legacy kategori as the old scale and an unknown value raw', () => {
    expect(categoryText('risiko_tinggi')).toBe('Risiko tinggi')
    expect(categoryText('cocok')).toBe('Cocok (skala lama)')
    expect(categoryText('sangat_cocok')).toBe('Sangat cocok (skala lama)')
    expect(categoryText('lain')).toBe('lain')
  })

  it('letters the criteria A–E in order', () => {
    expect(CRITERIA.map((c) => CRITERION_LETTER[c]).join('')).toBe('ABCDE')
  })
})

describe('failedFitChecks', () => {
  it('lists only the failed checks, labelled', () => {
    expect(
      failedFitChecks({
        passed: false,
        checks: {
          sector: { passed: false, reason: 'f&b di luar sektor fokus' },
          stage: { passed: true, reason: 'tahap seed sesuai' },
          funding: { passed: false, reason: 'tidak disebut' },
        },
      }),
    ).toEqual(['Sektor: f&b di luar sektor fokus', 'Dana: tidak disebut'])
    expect(failedFitChecks(null)).toEqual([])
  })
})

describe('responseText', () => {
  it('names a current decision, marks an earlier-scale one, keeps an unknown raw', () => {
    expect(responseText('setuju')).toBe('Setuju')
    expect(responseText('tolak')).toBe('Tolak')
    expect(responseText('undang')).toBe('Undang (lama)')
    expect(responseText('pantau')).toBe('Pantau (lama)')
    expect(responseText('arsipkan')).toBe('Arsipkan (lama)')
    expect(responseText('nanti')).toBe('nanti')
  })
})
