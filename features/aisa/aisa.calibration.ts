// Manager review as calibration material: how often the manager left the AI's
// kategori standing. Pure functions over proposals the repo already parsed, so
// the rule is unit-tested here and the page only renders it.

import { CATEGORIES, type Category, type Proposal } from './aisa.schema'

/**
 * Reviewed by the manager: the proposal carries a tanggapan or a koreksi
 * kategori. A proposal with neither has no manager verdict to compare with.
 */
export function isReviewed(p: Pick<Proposal, 'response' | 'correction'>) {
  return p.response != null || p.correction != null
}

/**
 * A koreksi that disagrees with the AI: its kategori differs from the one the
 * code assigned. A koreksi back to the AI's own kategori is agreement, which is
 * also why the list badge "dikoreksi" uses this test.
 */
export function isCorrected(
  p: Pick<Proposal, 'correction' | 'category'>,
): boolean {
  return p.correction != null && p.correction.category !== p.category
}

/** `naik` moves toward Sangat cocok, `turun` toward Tidak cocok. */
export type CorrectionDirection = 'naik' | 'turun'

/**
 * Direction of a koreksi on the `CATEGORIES` scale (best first). `null` when
 * the AI gave no kategori to move from.
 */
export function correctionDirection(
  from: Category | null | undefined,
  to: Category,
): CorrectionDirection | null {
  if (!from || from === to) return null
  return CATEGORIES.indexOf(to) < CATEGORIES.indexOf(from) ? 'naik' : 'turun'
}

export interface CalibrationCorrection {
  proposal: Proposal
  correction: NonNullable<Proposal['correction']>
  direction: CorrectionDirection | null
}

export interface Calibration {
  reviewed: number
  agreed: number
  /** `agreed / reviewed` in percent; `null` when nothing was reviewed. */
  agreementPercent: number | null
  /** Disagreeing koreksi, newest first. */
  corrections: CalibrationCorrection[]
  naik: number
  turun: number
}

/** Calibration figures over `proposals`; unreviewed ones are ignored. */
export function calibrate(proposals: readonly Proposal[]): Calibration {
  const reviewed = proposals.filter(isReviewed)
  const corrections = reviewed
    .filter(isCorrected)
    .map((proposal) => {
      const correction = proposal.correction!
      return {
        proposal,
        correction,
        direction: correctionDirection(proposal.category, correction.category),
      }
    })
    .toSorted((a, b) => b.correction.at.getTime() - a.correction.at.getTime())
  const agreed = reviewed.length - corrections.length
  return {
    reviewed: reviewed.length,
    agreed,
    agreementPercent:
      reviewed.length === 0 ? null : (agreed / reviewed.length) * 100,
    corrections,
    naik: corrections.filter((c) => c.direction === 'naik').length,
    turun: corrections.filter((c) => c.direction === 'turun').length,
  }
}
