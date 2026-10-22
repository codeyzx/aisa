'use client'

import { CompassIcon } from 'lucide-react'

import { Badge, badgeVariants } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  failedFitChecks,
  OUTSIDE_FOCUS_LABEL,
  OUTSIDE_FOCUS_MEANING,
} from '@/features/aisa/aisa.labels'
import { type Proposal } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

const STYLE =
  'border-dashed border-muted-foreground bg-muted/60 text-foreground'

/**
 * "Di luar fokus": the proposal failed a fit check. It sits beside the grade and
 * never changes it. Hover or tap opens why — low priority, and which checks
 * failed — so the badge is a button; a click on it stays out of a clickable row.
 * `interactive={false}` is for a badge inside a link (a whole row that opens the
 * proposal): a button there would be nested interactive content, so the badge
 * stays plain text and carries the same explanation as its `title`.
 */
export function OutsideFocusBadge({
  fit,
  interactive = true,
  className,
}: {
  fit: Proposal['fit']
  interactive?: boolean
  className?: string
}) {
  const failed = failedFitChecks(fit)
  if (!interactive)
    return (
      <Badge
        variant="outline"
        title={[OUTSIDE_FOCUS_MEANING, ...failed].join('\n')}
        className={cn(STYLE, className)}
      >
        <CompassIcon aria-hidden />
        {OUTSIDE_FOCUS_LABEL}
      </Badge>
    )
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          badgeVariants({ variant: 'outline' }),
          'cursor-help',
          STYLE,
          className,
        )}
      >
        <CompassIcon aria-hidden />
        {OUTSIDE_FOCUS_LABEL}
      </PopoverTrigger>
      <PopoverContent className="w-72 gap-2 text-sm" align="start">
        <p className="font-medium">{OUTSIDE_FOCUS_LABEL}</p>
        <p className="text-muted-foreground">{OUTSIDE_FOCUS_MEANING}</p>
        {failed.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {failed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Grade tidak berubah; hanya prioritasnya yang lebih rendah.
        </p>
      </PopoverContent>
    </Popover>
  )
}
