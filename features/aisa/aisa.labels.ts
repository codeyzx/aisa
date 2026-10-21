// Indonesian display words for the AISA enums. `Record<Enum, string>` makes a
// new enum member a compile error until it has a word, so a raw snake_case value
// never reaches the screen.

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
}

export const QUALITY_OUTSIDE_FOCUS_LABEL = 'Berkualitas, di luar fokus'
