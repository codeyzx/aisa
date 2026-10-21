import { formatNumber } from '@/lib/format/number'

export interface ChartPoint {
  label: string
  value: number
}

/**
 * A single-series column chart in plain HTML — no chart library. One series, so
 * no legend: the card title names it. Every column carries its value as a hover
 * tooltip and the same numbers sit in a table under "Lihat tabel", so the chart
 * is never the only way to read them.
 */
export function ColumnChart({
  points,
  caption,
  unit,
}: {
  points: ChartPoint[]
  caption: string
  unit?: string
}) {
  const max = Math.max(1, ...points.map((point) => point.value))
  if (points.length === 0)
    return <p className="text-sm text-muted-foreground">Belum ada data.</p>
  return (
    <figure className="space-y-2" aria-label={caption}>
      <div
        className="flex h-40 items-end gap-0.5 border-b border-border"
        aria-hidden
      >
        {points.map((point) => (
          <div
            key={point.label}
            className="group relative flex h-full flex-1 items-end"
            title={`${point.label}: ${formatNumber(point.value)}${unit ? ` ${unit}` : ''}`}
          >
            <div
              className="w-full rounded-t-[4px] bg-primary/80 group-hover:bg-primary"
              style={{ height: `${(point.value / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 text-[10px] text-muted-foreground tabular-nums">
        {points.map((point, index) => (
          <span key={point.label} className="flex-1 truncate text-center">
            {index % Math.ceil(points.length / 7) === 0 ? point.label : ''}
          </span>
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Maksimum {formatNumber(max)}
        {unit ? ` ${unit}` : ''}.
      </figcaption>
      <DataTableDetails points={points} unit={unit} />
    </figure>
  )
}

/** Horizontal bars for a ranked breakdown (per sector, per category). */
export function BarList({
  points,
  unit,
}: {
  points: ChartPoint[]
  unit?: string
}) {
  const max = Math.max(1, ...points.map((point) => point.value))
  if (points.length === 0)
    return <p className="text-sm text-muted-foreground">Belum ada data.</p>
  return (
    <ul className="space-y-2">
      {points.map((point) => (
        <li key={point.label} className="space-y-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate">{point.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatNumber(point.value)}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary/80"
              style={{ width: `${(point.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function DataTableDetails({
  points,
  unit,
}: {
  points: ChartPoint[]
  unit?: string
}) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Lihat tabel
      </summary>
      <table className="mt-2 w-full">
        <tbody>
          {points.map((point) => (
            <tr key={point.label} className="border-b border-border/50">
              <td className="py-0.5">{point.label}</td>
              <td className="py-0.5 text-right tabular-nums">
                {formatNumber(point.value)}
                {unit ? ` ${unit}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** `2026-10-21` → `21/10`. */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}
