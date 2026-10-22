// Indonesian display words for the AISA enums. `Record<Enum, string>` makes a
// new enum member a compile error until it has a word. The open enums (job kind,
// history action) may also carry a value the API added after this build; those
// render through `labelOf` as their raw value rather than breaking the page.

import { formatDecimal, formatScore } from '@/lib/format/number'

import {
  CATEGORIES,
  CRITERIA,
  LEGACY_CATEGORIES,
  THRESHOLD_KEYS,
  type Category,
  type Criterion,
  type LegacyCategory,
  type Proposal,
  type Thresholds,
  type HistoryAction,
  type JobKind,
  type JobStatus,
  type ProposalStatus,
  type ResponseKind,
  type StepStatus,
  type Via,
} from './aisa.schema'

export const CATEGORY_LABEL: Record<Category, string> = {
  sangat_layak: 'Sangat layak',
  layak_bersyarat: 'Layak bersyarat',
  perlu_penyesuaian: 'Perlu penyesuaian',
  risiko_tinggi: 'Risiko tinggi',
  tidak_layak: 'Tidak layak',
}

/** The recommended next step for each grade ("Aksi"). */
export const CATEGORY_ACTION: Record<Category, string> = {
  sangat_layak: 'Lanjutkan investasi',
  layak_bersyarat: 'Investasi dengan syarat',
  perlu_penyesuaian: 'Sesuaikan dulu sebelum lanjut',
  risiko_tinggi: 'Pertimbangkan menolak',
  tidak_layak: 'Tolak',
}

/** What each grade means, in one plain sentence. */
export const CATEGORY_EXPLANATION: Record<Category, string> = {
  sangat_layak: 'Bukti kuat di hampir semua kriteria; layak diprioritaskan.',
  layak_bersyarat: 'Kuat, tetapi ada beberapa syarat yang perlu dipenuhi dulu.',
  perlu_penyesuaian:
    'Menarik, tetapi rencana atau strukturnya perlu disesuaikan.',
  risiko_tinggi: 'Banyak kelemahan atau bukti kurang.',
  tidak_layak: 'Bukti terlalu lemah untuk dipertimbangkan.',
}

export const LEGACY_CATEGORY_LABEL: Record<LegacyCategory, string> = {
  sangat_cocok: 'Sangat cocok (skala lama)',
  cocok: 'Cocok (skala lama)',
  kurang_cocok: 'Kurang cocok (skala lama)',
  tidak_cocok: 'Tidak cocok (skala lama)',
}

/**
 * A stored kategori value as words, for rows written at any time: a current grade,
 * an old-scale value marked "(skala lama)", or an unknown value as-is.
 */
export function categoryText(value: string): string {
  if (Object.hasOwn(CATEGORY_LABEL, value))
    return CATEGORY_LABEL[value as Category]
  return labelOf(LEGACY_CATEGORY_LABEL, value)
}

export interface GradeBand {
  category: Category
  /** Lowest score of the band; 0 for Tidak layak. */
  min: number
  /** The first score of the band above, or `null` for the top band (up to 100). */
  below: number | null
  /** The band as the guide writes it: "85–100", "75–84", "< 50". */
  text: string
}

const cutoff = (n: number) => formatDecimal(n, { max: 1 })
const bandEdge = (n: number) => cutoff(Math.ceil(n) - 1)

/**
 * The five score bands under `thresholds`, best first. Whole-number cut-offs read
 * like the guide ("75–84"); the code still grades 84,9 as the band below 85.
 */
export function gradeBands(thresholds: Thresholds): GradeBand[] {
  return CATEGORIES.map((category, i) => {
    const key = THRESHOLD_KEYS[i]
    const min = key ? thresholds[key] : 0
    const aboveKey = i > 0 ? THRESHOLD_KEYS[i - 1] : undefined
    const below = aboveKey ? thresholds[aboveKey] : null
    const text = !key
      ? `< ${cutoff(below ?? 0)}`
      : below == null
        ? `${cutoff(min)}–100`
        : `${cutoff(min)}–${bandEdge(below)}`
    return { category, min, below, text }
  })
}

/** The grade a score earns under `thresholds`: the score bands alone, as the API grades. */
export function gradeOf(score: number, thresholds: Thresholds): Category {
  const i = THRESHOLD_KEYS.findIndex((key) => score >= thresholds[key])
  return i === -1 ? 'tidak_layak' : CATEGORIES[i]!
}

/** The criterion's letter in the guide (A–E). */
export const CRITERION_LETTER: Record<Criterion, string> = Object.fromEntries(
  CRITERIA.map((c, i) => [c, String.fromCodePoint(65 + i)]),
) as Record<Criterion, string>

export const CRITERION_LABEL: Record<Criterion, string> = {
  manajemen: 'Tim manajemen',
  kinerja: 'Kinerja bisnis saat ini',
  risiko: 'Risiko bisnis & tren makro',
  rencana: 'Rencana bisnis & potensi imbal hasil',
  dampak: 'Potensi dampak',
}

/** A shorter name where space is tight: chart legends, table headers. */
export const CRITERION_SHORT: Record<Criterion, string> = {
  manajemen: 'Tim manajemen',
  kinerja: 'Kinerja bisnis',
  risiko: 'Risiko & tren makro',
  rencana: 'Rencana & imbal hasil',
  dampak: 'Potensi dampak',
}

