import { Badge } from '@/components/ui/badge'
import { isCorrected } from '@/features/aisa/aisa.calibration'
import {
  CATEGORY_LABEL,
  QUALITY_OUTSIDE_FOCUS_LABEL,
  RESPONSE_LABEL,
  STATUS_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  type Proposal,
  showsQualityOutsideFocus,
} from '@/features/aisa/aisa.schema'

/** Effective category, or the status when there is no category to show. */
export function CategoryCell({ proposal }: { proposal: Proposal }) {
  if (proposal.effectiveCategory) {
    const corrected = isCorrected(proposal)
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge
          variant={
            proposal.effectiveCategory === 'sangat_cocok'
              ? 'default'
              : proposal.effectiveCategory === 'tidak_cocok'
                ? 'outline'
                : 'secondary'
          }
        >
          {CATEGORY_LABEL[proposal.effectiveCategory]}
        </Badge>
        {corrected ? <Badge variant="ghost">dikoreksi</Badge> : null}
        {showsQualityOutsideFocus(proposal) ? (
          <Badge variant="outline">{QUALITY_OUTSIDE_FOCUS_LABEL}</Badge>
        ) : null}
      </span>
    )
  }
  return (
    <Badge
      variant={
        proposal.status === 'perlu_dicek_manual' ? 'destructive' : 'outline'
      }
    >
      {STATUS_LABEL[proposal.status]}
    </Badge>
  )
}

export function ResponseCell({ proposal }: { proposal: Proposal }) {
  if (!proposal.response)
    return <span className="text-muted-foreground">Belum ditanggapi</span>
  return (
    <Badge variant="secondary">{RESPONSE_LABEL[proposal.response.kind]}</Badge>
  )
}
