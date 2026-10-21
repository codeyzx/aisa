// Display helpers shared by the Aturan penilaian cards and the edit dialog.

import type { Category, Criterion, Rules } from '@/features/aisa/aisa.schema'
import { formatDecimal } from '@/lib/format/number'

/**
 * What the Penilai counts as strong evidence per criterion — a short form of
 * `HARD_EVIDENCE` in `services/api/aisa/penilai.py`, the prompt that scores.
 */
export const CRITERION_EVIDENCE: Record<Criterion, string> = {
  tim: 'Rekam jejak founder: perusahaan sebelumnya, jabatan, lama, dan capaian berangka.',
  pasar: 'Masalah dan ukuran pasar didukung data bersumber dan berperiode.',
  produk:
    'Produk sudah dipakai dengan hasil terukur, atau keunggulan yang dibuktikan.',
  traksi:
    'Angka pengguna, pendapatan, atau retensi berperiode, dan pelanggan bernama.',
  bisnis:
    'Pendapatan aktual, margin, dan unit ekonomi berperiode; proyeksi saja tidak cukup.',
}

/** A weight fraction as the percent the manager reads: 0.275 → 27.5. */
export const toPercent = (weight: number) => Math.round(weight * 10000) / 100

/** `27,5` — percent or points with at most one decimal. */
export const num = (n: number) => formatDecimal(n, { max: 1 })

/**
 * Each kategori in one sentence, as `categorize` in scoring.py decides it: a
 * failed cek fokus always lands in Tidak cocok, and Sangat cocok also needs no
 * criterion at nilai 1.
 */
export function categoryRule(
  category: Category,
  t: Rules['thresholds'],
): { range: string; rule: string } {
  switch (category) {
    case 'sangat_cocok':
      return {
        range: `≥ ${num(t.sangatCocok)}`,
        rule: `Skor minimal ${num(t.sangatCocok)}, lolos ketiga cek fokus, dan tidak ada kriteria bernilai 1.`,
      }
    case 'cocok':
      return {
        range: `≥ ${num(t.cocok)}`,
        rule: `Skor minimal ${num(t.cocok)} dan lolos ketiga cek fokus.`,
      }
    case 'kurang_cocok':
      return {
        range: `≥ ${num(t.kurangCocok)}`,
        rule: `Skor minimal ${num(t.kurangCocok)} dan lolos ketiga cek fokus.`,
      }
    case 'tidak_cocok':
      return {
        range: `< ${num(t.kurangCocok)}`,
        rule: `Skor di bawah ${num(t.kurangCocok)}, atau gagal salah satu cek fokus.`,
      }
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
