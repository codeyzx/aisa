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
