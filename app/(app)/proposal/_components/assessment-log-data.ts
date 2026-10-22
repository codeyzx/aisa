import {
  CATEGORY_LABEL,
  CRITERION_LABEL,
  CRITERION_LETTER,
  HISTORY_ACTION_LABEL,
  historyDetailText,
  labelOf,
  VIA_LABEL,
} from '@/features/aisa/aisa.labels'
import type { JobWithSteps } from '@/features/aisa/aisa.repo'
import {
  CRITERIA,
  type Category,
  type History,
  type JobStatus,
  type Proposal,
  type Rules,
  type Step,
  type StepStatus,
  type Thresholds,
} from '@/features/aisa/aisa.schema'
import { formatScore } from '@/lib/format/number'

import { describeStep, type StepKey } from './assessment-steps'
import { criterionPoints, scoreUnder } from './proposal-format'

// The "Log penilaian" dialog's data, built on the server from the proposal's
// own assessment job, its steps, and the manager's rows in `history`. Nothing
// here is invented: a step's rincian is shown only for the steps whose output
// the proposal actually stores (the criteria, the score, the fit check, the
// grade), and a step is matched by the action the API records.

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
  | {
      type: 'category'
      category: Category
      score: number
      /** Failed a fit check: same grade, lower priority. */
      outsideFocus: boolean
      /** The current thresholds; null when the rules changed since scoring. */
      thresholds: Thresholds | null
      rulesVersion: number
    }

export interface LogStep {
  id: string
  by: 'ai' | 'sistem' | 'manajer'
  /** Plain-language name of what happened. */
  title: string
  /** One sentence on what the step does and why it matters. */
  explain: string
  /** What this step concluded for this proposal, when the proposal stores it. */
  result: string | null
  /** The action and tool exactly as recorded, for the audit-minded reader. */
  recorded: string
  model: string | null
  /** When the step began: its recorded end minus its measured duration. */
  startedAt: Date
  durationMs: number
  tokens: number
  status: StepStatus
  error: string | null
  detail: LogDetail | null
}

export interface AssessmentLogData {
  jobId: string
  status: JobStatus
  model: string | null
  startedAt: Date
  endedAt: Date | null
  durationMs: number | null
  tokens: number
  counts: Record<LogStep['by'], number>
  /** The assessment's own steps, in the order they ran. */
  steps: LogStep[]
  /** The manager's decisions on this proposal afterwards, oldest first. */
  after: LogStep[]
}

/** "A. Tim manajemen": the criterion as the guide names it. */
const criterionName = (criterion: (typeof CRITERIA)[number]) =>
  `${CRITERION_LETTER[criterion]}. ${CRITERION_LABEL[criterion]}`

