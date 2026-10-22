import { CRITERION_SHORT } from '@/features/aisa/aisa.labels'
import {
  CRITERIA,
  type Category,
  type Criterion,
  type CriterionAssessment,
  type Proposal,
  type Rules,
} from '@/features/aisa/aisa.schema'

/** One line under the recommended step: a criterion that moved the score. */
export interface InsightPoint {
  criterion: Criterion
  /** `weak` pulls the score down; `strong` holds it up. */
  tone: 'weak' | 'strong'
  /** "Kinerja bisnis 2/5 — Baru uji coba kecil (hal. 3)" */
  text: string
}

/** Why this proposal got its recommended step, read from its own criteria. */
export interface GradeInsight {
  summary: string
  points: InsightPoint[]
}

interface Scored {
  criterion: Criterion
  item: CriterionAssessment
  weight: number
}

/** Low enough, or unsupported enough, to count against the proposal. */
const isWeak = ({ item }: Scored) => item.notMentioned || item.value <= 2
const isStrong = ({ item }: Scored) => !item.notMentioned && item.value >= 4

/** Longer reasons are cut to their first sentence so a point stays one line. */
const REASON_MAX = 120

function shortReason(reason: string): string {
  // The API appends a parenthesised note when it drops a quote it could not
  // find; the point says that in its own words, so the note is left out here.
  const plain = reason.trim().replace(/\s*\([^()]*\)\s*$/u, '')
  const first = plain.split(/(?<=[.!?])\s+(?=\p{Lu})/u)[0] ?? ''
  const clipped =
    first.length > REASON_MAX
      ? `${first.slice(0, first.lastIndexOf(' ', REASON_MAX)).trimEnd()}…`
      : first
  return clipped.replace(/[.\s]+$/u, '')
}

function pagesOf(item: CriterionAssessment): string {
  const pages = [...new Set(item.citations.map((c) => c.page))]
    .toSorted((a, b) => a - b)
    .slice(0, 3)
  return pages.length ? ` (hal. ${pages.join(', ')})` : ''
}

function pointText({ criterion, item }: Scored): string {
  const head = `${CRITERION_SHORT[criterion]} ${item.value}/5`
  if (item.notMentioned) return `${head} — tidak disebut di deck`
  const reason = shortReason(item.reason)
  const body = reason ? ` — ${reason}` : ''
  // A capped value has no quote to point at; say so instead of a page.
  const where = item.citationsUnverified
    ? ' (kutipannya tidak ditemukan di deck)'
    : pagesOf(item)
  return `${head}${body}${where}`
}

/**
 * Weakest first: lower value, then not mentioned before mentioned, then the
 * heavier weight (it costs the score more), then A–E order.
 */
function byWeakest(a: Scored, b: Scored): number {
  return (
    a.item.value - b.item.value ||
    Number(b.item.notMentioned) - Number(a.item.notMentioned) ||
    b.weight - a.weight
  )
}

/** Strongest first: higher value, then the heavier weight, then A–E order. */
function byStrongest(a: Scored, b: Scored): number {
  return b.item.value - a.item.value || b.weight - a.weight
}

/**
 * How many weak and strong points each grade leads with. Slots one side cannot
 * fill go to the other, so a grade held down by a single criterion still shows
 * what else the deck proves.
 */
const MAX_POINTS = 3

const POINTS: Record<Category, { weak: number; strong: number }> = {
  sangat_layak: { weak: 1, strong: 2 },
  layak_bersyarat: { weak: 2, strong: 1 },
  perlu_penyesuaian: { weak: 2, strong: 1 },
  risiko_tinggi: { weak: 3, strong: 0 },
  tidak_layak: { weak: 3, strong: 0 },
}

