import {
  CRITERION_LABEL,
  HISTORY_ACTION_LABEL,
  labelOf,
  VIA_LABEL,
} from '@/features/aisa/aisa.labels'
import type { JobWithSteps } from '@/features/aisa/aisa.repo'
import {
  CRITERIA,
  type History,
  type JobStatus,
  type Proposal,
  type Rules,
  type StepStatus,
} from '@/features/aisa/aisa.schema'

import { criterionPoints, scoreUnder } from './proposal-format'

// The "Log penilaian" panel's data, built on the server from the proposal's own
// assessment job, its steps, and the manager's rows in `history`. Nothing here
// is invented: a step's rincian is shown only for the steps whose output the
// proposal actually stores (the criteria, the score, the fit check).

export type LogDetail =
  | {
      type: 'criteria'
      items: {
        label: string
        value: number
        reason: string
        notMentioned: boolean
        citationsUnverified: boolean
        citations: { page: number; quote: string }[]
      }[]
    }
  | {
      type: 'score'
      rows: { label: string; value: number; weight: number; points: number }[]
      total: number
      stored: number
      /** Set when the rules changed since scoring: [scored with, current]. */
      versions: [number, number] | null
    }
  | {
      type: 'fit'
      items: { label: string; ok: boolean; detail: string }[]
    }

export interface LogStep {
  id: string
  by: 'ai' | 'sistem' | 'manajer'
  title: string
  actor: string
  model: string | null
  at: Date
  durationMs: number
  tokens: number
  summary: string
  status: StepStatus
  error: string | null
  detail: LogDetail | null
}

export interface AssessmentLogData {
  jobId: string
  status: JobStatus
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  tokens: number
  steps: LogStep[]
}

function stepDetail(
  tool: string,
  proposal: Proposal,
  rules: Rules | null,
): LogDetail | null {
  const { assessment, fit } = proposal
  if (tool === 'penilai.assess' && assessment) {
    return {
      type: 'criteria',
      items: CRITERIA.flatMap((criterion) => {
        const item = assessment.criteria[criterion]
        return item
          ? [
              {
                label: CRITERION_LABEL[criterion],
                value: item.value,
                reason: item.reason,
                notMentioned: item.notMentioned,
                citationsUnverified: item.citationsUnverified,
                citations: item.citations,
              },
            ]
          : []
      }),
    }
  }
  if (tool === 'compute_score' && assessment && rules) {
    return {
      type: 'score',
      rows: CRITERIA.flatMap((criterion) => {
        const item = assessment.criteria[criterion]
        if (!item) return []
        const weight = rules.weights[criterion]
        return [
          {
            label: CRITERION_LABEL[criterion],
            value: item.value,
            weight: weight * 100,
            points: criterionPoints(item.value, weight),
          },
        ]
      }),
      total: scoreUnder(assessment, rules.weights),
      stored: assessment.score,
      versions:
        rules.version === assessment.rulesVersion
          ? null
          : [assessment.rulesVersion, rules.version],
    }
  }
  if (tool === 'check_fit' && fit) {
    return {
      type: 'fit',
      items: [
        { label: 'Sektor', check: fit.checks.sector },
        { label: 'Tahap', check: fit.checks.stage },
        { label: 'Dana', check: fit.checks.funding },
      ].map(({ label, check }) => ({
        label,
        ok: check.passed,
        detail: check.reason,
      })),
    }
  }
  return null
}

function stepSummary(read: string | null, wrote: string | null) {
  const parts = [
    read ? `Membaca ${read}` : null,
    wrote ? `menulis ${wrote}` : null,
  ].filter(Boolean)
  const text = parts.join(', lalu ')
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : ''
}

const MANAGER_ACTIONS = new Set(['tanggapan', 'tanggapan_massal', 'koreksi'])

export function buildAssessmentLog(
  job: JobWithSteps,
  proposal: Proposal,
  history: History[],
  rules: Rules | null,
): AssessmentLogData {
  const steps: LogStep[] = job.steps.map((step) => ({
    id: step.id,
    by: step.actor === 'model' ? 'ai' : 'sistem',
    title: step.action,
    actor: step.tool,
    model: step.model ?? null,
    at: step.at,
    durationMs: step.durationMs,
    tokens: step.tokensIn + step.tokensOut,
    summary: stepSummary(step.read ?? null, step.wrote ?? null),
    status: step.status,
    error: step.error ?? null,
    detail: stepDetail(step.tool, proposal, rules),
  }))

  // The manager's own decisions on this proposal, after the AI's work: they
  // are part of how the proposal ended up where it is.
  const manager = history
    .filter((row) => row.via !== 'sistem' && MANAGER_ACTIONS.has(row.action))
    .toSorted((a, b) => a.at.getTime() - b.at.getTime())
    .map<LogStep>((row) => ({
      id: `history-${row.id}`,
      by: 'manajer',
      title: labelOf(HISTORY_ACTION_LABEL, row.action),
      actor: `Manajer · ${VIA_LABEL[row.via]}`,
      model: null,
      at: row.at,
      durationMs: 0,
      tokens: 0,
      summary: row.reason
        ? `${row.detail}. Alasan: “${row.reason}”`
        : row.detail,
      status: 'ok',
      error: null,
      detail: null,
    }))

  return {
    jobId: job.id,
    status: job.status,
    startedAt: job.startedAt,
    endedAt: job.endedAt ?? null,
    durationMs:
      job.durationMs ??
      (job.endedAt ? job.endedAt.getTime() - job.startedAt.getTime() : null),
    tokens: job.tokensIn + job.tokensOut,
    steps: [...steps, ...manager],
  }
}
