import { type Metadata } from 'next'

import { AISA_READ } from '@/features/aisa/aisa.capability'
import { FREE_TRIAL_CREDIT_USD, usdToIdr } from '@/features/aisa/aisa.pricing'
import {
  getRules,
  listDailyStats,
  listRecentJobs,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { formatUsd } from '@/lib/format/currency'
import { formatNumber } from '@/lib/format/number'

import { compact } from '../aktivitas/_components/format'
import { todayIso } from '../_components/daily-window'
import { CostBreakdown } from './_components/cost-breakdown'
import { CostCalculator } from './_components/cost-calculator'
import { CostMethod } from './_components/cost-method'
import { CostTrendChart } from './_components/cost-trend-chart'
import { costData, type UnitCost } from './cost-data'
import { isoDateLabel, rupiah, share } from './money'

export const metadata: Metadata = { title: 'Biaya AI' }

/** Rows of `dailyStats` read: a little over a year of daily history. */
const STATS_LIMIT = 400
/** Newest jobs the per-unit averages are taken over. */
const JOB_WINDOW = 500

function UnitTile({
  label,
  unit,
  noun,
  empty,
}: {
  label: string
  unit: UnitCost | null
  noun: string
  empty: string
}) {
  return (
    <div className="a-tile">
      <span className="a-l">{label}</span>
      <span className="a-v">{unit ? rupiah(usdToIdr(unit.usd)) : '—'}</span>
      <span className="a-n">
        {unit
          ? `${formatUsd(unit.usd)} · rata-rata ${formatNumber(unit.n)} ${noun}`
          : empty}
      </span>
    </div>
  )
}

/** What AISA's model calls cost, where it goes, and what it saves against manual screening. */
export default async function BiayaPage() {
  await requireCapability(AISA_READ)
  const [stats, rules, jobs] = await Promise.all([
    listDailyStats(STATS_LIMIT),
    getRules(),
    listRecentJobs(JOB_WINDOW),
  ])
  const data = costData({
    stats,
    limit: STATS_LIMIT,
    models: rules?.models ?? null,
    jobs,
  })
  const { cost, units } = data
  const since = data.firstDate
    ? data.truncated
      ? `dalam ${formatNumber(stats.length)} hari tercatat terakhir`
      : `sejak ${isoDateLabel(data.firstDate)}`
    : 'belum ada pemakaian tercatat'
  const today = todayIso()
  const creditShare = cost.usd / FREE_TRIAL_CREDIT_USD

  return (
    <div className="a-stack">
      <div className="a-sh">
        <h2>Biaya pemakaian AI</h2>
        <span className="a-note">
          Perkiraan dari token × harga resmi Vertex AI, bukan angka tagihan
        </span>
      </div>

      <div className="a-kpirow">
        <div className="a-tile a-lead">
          <span className="a-l">Total biaya AI</span>
          <span className="a-v" title={formatUsd(cost.usd)}>
            {rupiah(usdToIdr(cost.usd))}
          </span>
          <span className="a-n">
            {formatUsd(cost.usd)} untuk{' '}
            <span title={formatNumber(data.tokens.in + data.tokens.out)}>
              {compact(data.tokens.in + data.tokens.out)} token
            </span>
            , {since}
          </span>
        </div>
        <UnitTile
          label="Per proposal dinilai"
          unit={units.penilaian}
          noun="proposal"
          empty="Belum ada proposal yang dinilai model"
        />
        <UnitTile
          label="Per pertanyaan Asisten"
          unit={units.asisten}
          noun="pertanyaan"
          empty="Belum ada pertanyaan ke Asisten"
        />
        <UnitTile
          label="Per ringkasan WA"
          unit={units.ringkasan}
          noun="ringkasan"
          empty="Belum ada ringkasan yang ditulis model"
        />
        <div className="a-tile">
          <span className="a-l">Kredit uji coba $300</span>
          <span className="a-v">{share(cost.usd, FREE_TRIAL_CREDIT_USD)}</span>
          <div
            className="my-1 h-1.5 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, Math.max(creditShare > 0 ? 1.5 : 0, creditShare * 100))}%`,
              }}
            />
          </div>
          <span className="a-n">
            Bila pemakaian ini ditagihkan ke kredit uji coba Google Cloud
          </span>
        </div>
      </div>

      {data.unpricedTokens > 0 ? (
        <p className="a-note" role="note">
          {formatNumber(data.unpricedTokens)} token belum dihitung biayanya:
          tarif belum tersedia untuk model atau jenis pekerjaannya.
        </p>
      ) : null}

      <CostCalculator
        pace={data.pace}
        units={{ proposal: units.penilaian, digest: units.ringkasan }}
        today={today}
      />

      <div className="a-charts">
        <CostBreakdown
          data={data}
          model={rules?.models.penilai ?? null}
          today={today}
        />
        <div className="a-chart">
          <h3>Biaya per hari</h3>
          <div className="a-sub">
            {data.daily.length
              ? `${formatNumber(data.daily.length)} hari terakhir, per agent`
              : 'Belum ada hari yang tercatat'}
          </div>
          <CostTrendChart days={data.daily} />
        </div>
      </div>

      <CostMethod
        jobsRead={data.jobsRead}
        jobWindow={JOB_WINDOW}
        models={rules?.models ?? null}
      />
    </div>
  )
}
