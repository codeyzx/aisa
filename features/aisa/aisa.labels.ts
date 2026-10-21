// Indonesian display words for the AISA enums. `Record<Enum, string>` makes a
// new enum member a compile error until it has a word. The open enums (job kind,
// history action) may also carry a value the API added after this build; those
// render through `labelOf` as their raw value rather than breaking the page.

import type {
  Category,
  Criterion,
  HistoryAction,
  JobKind,
  JobStatus,
  ProposalStatus,
  ResponseKind,
  StepStatus,
  Via,
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
