import { describe, expect, it } from 'vitest'

import type { Category, Proposal } from '@/features/aisa/aisa.schema'

import {
  buildWeeklyPreview,
  fmtRange,
  percent,
  weeklyLines,
  weekStart,
} from './weekly-preview'

// The same instants as services/api/tests/test_digest_weekly.py, so the two
// mirrors are checked against one set of expected lines.
const FRIDAY = new Date('2026-10-23T10:00:00Z') // Jumat 17.00 WIB
const MONDAY = new Date('2026-10-18T17:00:00Z') // Senin 19 Oktober 00.00 WIB
const DAY = 86_400_000

const check = (passed: boolean) => ({ passed, reason: 'x' })

function row(
  id: string,
  daysAfterMonday: number,
  {
    sector = null as string | null,
    status = 'dinilai' as Proposal['status'],
    category = 'perlu_penyesuaian' as Category,
    score = 70,
    luar = false,
    kind = null as 'setuju' | 'tolak' | null,
    decidedDays = null as number | null,
  } = {},
): Proposal {
  const assessed = status === 'dinilai'
  return {
    id,
    name: id.toUpperCase(),
    status,
    createdAt: new Date(MONDAY.getTime() + daysAfterMonday * DAY),
    effectiveCategory: assessed ? category : null,
    responded: kind !== null,
    response: kind
      ? {
          kind,
          at: new Date(MONDAY.getTime() + (decidedDays ?? 0) * DAY),
          via: 'dashboard',
        }
      : null,
    profile: { sector },
    fit: {
      passed: !luar,
      checks: {
        sector: check(!luar),
        stage: check(true),
        funding: check(true),
      },
    },
    assessment: assessed ? { score, criteria: {} } : null,
  } as unknown as Proposal
}

describe('weekly preview', () => {
  it('starts the week on Monday 00.00 WIB and words the range', () => {
    expect(weekStart(FRIDAY).toISOString()).toBe(MONDAY.toISOString())
    // Sunday 23.30 WIB is still the week that began the Monday before.
    expect(weekStart(new Date('2026-10-25T16:30:00Z')).toISOString()).toBe(
      MONDAY.toISOString(),
    )
    expect(fmtRange(MONDAY, FRIDAY)).toBe('19–23 Oktober 2026')
    expect(
      fmtRange(
        new Date('2026-11-29T17:00:00Z'),
        new Date('2026-12-04T10:00:00Z'),
      ),
    ).toBe('30 November – 4 Desember 2026')
  })

  it('rounds percent half up', () => {
    expect([
      percent(4, 10),
      percent(1, 8),
      percent(3, 8),
      percent(2, 3),
    ]).toEqual([40, 13, 38, 67])
  })

  it('shares the top three sectors of every new proposal, ties by label', () => {
    const st = buildWeeklyPreview(
      [
        ...[0, 1, 2].map((i) => row(`f${i}`, 1, { sector: 'f&b' })),
        ...[0, 1].map((i) => row(`a${i}`, 2, { sector: 'Agritech' })),
        row('e', 3, { sector: 'edtech' }),
        row('c', 3, { sector: 'climate' }),
        row('x', 0, { status: 'antre' }),
      ],
      FRIDAY,
    )
    expect(weeklyLines(st)).toContain(
      '*Sektor*: F&B 38% (3 dari 8) · Agritech 25% (2 dari 8) · Climate 13% (1 dari 8) · tanpa sektor 1',
    )
  })

  it('mirrors the template for grades, focus, average and change vs last week', () => {
    const st = buildWeeklyPreview(
      [
        row('s', 0, { category: 'sangat_layak', score: 90 }),
        row('l', 1, { category: 'layak_bersyarat', score: 80, luar: true }),
        row('r', 2, { category: 'risiko_tinggi', score: 55 }),
        row('m', 3, { status: 'perlu_dicek_manual' }),
        row('w1', -6, { category: 'layak_bersyarat', score: 76 }),
        row('w2', -1, { category: 'tidak_layak', score: 40 }),
        row('old', -8, { category: 'sangat_layak', score: 99 }),
        row('d1', -8, { kind: 'setuju', decidedDays: 1 }),
        row('d2', -8, { kind: 'tolak', decidedDays: 2 }),
        row('d3', -8, { kind: 'tolak', decidedDays: -1 }),
      ],
      FRIDAY,
    )
    expect(weeklyLines(st)).toEqual([
      'Selamat sore, Pak. Ini ringkasan mingguan AISA, 19–23 Oktober 2026.',
      '*Proposal masuk*: 4 (minggu lalu 2, naik 2)',
      '*Sektor*: tanpa sektor 4',
      '*Grade* (3 dinilai): Sangat layak 1 · Layak bersyarat 1 · Perlu penyesuaian 0 · Risiko tinggi 1 · Tidak layak 0',
      'Sangat layak + Layak bersyarat: 2 · di luar fokus: 33% (1 dari 3)',
      '*Rata-rata skor*: 75 (minggu lalu 58, naik 17)',
      '*Keputusan minggu ini*: Setuju 1 · Tolak 1',
      'Menunggu keputusan: 7 (terlama 12 hari)',
      '*Top 3 minggu ini*',
      '1. S · Sangat layak · 90',
      '2. L · Layak bersyarat · 80 (di luar fokus)',
      '3. R · Risiko tinggi · 55',
      '*Perlu dicek manual*: 1',
    ])
  })

  it('says so when nothing came in this week', () => {
    const lines = weeklyLines(buildWeeklyPreview([], FRIDAY))
    expect(lines).toEqual([
      'Selamat sore, Pak. Ini ringkasan mingguan AISA, 19–23 Oktober 2026.',
      '*Proposal masuk*: 0 (minggu lalu 0, sama)',
      '*Sektor*: belum ada proposal masuk',
      '*Grade*: belum ada yang dinilai',
      '*Rata-rata skor*: belum ada yang dinilai',
      '*Keputusan minggu ini*: Setuju 0 · Tolak 0',
      'Menunggu keputusan: 0',
      '*Top 3 minggu ini*: belum ada',
      '*Perlu dicek manual*: 0',
    ])
  })
})
