import { describe, expect, it } from 'vitest'

import { calibrate, correctionDirection, isCorrected } from './aisa.calibration'
import type { Category, Proposal } from './aisa.schema'

const at = (iso: string) => new Date(iso)

function proposal(
  id: string,
  category: Category | null,
  extra: Partial<Proposal> = {},
): Proposal {
  return {
    id,
    name: id,
    nameLower: id,
    source: { kind: 'form', fileName: `${id}.pdf` },
    consent: true,
    status: category ? 'dinilai' : 'perlu_dicek_manual',
    pageCount: 1,
    category,
    effectiveCategory: extra.correction?.category ?? category,
    responded: extra.response != null,
    tokens: { in: 0, out: 0 },
    createdAt: at('2026-10-01T00:00:00Z'),
    updatedAt: at('2026-10-01T00:00:00Z'),
    ...extra,
  }
}

const correction = (category: Category, iso: string) => ({
  category,
  reason: 'alasan',
  at: at(iso),
  via: 'dashboard' as const,
})
const response = {
  kind: 'undang' as const,
  at: at('2026-10-02T00:00:00Z'),
  via: 'wa' as const,
}

describe('correctionDirection', () => {
  it('reads the CATEGORIES scale best first', () => {
    expect(correctionDirection('perlu_penyesuaian', 'layak_bersyarat')).toBe(
      'naik',
    )
    expect(correctionDirection('sangat_layak', 'tidak_layak')).toBe('turun')
    expect(correctionDirection('layak_bersyarat', 'layak_bersyarat')).toBeNull()
    expect(correctionDirection(null, 'layak_bersyarat')).toBeNull()
  })
})

describe('calibrate', () => {
  it('reports nothing reviewed as no rate, not 0%', () => {
    const result = calibrate([proposal('a', 'layak_bersyarat')])
    expect(result).toMatchObject({
      reviewed: 0,
      agreed: 0,
      agreementPercent: null,
      corrections: [],
    })
  })

  it('counts a tanggapan or a koreksi as reviewed, and only a changed kategori as disagreement', () => {
    const result = calibrate([
      proposal('unreviewed', 'layak_bersyarat'),
      proposal('agreed', 'sangat_layak', { response }),
      proposal('up', 'perlu_penyesuaian', {
        correction: correction('layak_bersyarat', '2026-10-03T00:00:00Z'),
      }),
      proposal('down', 'sangat_layak', {
        response,
        correction: correction('layak_bersyarat', '2026-10-04T00:00:00Z'),
      }),
      // A koreksi back to the AI's own kategori is agreement.
      proposal('same', 'layak_bersyarat', {
        correction: correction('layak_bersyarat', '2026-10-05T00:00:00Z'),
      }),
    ])
    expect(result.reviewed).toBe(4)
    expect(result.agreed).toBe(2)
    expect(result.agreementPercent).toBe(50)
    expect(result.corrections.map((c) => c.proposal.id)).toEqual(['down', 'up'])
    expect(result.naik).toBe(1)
    expect(result.turun).toBe(1)
  })

  it('isCorrected ignores a koreksi equal to the AI kategori', () => {
    expect(isCorrected({ category: 'layak_bersyarat', correction: null })).toBe(
      false,
    )
    expect(
      isCorrected({
        category: 'layak_bersyarat',
        correction: correction('layak_bersyarat', '2026-10-05T00:00:00Z'),
      }),
    ).toBe(false)
  })
})
