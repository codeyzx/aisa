// One-click starting points for the weights in the edit dialog. A preset only
// fills the draft: the total check, impact preview and reason still apply.

import type { Criterion } from '@/features/aisa/aisa.schema'

/**
 * The weights of the scoring guide the investment team adopted (A–E:
 * 25/20/20/25/10), the same values as `DEFAULT_WEIGHTS` in
 * services/api/aisa/models.py, in percent.
 */
export const GUIDE_PERCENT: Record<Criterion, number> = {
  manajemen: 25,
  kinerja: 20,
  risiko: 20,
  rencana: 25,
  dampak: 10,
}

export interface WeightPreset {
  label: string
  description: string
  percent: Record<Criterion, number>
}

export const WEIGHT_PRESETS: readonly WeightPreset[] = [
  {
    label: 'Baseline Arunami',
    description: 'Bobot panduan penilaian: 25/20/20/25/10.',
    percent: GUIDE_PERCENT,
  },
  {
    label: 'Fokus dampak',
    description:
      'Dampak sosial dan lingkungan dinaikkan ke 30%, kriteria bisnis diturunkan.',
    percent: {
      manajemen: 20,
      kinerja: 15,
      risiko: 15,
      rencana: 20,
      dampak: 30,
    },
  },
]
