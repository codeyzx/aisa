import { CATEGORY_LABEL, gradeBands } from '@/features/aisa/aisa.labels'
import {
  CATEGORIES,
  type Category,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { cn } from '@/lib/utils'

import { CATEGORY_DOT } from '../../_components/badges'

import { num } from './helpers'

const BIN = 4

const SOFT: Record<Category, string> = {
  sangat_layak: 'bg-category-1-fill/15 border-category-1-fill',
  layak_bersyarat: 'bg-category-2-fill/15 border-category-2-fill',
  perlu_penyesuaian: 'bg-category-3-fill/20 border-category-3-fill',
  risiko_tinggi: 'bg-category-4-fill/20 border-category-4-fill',
  tidak_layak: 'bg-category-5-fill/15 border-category-5-fill',
}

/**
 * The 0–100 score scale with the five grade bands. With `points`, a histogram of
 * the proposals' scores (coloured by the grade each one carries) sits above.
 */
export function Scale({
  thresholds,
  points,
  className,
}: {
  thresholds: Rules['thresholds']
  points?: readonly { score: number; category: Category }[]
  className?: string
}) {
  // Worst band on the left, so the bar reads like the 0–100 axis under it.
  const bands = gradeBands(thresholds)
    .toReversed()
    .map((band) => ({
      category: band.category,
      text: band.text,
      from: band.min,
      to: band.below ?? 100,
    }))
  const marks = bands.slice(1).map((band) => band.from)

  const bins = points
    ? Array.from({ length: 100 / BIN }, (_, i) => {
        const from = i * BIN
        const to = i === 100 / BIN - 1 ? 101 : from + BIN
        const inBin = points.filter((p) => p.score >= from && p.score < to)
        return {
          from,
          to: Math.min(100, to - 1),
          total: inBin.length,
          parts: CATEGORIES.toReversed().map((category) => ({
            category,
            count: inBin.filter((p) => p.category === category).length,
          })),
        }
      })
    : []
  const max = Math.max(1, ...bins.map((b) => b.total))

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {points && (
        <div className="relative h-20" aria-hidden>
          <div className="flex h-full items-end gap-[2px]">
            {bins.map((bin) => (
              <div
                key={bin.from}
                title={`Skor ${bin.from}–${bin.to}: ${bin.total} proposal`}
                className="flex h-full flex-1 flex-col-reverse"
              >
                {bin.parts.map(
                  (part) =>
                    part.count > 0 && (
                      <div
                        key={part.category}
                        className={cn(
                          // A card-coloured edge between stacked grade fills.
                          'w-full border-card not-last:border-t-2 first:rounded-b-[2px] last:rounded-t-[3px]',
                          CATEGORY_DOT[part.category],
                        )}
                        style={{ height: `${(part.count / max) * 100}%` }}
                      />
                    ),
                )}
              </div>
            ))}
          </div>
          {marks.map((mark) => (
            <div
              key={mark}
              className="absolute inset-y-0 border-l border-dashed border-foreground/25"
              style={{ left: `${mark}%` }}
            />
          ))}
        </div>
      )}

      <div className="flex h-9 w-full overflow-hidden rounded-md">
        {bands.map((band) => (
          <div
            key={band.category}
            title={`${CATEGORY_LABEL[band.category]}: skor ${band.text}`}
            className={cn(
              'flex min-w-0 items-center justify-center border-t-[3px] px-1 transition-[width] duration-300',
              SOFT[band.category],
            )}
            style={{ width: `${Math.max(0, band.to - band.from)}%` }}
          >
            <span className="hidden truncate text-xs font-medium md:block">
              {CATEGORY_LABEL[band.category]}
            </span>
          </div>
        ))}
      </div>

      <div className="relative h-4 font-mono text-[11px] text-muted-foreground tabular-nums">
        <span className="absolute left-0">0</span>
        {marks.map((mark) => (
          <span
            key={mark}
            className="absolute -translate-x-1/2 font-medium text-foreground"
            style={{ left: `${mark}%` }}
          >
            {num(mark)}
          </span>
        ))}
        <span className="absolute right-0">100</span>
      </div>
    </div>
  )
}
