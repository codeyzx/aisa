// Indonesian display words for the AISA enums. `Record<Enum, string>` makes a
// new enum member a compile error until it has a word. The open enums (job kind,
// history action) may also carry a value the API added after this build; those
// render through `labelOf` as their raw value rather than breaking the page.

import { formatScore } from '@/lib/format/number'

import {
  CATEGORIES,
  type Category,
  type Criterion,
  type HistoryAction,
  type JobKind,
  type JobStatus,
  type ProposalStatus,
  type ResponseKind,
  type StepStatus,
  type Via,
} from './aisa.schema'

export const CATEGORY_LABEL: Record<Category, string> = {
  sangat_cocok: 'Sangat cocok',
  cocok: 'Cocok',
  kurang_cocok: 'Kurang cocok',
  tidak_cocok: 'Tidak cocok',
}

export const CRITERION_LABEL: Record<Criterion, string> = {
  tim: 'Tim',
  pasar: 'Pasar & masalah',
  produk: 'Produk & keunggulan',
  traksi: 'Traksi',
  bisnis: 'Model bisnis & keuangan',
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
  koreksi: 'Koreksi kategori',
  aturan_diubah: 'Aturan diubah',
  stop: 'STOP',
  lanjut: 'LANJUT',
  ringkasan_terkirim: 'Ringkasan terkirim',
  proposal_masuk: 'Proposal masuk',
  proposal_dihapus: 'Proposal dihapus',
}

/** The word for an open-enum value; a value newer than this build shows as-is. */
export function labelOf<K extends string>(
  labels: Record<K, string>,
  value: string,
): string {
  return Object.hasOwn(labels, value) ? labels[value as K] : value
}

export const QUALITY_OUTSIDE_FOCUS_LABEL = 'Berkualitas, di luar fokus'

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
// "Proposal X masuk: skor 63.1, tidak_cocok" — a raw float and a category key.
const RAW_INTAKE_DETAIL = new RegExp(
  `^(.* masuk: skor )(\\d+(?:\\.\\d+)?), (${CATEGORIES.join('|')})$`,
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
  const [, before, score, category] = match as unknown as [
    string,
    string,
    string,
    Category,
  ]
  return `${before}${formatScore(Number(score))}, ${CATEGORY_LABEL[category]}`
}