function summaryOf(
  grade: Category,
  total: number,
  weak: number,
  strong: number,
  belowFour: number,
  weakest: Scored | undefined,
): string {
  const of = (n: number) => `${n} dari ${total} kriteria`
  const noneBelowFour = `Semua ${total} kriteria bernilai 4 atau 5.`
  switch (grade) {
    case 'sangat_layak':
      return weak
        ? `Bukti kuat di ${of(strong)}, tetapi ${weak} kriteria masih lemah.`
        : `Bukti kuat di ${of(strong)}, tanpa kriteria yang lemah.`
    case 'layak_bersyarat':
      return belowFour
        ? `${of(strong)} sudah kuat. Syaratnya: bagian yang masih kurang perlu dipenuhi dulu.`
        : noneBelowFour
    case 'perlu_penyesuaian':
      return belowFour
        ? `Ada yang menjanjikan, tetapi ${of(belowFour)} belum cukup kuat dan perlu disesuaikan.`
        : noneBelowFour
    case 'risiko_tinggi':
    case 'tidak_layak': {
      const verdict =
        grade === 'tidak_layak'
          ? 'buktinya belum cukup untuk dipertimbangkan'
          : 'risikonya tinggi'
      // One weak criterion beside several strong ones: name it, since the
      // count alone ("1 dari 5") reads as if the deck were mostly fine.
      if (weak === 1 && strong && weakest)
        return `${CRITERION_SHORT[weakest.criterion]} hanya ${weakest.item.value}/5 dan menarik skor turun, jadi ${verdict}, meski ${of(strong)} sudah kuat.`
      if (weak) return `${of(weak)} lemah atau tidak dibahas, jadi ${verdict}.`
      return belowFour
        ? `Belum ada kriteria yang kuat: ${of(belowFour)} bernilai 3 atau kurang.`
        : noneBelowFour
    }
  }
}

/**
 * The reason behind the recommended step for THIS proposal, built only from
 * its stored criteria — value, reason, not-mentioned, quoted pages — with no
 * model call. Returns `null` when there are no criteria to read, so the caller
 * falls back to the grade's general meaning.
 *
 * `grade` is the effective grade: after a manager's correction the lead
 * sentence follows the corrected grade, while every number in it still comes
 * from the AI's criteria.
 */
export function gradeInsight(
  grade: Category,
  criteria: NonNullable<Proposal['assessment']>['criteria'],
  weights?: Rules['weights'] | null,
): GradeInsight | null {
  const scored: Scored[] = []
  for (const criterion of CRITERIA) {
    const item = criteria[criterion]
    if (item)
      scored.push({ criterion, item, weight: weights?.[criterion] ?? 0 })
  }
  if (!scored.length) return null

  const weak = scored.filter(isWeak).length
  const strong = scored.filter(isStrong).length
  // Everything below 4 holds the score back, a 3 included.
  const holdingBack = scored
    .filter((s) => s.item.notMentioned || s.item.value <= 3)
    .toSorted(byWeakest)
  const holdingUp = scored.filter(isStrong).toSorted(byStrongest)

  const quota = POINTS[grade]
  const weakCount = Math.min(
    holdingBack.length,
    Math.max(quota.weak, MAX_POINTS - holdingUp.length),
  )
  const weakPoints = holdingBack.slice(0, weakCount)
  const strongPoints = holdingUp.slice(0, MAX_POINTS - weakCount)
  const toPoint =
    (tone: InsightPoint['tone']) =>
    (s: Scored): InsightPoint => ({
      criterion: s.criterion,
      tone,
      text: pointText(s),
    })
  const strongFirst = grade === 'sangat_layak'
  const points = [
    ...(strongFirst ? strongPoints.map(toPoint('strong')) : []),
    ...weakPoints.map(toPoint('weak')),
    ...(strongFirst ? [] : strongPoints.map(toPoint('strong'))),
  ]

  return {
    summary: summaryOf(
      grade,
      scored.length,
      weak,
      strong,
      holdingBack.length,
      holdingBack[0],
    ),
    points,
  }
}
