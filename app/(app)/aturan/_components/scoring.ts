// A TypeScript mirror of `services/api/aisa/scoring.py` — the formula the AI
// worker uses to turn five 1–5 values into a score and a kategori. The Python
// module is the source of truth; this copy exists only so Aturan penilaian can
// show an example calculation and SIMULATE a draft rule set against the
// proposals already scored. Nothing here is ever written back: a saved rule
// only applies to proposals scored after it (aisa-api does not re-score).
//
// Keep it in step with scoring.py: `scoring.test.ts` pins its edge cases.

import {
  CATEGORIES,
  CRITERIA,
  type Category,
  type Criterion,
  type Proposal,
  type Rules,
  showsQualityOutsideFocus,
} from '@/features/aisa/aisa.schema'

export type Values = Record<Criterion, number>
export type ScoringRules = Pick<Rules, 'weights' | 'fit' | 'thresholds'>

/** One scored proposal, reduced to what the scoring page reads. */
export interface ScoredProposal {
  id: string
  name: string
  /** The score aisa-api stored when it assessed the proposal. */
  score: number
  /** `null` when the stored assessment lacks a criterion: it cannot be re-scored. */
  values: Values | null
  sector: string | null
  stage: string | null
  fundingAskIdr: number | null
  /** The kategori the manager sees (a koreksi wins over the AI's). */
  category: Category
  qualityOutsideFocus: boolean
  rulesVersion: number
}

/** `scoring.py`'s `round(x, 1)`: half-to-even, as Python rounds. */
function roundOne(value: number): number {
  const scaled = value * 10
  const floor = Math.floor(scaled)
  const diff = scaled - floor
  if (Math.abs(diff - 0.5) < 1e-9)
    return (floor % 2 === 0 ? floor : floor + 1) / 10
  return Math.round(scaled) / 10
}

/** Points one criterion contributes: bobot × (nilai − 1) / 4, on the 0–100 scale. */
export function criterionPoints(weight: number, value: number): number {
  return ((weight * (value - 1)) / 4) * 100
}

/** skor = Σ bobot × (nilai − 1) / 4, scaled to 0–100, one decimal. */
export function computeScore(
  weights: Rules['weights'],
  values: Values,
): number {
  let total = 0
  for (const c of CRITERIA) total += (weights[c] * (values[c] - 1)) / 4
  return roundOne(total * 100)
}

/** 'Pre Seed' → 'pre-seed', as `normalize_token` compares sectors and stages. */
export function normalizeToken(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
}

export interface FitResult {
  sector: boolean
  stage: boolean
  funding: boolean
  passed: boolean
}

/** A field the deck does not state fails its check. */
export function fitCheck(
  profile: Pick<ScoredProposal, 'sector' | 'stage' | 'fundingAskIdr'>,
  fit: Rules['fit'],
): FitResult {
  const sectors = new Set(fit.sectors.map(normalizeToken))
  const stages = new Set(fit.stages.map(normalizeToken))
  const sector = !!profile.sector && sectors.has(normalizeToken(profile.sector))
  const stage = !!profile.stage && stages.has(normalizeToken(profile.stage))
  const ask = profile.fundingAskIdr
  const funding =
    ask != null && fit.fundingMinIdr <= ask && ask <= fit.fundingMaxIdr
  return { sector, stage, funding, passed: sector && stage && funding }
}

/** `[kategori, qualityOutsideFocus]`, exactly as `categorize` decides. */
export function categorize(
  score: number,
  values: Values,
  fitPassed: boolean,
  t: Rules['thresholds'],
): [Category, boolean] {
  if (!fitPassed) return ['tidak_cocok', score >= t.qualityOutsideFocus]
  if (score >= t.sangatCocok && Math.min(...CRITERIA.map((c) => values[c])) > 1)
    return ['sangat_cocok', false]
  if (score >= t.cocok) return ['cocok', false]
  if (score >= t.kurangCocok) return ['kurang_cocok', false]
  return ['tidak_cocok', false]
}

export interface Evaluation {
  score: number
  fit: FitResult
  category: Category
  qualityOutsideFocus: boolean
}

export function evaluate(
  p: ScoredProposal & { values: Values },
  rules: ScoringRules,
): Evaluation {
  const score = computeScore(rules.weights, p.values)
  const fit = fitCheck(p, rules.fit)
  const [category, qualityOutsideFocus] = categorize(
    score,
    p.values,
    fit.passed,
    rules.thresholds,
  )
  return { score, fit, category, qualityOutsideFocus }
}

export const rescorable = (
  p: ScoredProposal,
): p is ScoredProposal & { values: Values } => p.values !== null

export type CategoryCounts = Record<Category, number>
export const emptyCounts = (): CategoryCounts =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as CategoryCounts

export interface CategoryMove {
  proposal: ScoredProposal
  from: Category
  to: Category
}

export interface Simulation {
  /** How many proposals could be re-scored (all five values present). */
  total: number
  before: CategoryCounts
  after: CategoryCounts
  moves: CategoryMove[]
  up: number
  down: number
}

/**
 * Re-score every proposal under the current and the draft rules and compare.
 * Both sides are recomputed, so a proposal scored under an older version is
 * compared like for like rather than against its stored kategori.
 */
const rank = (c: Category) => CATEGORIES.indexOf(c)

export function simulate(
  proposals: readonly ScoredProposal[],
  current: ScoringRules,
  draft: ScoringRules,
): Simulation {
  const before = emptyCounts()
  const after = emptyCounts()
  const moves: CategoryMove[] = []
  let total = 0
  for (const p of proposals) {
    if (!rescorable(p)) continue
    total += 1
    const from = evaluate(p, current).category
    const to = evaluate(p, draft).category
    before[from] += 1
    after[to] += 1
    if (from !== to) moves.push({ proposal: p, from, to })
  }
  return {
    total,
    before,
    after,
    moves,
    up: moves.filter((m) => rank(m.to) < rank(m.from)).length,
    down: moves.filter((m) => rank(m.to) > rank(m.from)).length,
  }
}

/** Reduce an assessed proposal to `ScoredProposal`; `null` when it has no assessment. */
export function toScored(p: Proposal): ScoredProposal | null {
  const a = p.assessment
  const category = p.effectiveCategory ?? p.category
  if (!a || !category || p.status !== 'dinilai') return null
  const complete = CRITERIA.every((c) => a.criteria[c] != null)
  return {
    id: p.id,
    name: p.name,
    score: a.score,
    values: complete
      ? (Object.fromEntries(
          CRITERIA.map((c) => [c, a.criteria[c]!.value]),
        ) as Values)
      : null,
    sector: p.profile?.sector ?? null,
    stage: p.profile?.stage ?? null,
    fundingAskIdr: p.profile?.fundingAskIdr ?? null,
    category,
    qualityOutsideFocus: showsQualityOutsideFocus(p),
    rulesVersion: a.rulesVersion,
  }
}
