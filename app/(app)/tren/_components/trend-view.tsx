'use client'

import {
  Bar,
  BarChart,
  type BarShapeProps,
  BarStack,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'

import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { CATEGORIES } from '@/features/aisa/aisa.schema'
import { LOCALE } from '@/lib/format/locale'
import { formatDecimal, formatNumber } from '@/lib/format/number'

import { CATEGORY_FILL } from '../../_components/badges'
import { fromFirstValue } from '../../_components/daily-window'

import type { DayRow, TokenDay, TrendData } from '../trend-data'

const INITIAL = { width: 320, height: 200 }
const MANUAL_LABEL = 'Perlu dicek manual'

/** How a series is shown: its name and its fill. */
interface SeriesStyle {
  label: string
  color: string
}

/** A charted series: the datum field it reads, and how it is shown. */
interface Series<Row> extends SeriesStyle {
  key: keyof Row & string
}

/**
 * Grades bottom-up from Sangat layak, then the ungraded "perlu dicek manual"
 * in neutral grey on top, so the stack reads in the legend's order.
 */
const PROPOSAL_SERIES: readonly Series<DayRow>[] = [
  ...CATEGORIES.map((category) => ({
    key: category,
    label: CATEGORY_LABEL[category],
    color: CATEGORY_FILL[category],
  })),
  {
    key: 'manual' as const,
    label: MANUAL_LABEL,
    color: 'var(--muted-foreground)',
  },
]
const TOKEN_SERIES: readonly Series<TokenDay>[] = [
  { key: 'input', label: 'Token masuk', color: 'var(--chart-2)' },
  { key: 'output', label: 'Token keluar', color: 'var(--chart-1)' },
]
const SCORE_COLOR = 'var(--chart-2)'

const compact = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const oneDecimal = (value: number) => formatDecimal(value, { min: 1, max: 1 })

const noProposal = (day: DayRow) =>
  day.total === 0 &&
  day.manual === 0 &&
  CATEGORIES.every((category) => day[category] === 0)
const noToken = (day: TokenDay) => day.input === 0 && day.output === 0

/** Shared by every chart so the four read as one set. */
const CHART_MARGIN = { top: 8, right: 4, bottom: 0, left: -12 }
/** Columns stay thin however few days are shown; the rest of the slot is air. */
const MAX_BAR = 24
/** A 4px rounded top on the column (the whole stack), square at the baseline. */
const TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0]
const HOVER_BAND = { fill: 'var(--muted)', opacity: 0.6 }
const GAP = 2

/**
 * A stacked segment that gives up its bottom 2px, so neighbouring grades are
 * split by a gap of whatever is behind the chart rather than an outline drawn
 * in a guessed surface colour. The segment sitting on the baseline keeps its
 * full height, so the column still starts at zero; a sliver too thin to spare
 * 2px keeps its height too rather than vanishing.
 */
function GappedSegment(props: BarShapeProps) {
  const { x, y, width, height, fill, stackedBarStart } = props
  if (!height || height <= 0) return null
  const onBaseline = Math.abs(y + height - stackedBarStart) < 0.5
  const gap = onBaseline || height <= GAP + 1 ? 0 : GAP
  return (
    <Rectangle x={x} y={y} width={width} height={height - gap} fill={fill} />
  )
}

interface TipRow {
  label: string
  value: string
  color?: string
}

/** One tooltip for every chart: the full day, then one row per series. */
function TipBox({
  title,
  rows,
  note,
}: {
  title: string
  rows: TipRow[]
  note?: string
}) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 font-medium">{title}</p>
      {rows.length ? (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2">
              {row.color ? (
                <span
                  aria-hidden
                  className="a-sw"
                  style={{ background: row.color }}
                />
              ) : null}
              <span className="text-muted-foreground">{row.label}</span>
              <span className="ml-auto pl-3 font-mono tabular-nums">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-1.5 text-muted-foreground">{note}</p> : null}
    </div>
  )
}

/** The datum under the pointer, or nothing while the tooltip is idle. */
function hovered<Row>({ active, payload }: TooltipContentProps): Row | null {
  return active && payload[0]?.payload ? (payload[0].payload as Row) : null
}

