import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
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
  sangat_cocok: 'bg-category-1-fill/15 border-category-1-fill',
  cocok: 'bg-category-2-fill/15 border-category-2-fill',
  kurang_cocok: 'bg-category-3-fill/15 border-category-3-fill',
  tidak_cocok: 'bg-category-4-fill/20 border-category-4-fill',
}

/**
 * The 0–100 score scale with the kategori bands. With `points`, a histogram of
 * the proposals' scores (coloured by the kategori each one carries) sits above.
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
  const t = thresholds
  const bands: { category: Category; from: number; to: number }[] = [
    { category: 'tidak_cocok', from: 0, to: t.kurangCocok },
    { category: 'kurang_cocok', from: t.kurangCocok, to: t.cocok },
    { category: 'cocok', from: t.cocok, to: t.sangatCocok },
    { category: 'sangat_cocok', from: t.sangatCocok, to: 100 },
  ]
  const marks = [t.kurangCocok, t.cocok, t.sangatCocok]

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
                          // A card-coloured edge between stacked kategori fills.
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
            className={cn(
              'flex min-w-0 items-center justify-center border-t-[3px] px-1 transition-[width] duration-300',
              SOFT[band.category],
            )}
            style={{ width: `${Math.max(0, band.to - band.from)}%` }}
          >
            <span className="hidden truncate text-xs font-medium sm:block">
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
