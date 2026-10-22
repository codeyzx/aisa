'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { usdToIdr } from '@/features/aisa/aisa.pricing'
import { formatUsd } from '@/lib/format/currency'

import { agentColor } from '../../_components/badges'
import { type CostDay, KIND_AGENT, PRICED_KINDS } from '../cost-data'
import { compactRupiah, rupiah } from '../money'

const INITIAL = { width: 320, height: 200 }
const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
}

type Payload = readonly { payload?: { full?: string } }[] | undefined
const fullLabel = (_: unknown, payload: Payload) =>
  payload?.[0]?.payload?.full ?? ''

/** A one- or two-day area reads as nothing or a bare slope; dot each day. */
const fewPointDot = (count: number, color: string) =>
  count < 3 ? { r: 3, fill: color, strokeWidth: 0 } : false

/** Room at both ends, so the first and last day's label are not cut off. */
const EDGE_PAD = { left: 16, right: 16 }

/** Daily cost in rupiah as areas stacked by agent; the exact values sit in a table. */
export function CostTrendChart({ days }: { days: CostDay[] }) {
  if (!days.length)
    return (
      <p className="text-sm text-muted-foreground">
        Grafik muncul setelah AI dipakai untuk pertama kali.
      </p>
    )
  const rows = days.map((d) => ({
    ...d,
    penilaian: usdToIdr(d.penilaian),
    ringkasan: usdToIdr(d.ringkasan),
    asisten: usdToIdr(d.asisten),
  }))
  return (
    <>
      <div className="a-legend">
        {PRICED_KINDS.map((kind) => (
          <span key={kind}>
            <span
              className="a-sw"
              style={{ background: agentColor(KIND_AGENT[kind].agent) }}
            />
            {KIND_AGENT[kind].agent}
          </span>
        ))}
      </div>
      <div className="h-[220px] w-full md:h-[300px]">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={INITIAL}
        >
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              minTickGap={12}
              padding={EDGE_PAD}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={64}
              tickFormatter={(value) => compactRupiah(Number(value))}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border)' }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fullLabel}
              // Legend order, not the default alphabetical-by-name.
              itemSorter={({ dataKey }) =>
                PRICED_KINDS.findIndex((kind) => kind === dataKey)
              }
              formatter={(value) => rupiah(Number(value))}
            />
            {PRICED_KINDS.map((kind) => {
              const color = agentColor(KIND_AGENT[kind].agent)
              return (
                <Area
                  key={kind}
                  type="monotone"
                  dataKey={kind}
                  name={KIND_AGENT[kind].agent}
                  stackId="biaya"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.55}
                  strokeWidth={1.5}
                  dot={fewPointDot(rows.length, color)}
                  activeDot={{ r: 3 }}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-primary">
          Lihat sebagai tabel
        </summary>
        <div className="a-tablewrap mt-2">
          <table className="a-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Tanggal</th>
                {PRICED_KINDS.map((kind) => (
                  <th key={kind} className="a-r">
                    {KIND_AGENT[kind].agent}
                  </th>
                ))}
                <th className="a-r">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <td>{day.label}</td>
                  {PRICED_KINDS.map((kind) => (
                    <td key={kind} className="a-r font-mono">
                      {rupiah(usdToIdr(day[kind]))}
                    </td>
                  ))}
                  <td className="a-r font-mono" title={formatUsd(day.usd)}>
                    {rupiah(usdToIdr(day.usd))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}
