// Display helpers shared by the Aturan penilaian cards and the edit dialog.

import { gradeBands } from '@/features/aisa/aisa.labels'
import type { Category, Rules } from '@/features/aisa/aisa.schema'
import { formatDecimal } from '@/lib/format/number'

/** A weight fraction as the percent the manager reads: 0.275 → 27.5. */
export const toPercent = (weight: number) => Math.round(weight * 10000) / 100

/** `27,5` — percent or points with at most one decimal. */
export const num = (n: number) => formatDecimal(n, { max: 1 })

/**
 * Each grade's score band: `range` as the guide writes it ("75–84"), and `rule`
 * as one exact sentence, as `categorize` in scoring.py decides it (84,9 is still
 * below 85). By score alone — cek fokus never changes the grade.
 */
export function categoryRule(
  category: Category,
  t: Rules['thresholds'],
): { range: string; rule: string } {
  const band = gradeBands(t).find((b) => b.category === category)!
  if (band.below == null)
    return {
      range: band.text,
      rule: `Skor ${num(band.min)} atau lebih.`,
    }
  if (category === 'tidak_layak')
    return {
      range: band.text,
      rule: `Skor di bawah ${num(band.below)}.`,
    }
  return {
    range: band.text,
    rule: `Skor minimal ${num(band.min)}, di bawah ${num(band.below)}.`,
  }
}

/** "Rp2 miliar", "Rp750 juta", "Rp1,5 triliun". */
export function miliar(n: number): string {
  if (n >= 1_000_000_000_000)
    return `Rp${formatDecimal(n / 1_000_000_000_000, { max: 1 })} triliun`
  if (n >= 1_000_000_000)
    return `Rp${formatDecimal(n / 1_000_000_000, { max: 1 })} miliar`
  return `Rp${formatDecimal(n / 1_000_000, { max: 0 })} juta`
}

/** The tab the edit dialog opens on. */
export type RulesTab = 'bobot' | 'batas' | 'fokus' | 'patokan' | 'lanjutan'
