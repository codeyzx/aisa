import { CRITERION_LABEL, CRITERION_LETTER } from '@/features/aisa/aisa.labels'
import { type Criterion } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CRITERION_COLOR } from '../../_components/badges'

/**
 * A criterion as the guide names it: its colour swatch, its letter (A–E) and
 * its label. The letter keeps the order readable without the colour.
 */
export function CriterionName({
  criterion,
  className,
}: {
  criterion: Criterion
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn(
          'size-2.5 shrink-0 rounded-[3px]',
          CRITERION_COLOR[criterion],
        )}
      />
      <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
        {CRITERION_LETTER[criterion]}
      </span>
      <span className="truncate">{CRITERION_LABEL[criterion]}</span>
    </span>
  )
}
