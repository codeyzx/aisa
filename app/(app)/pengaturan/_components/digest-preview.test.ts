import { describe, expect, it } from 'vitest'

import type { Category, Proposal } from '@/features/aisa/aisa.schema'

import { buildDigestPreview, digestLines } from './digest-preview'

const check = (passed: boolean) => ({ passed, reason: 'x' })

function proposal(
  name: string,
  grade: Category | null,
  score: number,
  { inFocus = true, responded = false } = {},
): Proposal {
  return {
    id: name,
    name,
    status: grade ? 'dinilai' : 'perlu_dicek_manual',
    effectiveCategory: grade,
    responded,
    profile: { sector: 'agritech', fundingAskIdr: 5_000_000_000 },
    fit: {
      passed: inFocus,
      checks: {
        sector: check(inFocus),
        stage: check(true),
        funding: check(true),
      },
    },
    assessment: grade
      ? {
          criteria: {
            manajemen: {
              value: 5,
              reason: 'Tim berpengalaman.',
              notMentioned: false,
              citations: [],
              citationsUnverified: false,
            },
          },
          score,
          rulesVersion: 1,
          model: 'm',
        }
      : null,
  } as unknown as Proposal
}

describe('digest preview', () => {
  it('mirrors the template: per grade, out-of-focus marked and ranked after', () => {
    const preview = buildDigestPreview([
      proposal('Luar', 'sangat_layak', 95, { inFocus: false }),
      proposal('Dalam', 'sangat_layak', 86),
      proposal('Syarat', 'layak_bersyarat', 80),
      proposal('Sesuai', 'perlu_penyesuaian', 70, { inFocus: false }),
      proposal('Risiko', 'risiko_tinggi', 55),
      proposal('Tolak', 'tidak_layak', 20),
      proposal('Sudah', 'tidak_layak', 20, { responded: true }),
      proposal('Manual', null, 0),
    ])
    expect(preview.pending).toBe(7)
    expect(preview.outOfFocus).toBe(2)
    expect(digestLines(preview)).toEqual([
      '*Sangat layak (2)*',
      '1. Dalam (agritech, Rp5 M) · 86. Tim berpengalaman.',
      '2. Luar (agritech, Rp5 M) · 95 (di luar fokus). Tim berpengalaman.',
      '*Layak bersyarat (1)*: Syarat (80)',
      '*Perlu penyesuaian (1)*: Sesuai (70) (di luar fokus)',
      '*Risiko tinggi (1)*',
      '*Tidak layak (1)*',
      '2 di antaranya di luar fokus (sektor, tahap, atau dana): prioritas rendah.',
      '*Perlu dicek manual (1)*: Manual',
    ])
  })

  it('writes an empty grade with its count only and no focus line', () => {
    expect(digestLines(buildDigestPreview([]))).toEqual([
      '*Sangat layak (0)*',
      '*Layak bersyarat (0)*',
      '*Perlu penyesuaian (0)*',
      '*Risiko tinggi (0)*',
      '*Tidak layak (0)*',
    ])
  })
})
