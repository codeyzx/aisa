import type { AssessmentProgress } from '@/features/aisa/aisa.repo'

import {
  describeStep,
  PIPELINE,
  type StepDescription,
} from './assessment-steps'

// The live progress card's model, derived from one poll of
// `getAssessmentProgressAction`. Pure, so the rules below are unit-tested:
// a step reads "berjalan" only when the job's `currentStep` names it; with no
// `currentStep` (an older job, or the gap between two steps) the next expected
// step reads "berikutnya", never "berjalan".

export type ProgressPhase =
  /** Queued, waiting for its turn. */
  | 'antre'
  /** Queued while STOP is on: it waits for LANJUT. */
  | 'dijeda'
  | 'berjalan'
  | 'selesai'
  | 'perlu_dicek_manual'
  | 'dihentikan'
  /** The run failed on infrastructure; the proposal went back to the queue. */
  | 'gagal'

export type RowState =
  | 'selesai'
  | 'gagal'
  | 'dihentikan'
  | 'berjalan'
  | 'berikutnya'
  | 'menunggu'
  | 'dilewati'

export interface ProgressRow extends StepDescription {
  id: string
  state: RowState
  /** Recorded duration of a finished step. */
  durationMs: number | null
  /** When the running step started, on the server's clock. */
  startedAt: Date | null
  error: string | null
}

export interface ProgressView {
  phase: ProgressPhase
  /** The poll has nothing more to learn: stop polling. */
  settled: boolean
  rows: ProgressRow[]
  jobStartedAt: Date | null
  /** Set once the job ended: its measured duration, else start to end. */
  totalMs: number | null
  statusReason: string | null
  paused: boolean
}

function phaseOf(progress: AssessmentProgress): ProgressPhase {
  switch (progress.status) {
    case 'dinilai':
      return 'selesai'
    case 'perlu_dicek_manual':
      return 'perlu_dicek_manual'
    case 'dihentikan':
      return 'dihentikan'
    case 'dinilai_proses':
      return 'berjalan'
    case 'antre':
      // The API puts a failed run back in the queue with its reason.
      if (progress.job?.status === 'gagal') return 'gagal'
      return progress.paused ? 'dijeda' : 'antre'
  }
}

const SETTLED: ReadonlySet<ProgressPhase> = new Set([
  'selesai',
  'perlu_dicek_manual',
  'dihentikan',
  'gagal',
])

export function deriveProgress(progress: AssessmentProgress): ProgressView {
  const phase = phaseOf(progress)
  const settled = SETTLED.has(phase)
  // A queued proposal's old job (a failed run) is not this run's progress,
  // except when that failure is the news. Right after a run is claimed the
  // proposal can still point at its previous job for a moment; that one is
  // not running, so it is not shown as this run either.
  const job =
    phase === 'antre' ||
    phase === 'dijeda' ||
    (phase === 'berjalan' && progress.job?.status !== 'berjalan')
      ? null
      : progress.job

  // describeStep returns a fresh object per call, so extending it in place
  // copies nothing and aliases nothing.
  const rows: ProgressRow[] = (job?.steps ?? []).map((step) =>
    Object.assign(describeStep(step), {
      id: `step-${step.seq}`,
      state: step.status === 'ok' ? ('selesai' as const) : step.status,
      durationMs: step.durationMs,
      startedAt: null,
      error: step.error ?? null,
    }),
  )

  const current =
    phase === 'berjalan' && job?.status === 'berjalan' ? job.currentStep : null
  if (current) {
    rows.push({
      ...describeStep(current),
      id: 'current',
      state: 'berjalan',
      durationMs: null,
      startedAt: current.startedAt,
      error: null,
    })
  }

  const seen = new Set(rows.map((row) => row.key))
  const upcoming = PIPELINE.filter(
    (info) => !info.optional && !seen.has(info.key),
  )
  // A run that ended early (perlu dicek manual, STOP, a failure) skipped the rest.
  const restState: RowState = settled ? 'dilewati' : 'menunggu'
  upcoming.forEach((info, index) => {
    rows.push({
      ...info,
      retry: false,
      id: `next-${info.key}`,
      state:
        index === 0 && !current && phase === 'berjalan'
          ? 'berikutnya'
          : restState,
      durationMs: null,
      startedAt: null,
      error: null,
    })
  })

  return {
    phase,
    settled,
    rows:
      phase === 'selesai' ? rows.filter((r) => r.state !== 'dilewati') : rows,
    jobStartedAt: job?.startedAt ?? null,
    totalMs:
      job?.durationMs ??
      (job?.endedAt != null
        ? job.endedAt.getTime() - job.startedAt.getTime()
        : null),
    statusReason: progress.statusReason,
    paused: progress.paused,
  }
}
