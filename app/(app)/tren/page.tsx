import { type Metadata } from 'next'

import { AISA_READ } from '@/features/aisa/aisa.capability'
import {
  getLatestInsightDigest,
  listDailyStats,
  listRecentProposals,
  PROPOSAL_WINDOW,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { formatDate } from '@/lib/format/date'
import { formatDecimal, formatNumber } from '@/lib/format/number'

import { dailyWindow } from '../_components/daily-window'
import { TrendCharts } from './_components/trend-view'
import { buildTrend, TREND_DAYS } from './trend-data'

export const metadata: Metadata = { title: 'Tren' }

function Insight({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <span
        aria-hidden
        className="mt-1.5 size-2 rounded-full"
        style={{ background: 'var(--primary)' }}
      />
      <span>{children}</span>
    </li>
  )
}

export default async function TrenPage() {
  await requireCapability(AISA_READ)
  const [stats, proposals, insightDigest] = await Promise.all([
    listDailyStats(TREND_DAYS),
    listRecentProposals(),
    getLatestInsightDigest(),
  ])
  const data = buildTrend(stats, proposals)
  const { days } = data

  const today = days.at(-1)?.total ?? 0
  const maxBefore = Math.max(0, ...days.slice(0, -1).map((d) => d.total))
  const total = days.reduce((sum, d) => sum + d.total, 0)
  const average = formatDecimal(total / TREND_DAYS, { max: 1 })
  const dailySub =
    today > maxBefore
      ? `Hari ini ${formatNumber(today)} proposal, terbanyak dalam dua minggu`
      : `Hari ini ${formatNumber(today)} proposal · rata-rata 14 hari ${average} per hari`
  const veryFit = days.reduce((sum, d) => sum + d.sangat_layak, 0)
  const manual = days.reduce((sum, d) => sum + d.manual, 0)

  // The mean score reads the newest PROPOSAL_WINDOW proposals; when that
  // window does not reach back to the first charted day, say so.
  const windowStart = dailyWindow([], TREND_DAYS)[0]?.date ?? ''
  const oldest = proposals.at(-1)?.createdAt
  const truncated =
    proposals.length >= PROPOSAL_WINDOW &&
    oldest !== undefined &&
    oldest.getTime() > Date.parse(`${windowStart}T00:00:00+07:00`)

  return (
    <div className="a-stack">
      <div className="a-sh">
        <h2>Tren 14 hari terakhir</h2>
        <span className="a-note">Rekap harian (WIB) dari proposal masuk</span>
      </div>
      <ul className="a-ins">
        <Insight>{dailySub}.</Insight>
        <Insight>
          {formatNumber(veryFit)} proposal Sangat layak dari{' '}
          {formatNumber(total)} proposal masuk ·{' '}
          {total ? Math.round((veryFit / total) * 100) : 0}% dari 14 hari
          terakhir.
        </Insight>
        <Insight>
          {formatNumber(manual)} proposal perlu dicek manual. Teksnya tidak
          terbaca atau penilaian gagal, jadi keputusan ada di tangan manajer.
        </Insight>
        {insightDigest?.insight ? (
          <Insight>
            Yang menarik: {insightDigest.insight}{' '}
            <span className="text-xs text-muted-foreground">
              (ringkasan {insightDigest.slot} ·{' '}
              {formatDate(insightDigest.sentAt)})
            </span>
          </Insight>
        ) : null}
      </ul>
      <TrendCharts data={data} dailySub={dailySub} />
      {truncated ? (
        <p className="a-note">
          Rata-rata skor dihitung dari {formatNumber(PROPOSAL_WINDOW)} proposal
          terbaru; hari-hari paling awal bisa belum lengkap.
        </p>
      ) : null}
    </div>
  )
}
