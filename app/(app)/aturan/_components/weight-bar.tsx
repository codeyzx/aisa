import {
  CRITERION_LABEL,
  CRITERION_LETTER,
  CRITERION_SHORT,
} from '@/features/aisa/aisa.labels'
import { CRITERIA, type Criterion } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CRITERION_COLOR } from '../../_components/badges'

import { num } from './helpers'

/** Stacked bar: each part's width is a criterion's weight in percent. */
export function WeightBar({
  percent,
  showLabels = true,
  className,
}: {
  percent: Record<Criterion, number>
  showLabels?: boolean
  className?: string
}) {
  const total = CRITERIA.reduce((sum, c) => sum + (percent[c] || 0), 0)
  const scale = Math.max(100, total)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="sr-only">
        {CRITERIA.map(
          (c) =>
            `${CRITERION_LETTER[c]}. ${CRITERION_LABEL[c]} ${num(percent[c] || 0)}%`,
        ).join(', ')}
      </span>
      <div
        aria-hidden
        // The 2px gaps show the surface, so neighbouring criterion fills never
        // touch; the unassigned remainder is its own muted segment.
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {CRITERIA.map((c) => {
          const value = percent[c] || 0
          if (!value) return null
          return (
            <div
              key={c}
              className={cn(
                'h-full transition-[width] duration-300',
                CRITERION_COLOR[c],
              )}
              style={{ width: `${(value / scale) * 100}%` }}
            />
          )
        })}
        {total < 100 && <div className="h-full flex-1 bg-muted" />}
      </div>
      {showLabels && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {CRITERIA.map((c) => (
            <li
              key={c}
              className="flex items-center gap-1.5 text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn('size-2.5 rounded-[3px]', CRITERION_COLOR[c])}
              />
              <span className="font-mono font-semibold">
                {CRITERION_LETTER[c]}
              </span>
              {CRITERION_SHORT[c]}
              <span className="font-mono font-medium text-foreground tabular-nums">
                {num(percent[c] || 0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
