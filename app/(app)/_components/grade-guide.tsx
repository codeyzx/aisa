import {
  CATEGORY_ACTION,
  CATEGORY_EXPLANATION,
  gradeBands,
} from '@/features/aisa/aisa.labels'
import { type Category, type Thresholds } from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CATEGORY_SOFT, GradeBadge } from './badges'

/**
 * "Cara membaca grade": the five score bands of the active rules as a
 * Skor | Grade | Aksi table, best first. `current` highlights one row, so the
 * detail page can show where its proposal sits.
 */
export function GradeGuide({
  thresholds,
  current,
  showExplanation = false,
  className,
}: {
  thresholds: Thresholds
  current?: Category | null
  showExplanation?: boolean
  className?: string
}) {
  return (
    <table
      className={cn('w-full text-left text-sm', className)}
      aria-label="Cara membaca grade"
    >
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th scope="col" className="py-1.5 pr-3 font-medium">
            Skor
          </th>
          <th scope="col" className="py-1.5 pr-3 font-medium">
            Grade
          </th>
          <th scope="col" className="py-1.5 font-medium">
            Aksi
          </th>
        </tr>
      </thead>
      <tbody>
        {gradeBands(thresholds).map((band) => {
          const active = band.category === current
          return (
            <tr
              key={band.category}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'border-b last:border-b-0',
                active && CATEGORY_SOFT[band.category],
              )}
            >
              <td className="py-2 pr-3 font-mono whitespace-nowrap tabular-nums">
                {band.text}
              </td>
              <td className="py-2 pr-3">
                <GradeBadge category={band.category} />
              </td>
              <td className="py-2">
                <span className={cn(active && 'font-semibold')}>
                  {CATEGORY_ACTION[band.category]}
                </span>
                {showExplanation ? (
                  <span className="block text-xs text-muted-foreground">
                    {CATEGORY_EXPLANATION[band.category]}
                  </span>
                ) : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
