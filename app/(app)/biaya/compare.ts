/**
 * "AISA vs cek manual": what first-pass screening costs when an analyst reads
 * every deck, against AISA's model cost plus the minutes someone still spends
 * reading AISA's result. The decision itself stays with the manager in both
 * cases, so neither side counts it.
 */
import { usdToIdr } from '@/features/aisa/aisa.pricing'

export interface CompareInputs {
  proposalsPerMonth: number
  /** Analyst minutes to screen one deck by hand. */
  manualMinutes: number
  /** Minutes to read AISA's assessment of one proposal. */
  reviewMinutes: number
  monthlyPayIdr: number
  hoursPerMonth: number
}

export const COMPARE_DEFAULTS: Omit<CompareInputs, 'proposalsPerMonth'> = {
  manualMinutes: 15,
  reviewMinutes: 2,
  monthlyPayIdr: 14_500_000,
  hoursPerMonth: 173,
}

/** The scheduler sends a ringkasan at 09.00 and 17.00 WIB: at most 60 a month. */
export const DIGESTS_PER_MONTH = 60

export interface CompareResult {
  hourlyIdr: number
  manual: { perProposalIdr: number; monthIdr: number }
  aisa: {
    aiPerProposalIdr: number
    reviewPerProposalIdr: number
    perProposalIdr: number
    digestsMonthIdr: number
    monthIdr: number
  }
  savedMonthIdr: number
  /** Share of the manual cost saved, 0–100; `null` when manual costs nothing. */
  savedPercent: number | null
  /** How many times cheaper AISA is; `null` when AISA's side is zero. */
  times: number | null
  hoursBackPerMonth: number
}

export function compare(
  inputs: CompareInputs,
  /** Mean model cost of one assessed proposal and one ringkasan, in USD. */
  unit: { proposalUsd: number; digestUsd: number },
): CompareResult {
  const n = Math.max(0, inputs.proposalsPerMonth)
  const hourlyIdr =
    inputs.hoursPerMonth > 0 ? inputs.monthlyPayIdr / inputs.hoursPerMonth : 0
  const perMinute = hourlyIdr / 60
  const manualPer = inputs.manualMinutes * perMinute
  const aiPer = usdToIdr(unit.proposalUsd)
  const reviewPer = inputs.reviewMinutes * perMinute
  const digestsMonthIdr = DIGESTS_PER_MONTH * usdToIdr(unit.digestUsd)
  const manualMonth = n * manualPer
  const aisaMonth = n * (aiPer + reviewPer) + digestsMonthIdr
  return {
    hourlyIdr,
    manual: { perProposalIdr: manualPer, monthIdr: manualMonth },
    aisa: {
      aiPerProposalIdr: aiPer,
      reviewPerProposalIdr: reviewPer,
      perProposalIdr: aiPer + reviewPer,
      digestsMonthIdr,
      monthIdr: aisaMonth,
    },
    savedMonthIdr: manualMonth - aisaMonth,
    savedPercent:
      manualMonth > 0 ? ((manualMonth - aisaMonth) / manualMonth) * 100 : null,
    times: aisaMonth > 0 ? manualMonth / aisaMonth : null,
    hoursBackPerMonth:
      (n * Math.max(0, inputs.manualMinutes - inputs.reviewMinutes)) / 60,
  }
}