/** What the criterion looks at, in one line. */
export const CRITERION_MEANING: Record<Criterion, string> = {
  manajemen:
    'Rekam jejak, pengalaman, dan kelengkapan tim pendiri dan manajemen.',
  kinerja:
    'Bukti bisnis sudah berjalan: pendapatan, pengguna, pertumbuhan, pelanggan yang disebut namanya.',
  risiko:
    'Seberapa terkendali risiko bisnisnya (persaingan, regulasi, ketergantungan) dan apakah tren makro/pasar mendukung. Nilai tinggi = risiko rendah dan tren mendukung.',
  rencana:
    'Rencana bisnis dan keuangan yang masuk akal: penggunaan dana, proyeksi berdasar data, unit ekonomi, potensi imbal hasil bagi investor.',
  dampak:
    'Dampak sosial atau lingkungan yang terukur (mis. lapangan kerja, inklusi, emisi).',
}

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  antre: 'Antre',
  dinilai_proses: 'Sedang dinilai',
  dinilai: 'Dinilai',
  perlu_dicek_manual: 'Perlu dicek manual',
  dihentikan: 'Dihentikan',
}

export const RESPONSE_LABEL: Record<ResponseKind, string> = {
  undang: 'Undang',
  pantau: 'Pantau',
  arsipkan: 'Arsipkan',
}

export const VIA_LABEL: Record<Via, string> = {
  wa: 'WhatsApp',
  dashboard: 'Dashboard',
  sistem: 'Sistem',
}

export const JOB_KIND_LABEL: Record<JobKind, string> = {
  penilaian: 'Penilaian',
  ringkasan: 'Ringkasan',
  asisten: 'Asisten',
  perintah: 'Perintah',
  retensi: 'Retensi',
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  berjalan: 'Berjalan',
  selesai: 'Selesai',
  gagal: 'Gagal',
  dihentikan: 'Dihentikan',
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  ok: 'OK',
  gagal: 'Gagal',
  dihentikan: 'Dihentikan',
}

export const HISTORY_ACTION_LABEL: Record<HistoryAction, string> = {
  tanggapan: 'Tanggapan',
  tanggapan_massal: 'Tanggapan massal',
  koreksi: 'Koreksi grade',
  aturan_diubah: 'Aturan diubah',
  stop: 'STOP',
  lanjut: 'LANJUT',
  ringkasan_terkirim: 'Ringkasan terkirim',
  proposal_masuk: 'Proposal masuk',
  proposal_dihapus: 'Proposal dihapus',
  dinilai_ulang: 'Dinilai ulang',
}

/** The word for an open-enum value; a value newer than this build shows as-is. */
export function labelOf<K extends string>(
  labels: Record<K, string>,
  value: string,
): string {
  return Object.hasOwn(labels, value) ? labels[value as K] : value
}

export const OUTSIDE_FOCUS_LABEL = 'Di luar fokus'
export const OUTSIDE_FOCUS_MEANING =
  'Prioritas rendah: tidak sesuai fokus investasi (sektor/tahap/dana), jadi risikonya lebih tinggi untuk portofolio.'

const FIT_CHECK_LABEL = { sector: 'Sektor', stage: 'Tahap', funding: 'Dana' }

/** The fit checks a proposal failed, as "Sektor: f&b di luar sektor fokus". */
export function failedFitChecks(fit: Proposal['fit']): string[] {
  if (!fit) return []
  return (Object.keys(FIT_CHECK_LABEL) as (keyof typeof FIT_CHECK_LABEL)[])
    .filter((key) => !fit.checks[key].passed)
    .map((key) => `${FIT_CHECK_LABEL[key]}: ${fit.checks[key].reason}`)
}

/**
 * A sector as every proposal surface shows it. The API stores whatever the
 * model read off the deck ("f&b", "agritech"), so the list, its filter, the
 * detail page, Riwayat and the CSV all capitalise through this one rule: the
 * first letter, and the letter after an "&" or "/" ("f&b" → "F&B"). The raw
 * value stays the filter's key, so a link with `sektor=f%26b` keeps working.
 */
export function sectorLabel(sector: string): string {
  return sector.replace(
    /(^|[&/]\s*)(\p{Ll})/gu,
    (_, before: string, letter: string) => before + letter.toUpperCase(),
  )
}

// The intake row the API wrote before it formatted its own detail:
// "Proposal X masuk: skor 63.1, tidak_cocok" — a raw float and a category key,
// from either scale, optionally followed by the ", di luar fokus" mark.
const RAW_INTAKE_DETAIL = new RegExp(
  `^(.* masuk: skor )(\\d+(?:\\.\\d+)?), (${[...CATEGORIES, ...LEGACY_CATEGORIES].join('|')})(, di luar fokus)?$`,
  'u',
)

/**
 * A history row's `detail` for display. Only the one raw shape the API is known
 * to have written is rewritten (score and category in their display words);
 * any other text is shown exactly as stored.
 */
export function historyDetailText(detail: string): string {
  const match = RAW_INTAKE_DETAIL.exec(detail)
  if (!match) return detail
  const [, before, score, category, outside = ''] = match as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
  ]
  return `${before}${formatScore(Number(score))}, ${categoryText(category)}${outside}`
}
