// The order proposals are ranked in wherever the dashboard lists them by merit,
// as the ringkasan in `services/api/aisa/digest.py` ranks them: the grade first
// (best first), then in-focus before "di luar fokus", then the higher score.

import { CATEGORIES, isOutsideFocus, type Proposal } from './aisa.schema'

type Ranked = Pick<Proposal, 'effectiveCategory' | 'fit' | 'assessment'>

const gradeRank = (p: Ranked) =>
  p.effectiveCategory == null
    ? CATEGORIES.length
    : CATEGORIES.indexOf(p.effectiveCategory)

/** A sort comparator: grade, then in focus before out of focus, then score. */
export function compareByGrade(a: Ranked, b: Ranked): number {
  return (
    gradeRank(a) - gradeRank(b) ||
    Number(isOutsideFocus(a)) - Number(isOutsideFocus(b)) ||
    (b.assessment?.score ?? 0) - (a.assessment?.score ?? 0)
  )
}
