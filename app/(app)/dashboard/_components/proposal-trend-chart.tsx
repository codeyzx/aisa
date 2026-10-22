'use client'

import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Rectangle,
  type BarShapeProps,
  XAxis,
  YAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { CATEGORIES, type Category } from '@/features/aisa/aisa.schema'
import { formatDecimal, formatNumber } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { CATEGORY_FILL } from '../../_components/badges'
import { dayLabel } from '../../_components/daily-window'
import {
  summarize,
  TREND_SERIES,
  type TrendSeries,
  type WeekBucket,
  type WeeklyTrend,
} from './weekly-trend'

const MANUAL_LABEL = 'Perlu dicek manual'

const config: Record<TrendSeries, { label: string; color: string }> = {
  ...(Object.fromEntries(
    CATEGORIES.map((c) => [
      c,
      { label: CATEGORY_LABEL[c], color: CATEGORY_FILL[c] },
    ]),
  ) as Record<Category, { label: string; color: string }>),
  manual: { label: MANUAL_LABEL, color: 'var(--muted-foreground)' },
} satisfies ChartConfig

const angka = (value: number) => formatDecimal(value, { max: 1 })

interface SummaryProps {
  label: string
  /** Used on narrow screens so the label is not truncated. */
  shortLabel?: string
  value: string
  change?: number
}

function Summary({ label, shortLabel, value, change }: SummaryProps) {
  const Icon =
    change !== undefined && change < 0 ? TrendingDownIcon : TrendingUpIcon
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground" title={label}>
        <span className="sm:hidden">{shortLabel ?? label}</span>
        <span className="max-sm:hidden">{label}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {change !== undefined ? (
          <Badge
            variant={change < 0 ? 'destructive' : 'secondary'}
            className="tabular-nums"
          >
            <Icon />
            {change > 0 ? '+' : ''}
            {angka(change)}%
          </Badge>
        ) : null}
      </div>
    </div>
  )
}

/** One bar: the week plus its counts flattened so each series has a dataKey. */
type WeekRow = WeekBucket &
  Record<TrendSeries, number> & {
    /** The topmost non-empty segment, which carries the rounded cap. */
    top: TrendSeries | null
  }

const toRow = (week: WeekBucket): WeekRow => ({
  ...week,
  ...week.counts,
  top: TREND_SERIES.findLast((s) => week.counts[s] > 0) ?? null,
})

/**
 * Each series' segment shape: only the topmost non-empty segment of a bar gets
 * the rounded cap, so a stack reads as one bar whichever grades it holds.
 */
const SEGMENT_SHAPE = Object.fromEntries(
  TREND_SERIES.map((s) => [
    s,
    (props: BarShapeProps) => (
      <Rectangle
        {...props}
        radius={
          (props.payload as WeekRow | undefined)?.top === s ? [4, 4, 0, 0] : 0
        }
      />
    ),
  ]),
) as Record<TrendSeries, (props: BarShapeProps) => React.ReactElement>

/** Why a week's bar is shorter than a full week, or `null` when it is not. */
const partNote = (week: WeekBucket) =>
  week.current
    ? 'berjalan'
    : week.recordedFrom
      ? `sejak ${dayLabel(week.recordedFrom)}`
      : null

/** The week range, with a second muted line when the week is only partly counted. */
function WeekTick({
  x,
  y,
  payload,
  rows,
}: {
  x?: number | string
  y?: number | string
  payload?: { index: number }
  rows: WeekRow[]
}) {
  const row = payload ? rows[payload.index] : undefined
  if (!row) return null
  const note = partNote(row)
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="fill-muted-foreground text-xs"
    >
      <tspan x={x} dy="0.71em">
        {row.label}
      </tspan>
      {note ? (
        <tspan x={x} dy="1.3em" className="italic">
          {note}
        </tspan>
      ) : null}
    </text>
  )
}

function WeekTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean
  payload?: readonly { payload?: WeekRow }[]
  series: readonly TrendSeries[]
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const note = row.current
    ? `berjalan, s.d. ${dayLabel(row.through)}`
    : row.recordedFrom
      ? `tercatat sejak ${dayLabel(row.recordedFrom)}`
      : null
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">
        {row.label}
        {note ? (
          <span className="font-normal text-muted-foreground"> · {note}</span>
        ) : null}
      </p>
      {/* Best grade first, the same order as the legend. */}
      {series.map((s) => (
        <div key={s} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: `var(--color-${s})` }}
          />
          <span className="flex-1 text-muted-foreground">
            {config[s].label}
          </span>
          <span className="font-mono font-medium tabular-nums">
            {formatNumber(row[s])}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 border-t pt-1.5 font-medium">
        <span>Total</span>
        <span className="font-mono tabular-nums">
          {formatNumber(row.total)}
        </span>
      </div>
    </div>
  )
}

/** Weekly proposals by grade; the chart fills the card so it lines up with its neighbour. */
export function ProposalTrendChart({
  trend,
  description,
  className,
}: {
  trend: WeeklyTrend
  description: string
  className?: string
}) {
  const { thisWeek, lastWeek, perWeek } = summarize(trend)
  const rows = trend.weeks.map(toRow)
  // Every grade stays in the legend even at zero, so it reads as the full scale;
  // the manual pile appears only when there is one.
  const series = TREND_SERIES.filter((s) => s !== 'manual' || trend.hasManual)
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader>
        <CardTitle>Tren proposal</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="grid grid-cols-3 gap-4 border-b pb-4">
          <Summary
            label="Minggu ini (berjalan)"
            shortLabel="Minggu ini"
            value={thisWeek === null ? '–' : angka(thisWeek)}
          />
          <Summary
            label="Minggu lalu"
            value={lastWeek ? angka(lastWeek.total) : '–'}
            change={lastWeek?.change}
          />
          <Summary
            label="Rata-rata per minggu penuh"
            shortLabel="Per minggu"
            value={perWeek === null ? '–' : angka(perWeek)}
          />
        </div>
        {rows.length ? (
          <div className="flex flex-1 flex-col gap-3">
            <ChartContainer
              config={config}
              className="aspect-auto min-h-64 w-full flex-1"
            >
              <BarChart
                accessibilityLayer
                data={rows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={40}
                  tick={<WeekTick rows={rows} />}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                  content={<WeekTooltip series={series} />}
                />
                {series.map((s) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="grade"
                    fill={`var(--color-${s})`}
                    stroke="var(--card)"
                    strokeWidth={2}
                    maxBarSize={56}
                    isAnimationActive={false}
                    shape={SEGMENT_SHAPE[s]}
                  >
                    {/* The running week is still filling, so it is drawn lighter. */}
                    {rows.map((row) => (
                      <Cell
                        key={row.start}
                        fillOpacity={row.current ? 0.5 : 1}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ChartContainer>
            {/* Plain HTML rather than recharts' legend: a wrapped legend inside the
              svg is measured before it wraps and overlaps the axis on a phone. */}
            <ul
              aria-label="Grade"
              className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs"
            >
              {series.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: config[s].color }}
                  />
                  {config[s].label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada data harian yang tercatat.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
