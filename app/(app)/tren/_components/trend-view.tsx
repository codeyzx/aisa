'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CATEGORY_LABEL } from '@/features/aisa/aisa.labels'
import { CATEGORIES, type Category } from '@/features/aisa/aisa.schema'
import { LOCALE } from '@/lib/format/locale'
import { formatDecimal, formatNumber } from '@/lib/format/number'

import type { TrendData } from '../trend-data'

const COLOR: Record<Category, string> = {
  sangat_cocok: 'var(--category-1)',
  cocok: 'var(--category-2)',
  kurang_cocok: 'var(--category-3)',
  tidak_cocok: 'var(--category-4)',
}
const INITIAL = { width: 320, height: 200 }
const MANUAL_COLOR = 'var(--muted-foreground)'
const MANUAL_LABEL = 'Perlu dicek manual'

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
}

const compact = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const oneDecimal = (value: number) => formatDecimal(value, { min: 1, max: 1 })

type Payload = readonly { payload?: { full?: string } }[] | undefined
const fullLabel = (_: unknown, payload: Payload) =>
  payload?.[0]?.payload?.full ?? ''

export function TrendCharts({
  data,
  dailySub,
}: {
  data: TrendData
  /** The "today vs the window" sentence, shared with the insight list. */
  dailySub: string
}) {
  const { days, sectors, tokens, scoreWeek } = data
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
        <div className="a-sub">{dailySub}</div>
        <div className="a-legend">
          {CATEGORIES.map((category) => (
            <span key={category}>
              <span className="a-sw" style={{ background: COLOR[category] }} />
              {CATEGORY_LABEL[category]}
            </span>
          ))}
          <span>
            <span className="a-sw" style={{ background: MANUAL_COLOR }} />
            {MANUAL_LABEL}
          </span>
        </div>
        <div className="h-[240px] w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={INITIAL}
          >
            <BarChart
              data={days}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fullLabel}
              />
              {CATEGORIES.map((category) => (
                <Bar
                  key={category}
                  dataKey={category}
                  name={CATEGORY_LABEL[category]}
                  stackId="proposal"
                  fill={COLOR[category]}
                />
              ))}
              <Bar
                dataKey="manual"
                name={MANUAL_LABEL}
                stackId="proposal"
                fill={MANUAL_COLOR}
                fillOpacity={0.5}
                radius={[3, 3, 0, 0]}
              />
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
            Kategori dari kode saat dinilai, sebelum koreksi manajer. Total juga
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
            <AreaChart
              data={days}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval={1}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fullLabel}
                formatter={(value) => [
                  oneDecimal(Number(value)),
                  'Rata-rata skor',
                ]}
              />
              <Area
                type="monotone"
                dataKey="avg"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.12}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 2.5, fill: 'var(--chart-2)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="a-chart a-wide">
        <h3>Pemakaian token AI</h3>
        <div className="a-sub">
          {formatNumber(tokenTotals.input + tokenTotals.output)} token dalam 14
          hari · masuk {compact.format(tokenTotals.input)} · keluar{' '}
          {compact.format(tokenTotals.output)}
        </div>
        <div className="a-legend">
          <span>
            <span className="a-sw" style={{ background: 'var(--chart-2)' }} />
            Token masuk
          </span>
          <span>
            <span className="a-sw" style={{ background: 'var(--chart-1)' }} />
            Token keluar
          </span>
        </div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={INITIAL}
          >
            <BarChart
              data={tokens}
              margin={{ top: 8, right: 8, bottom: 0, left: -6 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(value) => compact.format(Number(value))}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fullLabel}
                formatter={(value) => `${formatNumber(Number(value))} token`}
              />
              <Bar
                dataKey="input"
                name="Token masuk"
                stackId="token"
                fill="var(--chart-2)"
              />
              <Bar
                dataKey="output"
                name="Token keluar"
                stackId="token"
                fill="var(--chart-1)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
