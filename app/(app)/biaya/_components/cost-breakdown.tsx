import { ratesOn, usdToIdr } from '@/features/aisa/aisa.pricing'
import { formatUsd } from '@/lib/format/currency'
import { formatNumber } from '@/lib/format/number'

import { agentColor } from '../../_components/badges'
import { compact } from '../../aktivitas/_components/format'
import { type CostData, KIND_AGENT } from '../cost-data'
import { rupiah, share } from '../money'

const INPUT_COLOR = 'var(--chart-3)'
const OUTPUT_COLOR = 'var(--chart-1)'

/** Cost per agent, and the input-vs-output split that explains most of it. */
export function CostBreakdown({
  data,
  model,
  today,
}: {
  data: CostData
  /** The Penilai's configured model, whose tariff the token explanation quotes. */
  model: string | null
  today: string
}) {
  const { cost, tokens } = data
  const max = Math.max(0, ...data.kinds.map((k) => k.cost?.usd ?? 0))
  const kinds = data.kinds.toSorted(
    (a, b) => (b.cost?.usd ?? -1) - (a.cost?.usd ?? -1),
  )
  const allTokens = tokens.in + tokens.out
  // One output token costs this many input tokens at today's tariff.
  const rates = ratesOn(model, today)
  const ratio = rates ? rates.output / rates.input : null

  return (
    <div className="a-chart">
      <h3>Ke mana biayanya</h3>
      <div className="a-sub">Per agent, dari semua token yang tercatat</div>
      <ul className="flex flex-col gap-3" aria-label="Biaya per agent">
        {kinds.map(({ kind, cost: kindCost, tokens: t }) => {
          const { agent, does } = KIND_AGENT[kind]
          const usd = kindCost?.usd ?? 0
          return (
            <li key={kind} className="grid gap-1.5" data-kind={kind}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="a-sw"
                    style={{ background: agentColor(agent) }}
                  />
                  <span className="truncate font-medium">{agent}</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums">
                  {kindCost ? rupiah(usdToIdr(usd)) : 'tarif belum tersedia'}
                  {kindCost ? (
                    <span className="ml-2 text-muted-foreground">
                      {share(usd, cost.usd)}
                    </span>
                  ) : null}
                </span>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${max > 0 ? Math.max(usd > 0 ? 2 : 0, (usd / max) * 100) : 0}%`,
                    background: agentColor(agent),
                  }}
                />
              </span>
              <span className="text-xs text-muted-foreground">
                {does} ·{' '}
                <span
                  title={`${formatNumber(t.in)} masuk / ${formatNumber(t.out)} keluar`}
                >
                  {compact(t.in + t.out)} token
                </span>
                {kindCost ? ` · ${formatUsd(usd)}` : null}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-2 border-t pt-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">Token masuk vs keluar</span>
          <span className="text-xs text-muted-foreground">
            lebar batang = bagian biaya
          </span>
        </div>
        <div className="a-mixbar" aria-hidden="true">
          <span
            style={{
              width: `${cost.usd ? (cost.inputUsd / cost.usd) * 100 : 50}%`,
              background: INPUT_COLOR,
            }}
          />
          <span
            style={{
              width: `${cost.usd ? (cost.outputUsd / cost.usd) * 100 : 50}%`,
              background: OUTPUT_COLOR,
            }}
          />
        </div>
        <div className="a-legend justify-between">
          <span>
            <span className="a-sw" style={{ background: INPUT_COLOR }} />
            Masuk: {share(tokens.in, allTokens)} token,{' '}
            {share(cost.inputUsd, cost.usd)} biaya (
            {rupiah(usdToIdr(cost.inputUsd))})
          </span>
          <span>
            <span className="a-sw" style={{ background: OUTPUT_COLOR }} />
            Keluar: {share(tokens.out, allTokens)} token,{' '}
            {share(cost.outputUsd, cost.usd)} biaya (
            {rupiah(usdToIdr(cost.outputUsd))})
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Token adalah potongan kecil teks yang dibaca atau ditulis model. Token
          masuk adalah yang dibaca: isi deck, aturan penilaian, pertanyaan.
          Token keluar adalah yang ditulis, termasuk proses berpikir sebelum
          menjawab
          {ratio
            ? `, dan tarifnya ${formatNumber(ratio)}× token masuk. Karena itu bagian token keluar di biaya lebih besar daripada di jumlah token.`
            : '.'}
        </p>
      </div>
    </div>
  )
}