/**
 * Series rows for a stacked column, top segment first so the list reads in
 * the order the eye meets the column; a series with nothing that day is left
 * out instead of listed as a zero.
 */
const stackRows = <Row,>(
  series: readonly Series<Row>[],
  row: Row,
  unit: string,
): TipRow[] =>
  series
    .filter(({ key }) => Number(row[key]) > 0)
    .map(({ key, label, color }) => ({
      label,
      color,
      value: `${formatNumber(Number(row[key]))}${unit}`,
    }))
    .toReversed()

function Legend({ series }: { series: readonly SeriesStyle[] }) {
  return (
    <div className="a-legend">
      {series.map(({ label, color }) => (
        <span key={label}>
          <span className="a-sw" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}

/** The axis styling every chart here shares. */
const axisProps = { tickLine: false, axisLine: false, fontSize: 11 } as const

/** The day's total, then each grade it got, top of the column first. */
function ProposalTip(props: TooltipContentProps) {
  const day = hovered<DayRow>(props)
  if (!day) return null
  const rows = stackRows(PROPOSAL_SERIES, day, '')
  return (
    <TipBox
      title={day.full}
      rows={[
        {
          label: 'Total masuk',
          value: `${formatNumber(day.total)} proposal`,
        },
        ...rows,
      ]}
      note={rows.length ? undefined : 'Belum ada yang dinilai'}
    />
  )
}

/** The day's mean score, or that nothing was scored that day. */
function ScoreTip(props: TooltipContentProps) {
  const day = hovered<DayRow>(props)
  if (!day) return null
  return day.avg === null ? (
    <TipBox title={day.full} rows={[]} note="Belum ada proposal yang dinilai" />
  ) : (
    <TipBox
      title={day.full}
      rows={[
        {
          label: 'Rata-rata skor',
          value: oneDecimal(day.avg),
          color: SCORE_COLOR,
        },
      ]}
    />
  )
}

/** The day's tokens in and out. */
function TokenTip(props: TooltipContentProps) {
  const day = hovered<TokenDay>(props)
  if (!day) return null
  const rows = stackRows(TOKEN_SERIES, day, ' token')
  return (
    <TipBox
      title={day.full}
      rows={rows}
      note={rows.length ? undefined : 'Tidak ada pemakaian'}
    />
  )
}

/** " · grafik mulai 21 Okt" when the chart starts after the window does. */
const sinceNote = (shown: { label: string }[], window: unknown[]) =>
  shown.length < window.length && shown[0]
    ? ` · grafik mulai ${shown[0].label}`
    : ''

export function TrendCharts({
  data,
  dailySub,
}: {
  data: TrendData
  /** The "today vs the window" sentence, shared with the insight list. */
  dailySub: string
}) {
  const { sectors, scoreWeek } = data
  const days = fromFirstValue(data.days, noProposal)
  const tokens = fromFirstValue(data.tokens, noToken)
  const maxSector = Math.max(1, ...sectors.map((row) => row.now))
  const tokenTotals = tokens.reduce(
    (sum, d) => ({ input: sum.input + d.input, output: sum.output + d.output }),
    { input: 0, output: 0 },
  )
  const scoreSub =
    scoreWeek.now === null
      ? 'Belum ada proposal yang dinilai dalam 7 hari terakhir'
      : scoreWeek.before === null
        ? `7 hari terakhir ${oneDecimal(scoreWeek.now)}`
        : `7 hari terakhir ${oneDecimal(scoreWeek.now)}, ${scoreWeek.now >= scoreWeek.before ? 'naik' : 'turun'} dari ${oneDecimal(scoreWeek.before)}`

  return (
    <div className="a-charts">
      <div className="a-chart a-wide">
        <h3>Proposal masuk per hari</h3>
        <div className="a-sub">
          {dailySub}
          {sinceNote(days, data.days)}
        </div>
        <Legend series={PROPOSAL_SERIES} />
        <div className="h-[240px] w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={INITIAL}
          >
            <BarChart data={days} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" {...axisProps} minTickGap={8} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip cursor={HOVER_BAND} content={ProposalTip} />
              <BarStack radius={TOP_RADIUS}>
                {PROPOSAL_SERIES.map(({ key, label, color }) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={label}
                    fill={color}
                    maxBarSize={MAX_BAR}
                    shape={GappedSegment}
                  />
                ))}
              </BarStack>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-primary">
            Lihat sebagai tabel
          </summary>
          <div className="a-tablewrap mt-2">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th className="a-r">Total</th>
                  {CATEGORIES.map((category) => (
                    <th key={category} className="a-r">
                      {CATEGORY_LABEL[category]}
                    </th>
                  ))}
                  <th className="a-r">{MANUAL_LABEL}</th>
                  <th className="a-r">Rata-rata skor</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date}>
                    <td>{day.label}</td>
                    <td className="a-r font-mono">{day.total}</td>
                    {CATEGORIES.map((category) => (
                      <td key={category} className="a-r font-mono">
                        {day[category]}
                      </td>
                    ))}
                    <td className="a-r font-mono">{day.manual}</td>
                    <td className="a-r font-mono">
                      {day.avg === null ? '–' : oneDecimal(day.avg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Grade dari kode saat dinilai, sebelum koreksi manajer. Total juga
            menghitung proposal yang masih antre.
          </p>
        </details>
      </div>

      <div className="a-chart">
        <h3>Proposal per sektor</h3>
        <div className="a-sub">Minggu ini, dengan selisih dari minggu lalu</div>
        {sectors.length ? (
          <div className="flex flex-col gap-2.5">
            {sectors.slice(0, 7).map((row) => {
              const delta = row.now - row.before
              return (
                <div
                  key={row.sector}
                  className="grid grid-cols-[104px_1fr_64px] items-center gap-2 text-xs"
                >
                  <span className="truncate text-muted-foreground">
                    {row.sector}
                  </span>
                  <span className="h-4 overflow-hidden rounded bg-muted">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${Math.max(6, (row.now / maxSector) * 100)}%`,
                        background: 'var(--chart-2)',
                      }}
                    />
                  </span>
                  <span className="font-mono whitespace-nowrap tabular-nums">
                    {row.now}{' '}
                    <span className="text-muted-foreground">
                      ({delta >= 0 ? '+' : ''}
                      {delta})
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada data.</p>
        )}
      </div>

      <div className="a-chart">
        <h3>Rata-rata skor kualitas per hari</h3>
        <div className="a-sub">{scoreSub}</div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={INITIAL}
          >
            <BarChart data={days} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" {...axisProps} minTickGap={8} />
              <YAxis
                {...axisProps}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Tooltip cursor={HOVER_BAND} content={ScoreTip} />
              <Bar
                dataKey="avg"
                name="Rata-rata skor"
                fill={SCORE_COLOR}
                radius={TOP_RADIUS}
                maxBarSize={MAX_BAR}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="a-chart a-wide">
        <h3>Pemakaian token AI</h3>
        <div className="a-sub">
          {formatNumber(tokenTotals.input + tokenTotals.output)} token dalam 14
          hari · masuk {compact.format(tokenTotals.input)} · keluar{' '}
          {compact.format(tokenTotals.output)}
          {sinceNote(tokens, data.tokens)}
        </div>
        <Legend series={TOKEN_SERIES} />
        <div className="h-[200px] w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={INITIAL}
          >
            <BarChart data={tokens} margin={{ ...CHART_MARGIN, left: -2 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" {...axisProps} minTickGap={8} />
              <YAxis
                {...axisProps}
                tickFormatter={(value) => compact.format(Number(value))}
              />
              <Tooltip cursor={HOVER_BAND} content={TokenTip} />
              <BarStack radius={TOP_RADIUS}>
                {TOKEN_SERIES.map(({ key, label, color }) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={label}
                    fill={color}
                    maxBarSize={MAX_BAR}
                    shape={GappedSegment}
                  />
                ))}
              </BarStack>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
