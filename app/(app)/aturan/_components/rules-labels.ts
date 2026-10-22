// Display words shared by the editable rules form and the read-only summary, so
// both describe a rule the same way.

import type { EditableRules } from '@/features/aisa/aisa.schema'

export const EDITABLE_MODEL_LABEL: Record<
  keyof EditableRules['models'],
  string
> = {
  penilai: 'Penilai',
  ringkasan: 'Pembuat ringkasan',
  insight: 'Insight',
}

export const ASISTEN_MODEL_NOTE = 'berlaku setelah Asisten di-deploy ulang'

export const RETENTION_EXPLANATION = (days: number) =>
  `Proposal yang ditolak dihapus otomatis setelah ${Number.isFinite(days) ? days : 'N'} hari (setiap hari 02.00 WIB).`

/** What the rubric is, said once for the card and the edit tab. */
export const RUBRIC_INTRO =
  'Kapan sebuah kriteria mendapat skor 1–5. AI wajib menyebut bukti dan halaman untuk skor yang diberikan.'

/** How the two scales relate, so a criterion score never reads as the 0–100 score. */
export const SCALE_NOTE =
  'Skor kriteria memakai skala 1–5; skor kualitas akhir proposal memakai skala 0–100.'

/** Shown for a rubric level the stored rules do not define yet (levels 2 and 4 of older rules). */
export const ANCHOR_UNDEFINED = 'Belum didefinisikan — isi di Aturan'