function criteriaDetail(proposal: Proposal): LogDetail | null {
  const { assessment } = proposal
  if (!assessment) return null
  return {
    type: 'criteria',
    items: CRITERIA.flatMap((criterion) => {
      const item = assessment.criteria[criterion]
      return item
        ? [
            {
              label: criterionName(criterion),
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

function stepDetail(
  key: StepKey | null,
  status: StepStatus,
  proposal: Proposal,
  rules: Rules | null,
): LogDetail | null {
  // A failed attempt produced nothing the proposal kept.
  if (status !== 'ok') return null
  const { assessment, fit } = proposal
  switch (key) {
    case 'nilai':
      return criteriaDetail(proposal)
    case 'skor':
      if (!assessment || !rules) return null
      return {
        type: 'score',
        rows: CRITERIA.flatMap((criterion) => {
          const item = assessment.criteria[criterion]
          if (!item) return []
          const weight = rules.weights[criterion]
          return [
            {
              label: criterionName(criterion),
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
    case 'fokus':
      if (!fit) return null
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
    case 'grade':
      if (!assessment || !proposal.category) return null
      return {
        type: 'category',
        category: proposal.category,
        score: assessment.score,
        outsideFocus: fit?.passed === false,
        thresholds:
          rules && rules.version === assessment.rulesVersion
            ? rules.thresholds
            : null,
        rulesVersion: assessment.rulesVersion,
      }
    default:
      return null
  }
}

/**
 * What a finished step concluded, in one short phrase. `next` is the key of
 * the step recorded after it, or undefined when it is the last one.
 */
function stepResult(
  key: StepKey | null,
  step: Step,
  proposal: Proposal,
  next: StepKey | null | undefined,
): string | null {
  if (step.status !== 'ok') return null
  const { assessment, fit } = proposal
  const endedManual =
    next === undefined && proposal.status === 'perlu_dicek_manual'
  switch (key) {
    case 'ekstrak':
      return proposal.pageCount > 0 ? `${proposal.pageCount} halaman` : null
    case 'cek_teks':
      // Too little text sends the deck to the image read, or, when the deck
      // is too big for that, ends the run right here as perlu dicek manual.
      if (next === 'baca_gambar' || endedManual) return 'Teks terlalu sedikit'
      return next === 'nilai' ? 'Teks cukup' : null
    case 'baca_gambar':
      if (next === 'nilai') return 'Teks terbaca'
      return endedManual ? 'Teks tetap terlalu sedikit' : null
    case 'nilai': {
      if (!assessment) return null
      const quotes = CRITERIA.reduce(
        (sum, c) => sum + (assessment.criteria[c]?.citations.length ?? 0),
        0,
      )
      return `${Object.keys(assessment.criteria).length} kriteria, ${quotes} kutipan`
    }
    case 'skor':
      return assessment ? `Skor ${formatScore(assessment.score)}` : null
    case 'fokus':
      if (!fit) return null
      return `${Object.values(fit.checks).filter((c) => c.passed).length} dari 3 syarat terpenuhi`
    case 'grade':
      return proposal.category ? CATEGORY_LABEL[proposal.category] : null
    default:
      return null
  }
}

const MANAGER_ACTIONS = new Set(['tanggapan', 'tanggapan_massal', 'koreksi'])

const MANAGER_EXPLAIN: Record<string, string> = {
  tanggapan: 'Manajer memutuskan langkah berikutnya untuk proposal ini.',
  tanggapan_massal:
    'Manajer menanggapi sekelompok proposal sekaligus, termasuk yang ini.',
  koreksi:
    'Manajer mengganti grade. Skor dan nilai dari AI tetap disimpan apa adanya.',
}

export function buildAssessmentLog(
  job: JobWithSteps,
  proposal: Proposal,
  history: History[],
  rules: Rules | null,
): AssessmentLogData {
  const keys = job.steps.map((step) => describeStep(step).key)
  const steps = job.steps.map<LogStep>((step, index) => {
    const info = describeStep(step)
    const fallback = [
      step.read ? `Membaca ${step.read}` : null,
      step.wrote ? `menulis ${step.wrote}` : null,
    ]
      .filter(Boolean)
      .join(', lalu ')
    return {
      id: step.id,
      by: info.by,
      title: info.title,
      explain:
        info.explain ||
        (fallback
          ? `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}.`
          : ''),
      result: stepResult(info.key, step, proposal, keys[index + 1]),
      recorded: `${step.action} · ${step.tool}`,
      model: step.model ?? null,
      startedAt: new Date(step.at.getTime() - step.durationMs),
      durationMs: step.durationMs,
      tokens: step.tokensIn + step.tokensOut,
      status: step.status,
      error: step.error ?? null,
      detail: stepDetail(info.key, step.status, proposal, rules),
    }
  })

  // The manager's own decisions on this proposal, after the AI's work: they
  // are part of how the proposal ended up where it is.
  const after = history
    .filter((row) => row.via !== 'sistem' && MANAGER_ACTIONS.has(row.action))
    .toSorted((a, b) => a.at.getTime() - b.at.getTime())
    .map<LogStep>((row) => {
      const detail = historyDetailText(row.detail)
      return {
        id: `history-${row.id}`,
        by: 'manajer',
        title: labelOf(HISTORY_ACTION_LABEL, row.action),
        explain: MANAGER_EXPLAIN[row.action] ?? '',
        result: row.reason ? `${detail}. Alasan: “${row.reason}”` : detail,
        recorded: `Manajer · ${VIA_LABEL[row.via]}`,
        model: null,
        startedAt: row.at,
        durationMs: 0,
        tokens: 0,
        status: 'ok',
        error: null,
        detail: null,
      }
    })

  const all = [...steps, ...after]
  return {
    jobId: job.id,
    status: job.status,
    model: job.model ?? null,
    startedAt: job.startedAt,
    endedAt: job.endedAt ?? null,
    durationMs:
      job.durationMs ??
      (job.endedAt ? job.endedAt.getTime() - job.startedAt.getTime() : null),
    tokens: job.tokensIn + job.tokensOut,
    counts: {
      ai: all.filter((s) => s.by === 'ai').length,
      sistem: all.filter((s) => s.by === 'sistem').length,
      manajer: all.filter((s) => s.by === 'manajer').length,
    },
    steps,
    after,
  }
}
