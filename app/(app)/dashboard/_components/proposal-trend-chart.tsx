'use client'

import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { formatDecimal } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import type { WeeklyTrend } from './weekly-trend'

const config = {
  total: { label: 'Proposal masuk', color: 'var(--chart-2)' },
  sangatCocok: { label: 'Sangat cocok', color: 'var(--category-1-fill)' },
} satisfies ChartConfig

const angka = (value: number) => formatDecimal(value, { max: 1 })

const percentChange = (now: number, before: number) =>
  before ? ((now - before) / before) * 100 : undefined

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

/** Weekly trend card; the chart fills the card so it lines up with its neighbour. */
export function ProposalTrendChart({
  trend,
  description,
  className,
}: {
  trend: WeeklyTrend
  description: string
  className?: string
}) {
  const { current, previous, points, weeks } = trend
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader>
        <CardTitle>Tren proposal</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="grid grid-cols-3 gap-4 border-b pb-4">
          <Summary
            label="Proposal masuk"
            value={angka(current.total)}
            change={
              previous
                ? percentChange(current.total, previous.total)
                : undefined
            }
          />
          <Summary
            label="Sangat cocok"
            value={angka(current.sangatCocok)}
            change={
              previous
                ? percentChange(current.sangatCocok, previous.sangatCocok)
                : undefined
            }
          />
          <Summary
            label="Rata-rata per minggu"
            shortLabel="Per minggu"
            value={angka(weeks ? current.total / weeks : 0)}
          />
        </div>
        {points.length ? (
          <ChartContainer
            config={config}
            className="aspect-auto min-h-64 w-full flex-1"
          >
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="trend-total" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-total)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-total)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient id="trend-top" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-sangatCocok)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-sangatCocok)"
                    stopOpacity={0.04}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="minggu"
                tickLine={false}
                axisLine={false}
                minTickGap={16}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <ChartTooltip
                cursor={{ strokeDasharray: '4 4' }}
                content={<ChartTooltipContent indicator="line" />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                dataKey="total"
                type="monotone"
                stroke="var(--color-total)"
                strokeWidth={2}
                fill="url(#trend-total)"
                activeDot={{ r: 4 }}
              />
              <Area
                dataKey="sangatCocok"
                type="monotone"
                stroke="var(--color-sangatCocok)"
                strokeWidth={2}
                fill="url(#trend-top)"
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada data harian yang tercatat.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
