import { isCorrected } from '@/features/aisa/aisa.calibration'
import {
  isOutsideFocus,
  type Category,
  type Proposal,
  type ProposalStatus,
  type ResponseKind,
} from '@/features/aisa/aisa.schema'

/**
 * What one list row needs, cut from `Proposal` on the server so the client
 * bundle receives neither proposal text nor founder email. `founderName` is
 * shown on screen only — the CSV export leaves it out.
 */
export interface ProposalRow {
  id: string
  name: string
  founderName: string | null
  oneLiner: string | null
  sector: string | null
  stage: string | null
  fundingAskIdr: number | null
  score: number | null
  category: Category | null
  corrected: boolean
  /** Failed a fit check: lower priority, same grade. */
  outsideFocus: boolean
  /** The fit checks, so the "Di luar fokus" badge can say which failed. */
  fit: Proposal['fit']
  status: ProposalStatus
  responded: boolean
  response: ResponseKind | null
  createdAt: Date
}

export function toProposalRow(p: Proposal): ProposalRow {
  return {
    id: p.id,
    name: p.name,
    founderName: p.founder?.name ?? null,
    oneLiner: p.profile?.oneLiner ?? null,
    sector: p.profile?.sector ?? null,
    stage: p.profile?.stage ?? null,
    fundingAskIdr: p.profile?.fundingAskIdr ?? null,
    score: p.assessment?.score ?? null,
    category: p.effectiveCategory ?? null,
    corrected: isCorrected(p),
    outsideFocus: isOutsideFocus(p),
    fit: p.fit ?? null,
    status: p.status,
    responded: p.responded,
    response: p.response?.kind ?? null,
    createdAt: p.createdAt,
  }
}
