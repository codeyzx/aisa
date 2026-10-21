// The edit dialog's working copy of the rules: text fields as typed, a check
// that names what is wrong per tab, and the conversion to the `EditableRules`
// body `updateRulesAction` sends. The server action re-validates everything;
// this check exists so the impact preview only runs on rules that could save.

import {
  CRITERIA,
  type Criterion,
  type EditableRules,
  type Rules,
} from '@/features/aisa/aisa.schema'

import { toPercent, type RulesTab } from './helpers'

export type ThresholdKey = keyof Rules['thresholds']
export type ModelKey = keyof EditableRules['models']

export interface RulesDraft {
  percent: Record<Criterion, string>
  thresholds: Record<ThresholdKey, string>
  sectors: string[]
  stages: string[]
  /** Rupiah amounts typed in miliar. */
  fundingMin: string
  fundingMax: string
  anchors: Rules['anchors']
  models: Record<ModelKey, string>
  minChars: string
}

const MILIAR = 1_000_000_000

export function draftFromRules(rules: Rules): RulesDraft {
  return {
    percent: Object.fromEntries(
      CRITERIA.map((c) => [c, String(toPercent(rules.weights[c]))]),
    ) as Record<Criterion, string>,
    thresholds: {
      sangatCocok: String(rules.thresholds.sangatCocok),
      cocok: String(rules.thresholds.cocok),
      kurangCocok: String(rules.thresholds.kurangCocok),
      qualityOutsideFocus: String(rules.thresholds.qualityOutsideFocus),
    },
    sectors: [...rules.fit.sectors],
    stages: [...rules.fit.stages],
    fundingMin: String(rules.fit.fundingMinIdr / MILIAR),
    fundingMax: String(rules.fit.fundingMaxIdr / MILIAR),
    anchors: structuredClone(rules.anchors),
    models: {
      penilai: rules.models.penilai,
      ringkasan: rules.models.ringkasan,
      insight: rules.models.insight,
    },
    minChars: String(rules.minCharsPerPage),
  }
}

/** A typed number, or NaN for blank text (so blank never reads as 0). */
const parse = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

/** Weights as typed, blank as 0 — for the live total and the bar only. */
export function livePercent(draft: RulesDraft): Record<Criterion, number> {
  return Object.fromEntries(
    CRITERIA.map((c) => [c, Number(draft.percent[c]) || 0]),
  ) as Record<Criterion, number>
}

export const percentTotal = (percent: Record<Criterion, number>) =>
  Math.round(CRITERIA.reduce((sum, c) => sum + percent[c], 0) * 100) / 100

export type DraftErrors = Partial<Record<RulesTab, string[]>>

export interface DraftCheck {
  /** `null` while any field is invalid. */
  rules: EditableRules | null
  errors: DraftErrors
}

/** Validate the draft; `retentionDays` is edited in Pengaturan, so it rides along unchanged. */
export function checkDraft(
  draft: RulesDraft,
  retentionDays: number,
): DraftCheck {
  const errors: DraftErrors = {}
  const add = (tab: RulesTab, message: string) =>
    (errors[tab] ??= []).push(message)

  const percent = Object.fromEntries(
    CRITERIA.map((c) => [c, parse(draft.percent[c])]),
  ) as Record<Criterion, number>
  if (CRITERIA.some((c) => !Number.isFinite(percent[c]) || percent[c] < 0))
    add('bobot', 'Setiap bobot wajib diisi, minimal 0%.')
  else if (Math.abs(percentTotal(percent) - 100) > 0.05)
    add('bobot', 'Total bobot lima kriteria harus tepat 100%.')

  const t = Object.fromEntries(
    (Object.keys(draft.thresholds) as ThresholdKey[]).map((k) => [
      k,
      parse(draft.thresholds[k]),
    ]),
  ) as Rules['thresholds']
  if (Object.values(t).some((n) => !Number.isFinite(n) || n < 0 || n > 100))
    add('batas', 'Setiap batas wajib diisi, antara 0 dan 100.')
  else if (!(t.sangatCocok > t.cocok && t.cocok > t.kurangCocok))
    add('batas', 'Batas harus berurutan: Sangat cocok > Cocok > Kurang cocok.')

  const min = parse(draft.fundingMin)
  const max = parse(draft.fundingMax)
  if (draft.sectors.length === 0) add('fokus', 'Pilih minimal satu sektor.')
  if (draft.stages.length === 0) add('fokus', 'Pilih minimal satu tahap.')
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0)
    add('fokus', 'Dana minimum dan maksimum wajib diisi.')
  else if (min > max) add('fokus', 'Dana minimum melebihi maksimum.')

  if (
    CRITERIA.some((c) =>
      (['1', '3', '5'] as const).some((l) => !draft.anchors[c][l].trim()),
    )
  )
    add('patokan', 'Setiap patokan nilai 1, 3, dan 5 wajib diisi.')

  const minChars = parse(draft.minChars)
  if (
    Object.values(draft.models).some((m) => !m.trim() || m.trim().length > 100)
  )
    add('lanjutan', 'Nama model wajib diisi, paling panjang 100 karakter.')
  if (!Number.isInteger(minChars) || minChars < 0)
    add('lanjutan', 'Minimum karakter per halaman harus bilangan bulat ≥ 0.')

  if (Object.keys(errors).length > 0) return { rules: null, errors }
  return {
    errors,
    rules: {
      weights: Object.fromEntries(
        CRITERIA.map((c) => [c, Math.round(percent[c] * 100) / 10000]),
      ) as EditableRules['weights'],
      anchors: draft.anchors,
      fit: {
        sectors: draft.sectors,
        stages: draft.stages,
        fundingMinIdr: Math.round(min * MILIAR),
        fundingMaxIdr: Math.round(max * MILIAR),
      },
      thresholds: t,
      models: {
        penilai: draft.models.penilai.trim(),
        ringkasan: draft.models.ringkasan.trim(),
        insight: draft.models.insight.trim(),
      },
      minCharsPerPage: minChars,
      retentionDays,
    },
  }
}

type ScoringPart = Pick<EditableRules, 'weights' | 'fit' | 'thresholds'>

// Field by field, so a stored document's key order never reads as a change.
const scoringKey = (r: ScoringPart) => [
  CRITERIA.map((c) => r.weights[c]),
  r.fit.sectors,
  r.fit.stages,
  r.fit.fundingMinIdr,
  r.fit.fundingMaxIdr,
  [
    r.thresholds.sangatCocok,
    r.thresholds.cocok,
    r.thresholds.kurangCocok,
    r.thresholds.qualityOutsideFocus,
  ],
]

const rulesKey = (r: EditableRules | Rules) =>
  JSON.stringify([
    scoringKey(r),
    CRITERIA.map((c) => [
      r.anchors[c]['1'],
      r.anchors[c]['3'],
      r.anchors[c]['5'],
    ]),
    [r.models.penilai, r.models.ringkasan, r.models.insight],
    r.minCharsPerPage,
  ])

/** Whether `next` changes anything the dialog edits. */
export const changesRules = (next: EditableRules, rules: Rules) =>
  rulesKey(next) !== rulesKey(rules)

/** Whether `next` changes what a simulation reads: weights, focus, thresholds. */
export const changesScoring = (next: ScoringPart, rules: ScoringPart) =>
  JSON.stringify(scoringKey(next)) !== JSON.stringify(scoringKey(rules))
