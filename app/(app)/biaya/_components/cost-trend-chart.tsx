'use client'

import {
  Bar,
  BarChart,
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

/** Daily cost in rupiah, stacked by agent; the exact values sit in a table. */
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
          <BarChart
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
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={64}
              tickFormatter={(value) => compactRupiah(Number(value))}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fullLabel}
              // Legend order, not the default alphabetical-by-name.
              itemSorter={({ dataKey }) =>
                PRICED_KINDS.findIndex((kind) => kind === dataKey)
              }
              formatter={(value) => rupiah(Number(value))}
            />
            {PRICED_KINDS.map((kind, index) => (
              <Bar
                key={kind}
                dataKey={kind}
                name={KIND_AGENT[kind].agent}
                stackId="biaya"
                fill={agentColor(KIND_AGENT[kind].agent)}
                maxBarSize={36}
                radius={
                  index === PRICED_KINDS.length - 1 ? [3, 3, 0, 0] : undefined
                }
              />
            ))}
          </BarChart>
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
