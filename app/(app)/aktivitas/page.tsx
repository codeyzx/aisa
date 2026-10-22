import { type Metadata } from 'next'

import { AISA_READ } from '@/features/aisa/aisa.capability'
import {
  countDigestsSince,
  listDailyStats,
  listJobsWithSteps,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { formatNumber } from '@/lib/format/number'

import { dailyWindow, fromFirstValue } from '../_components/daily-window'
import { compact } from './_components/format'
import { JobLog } from './_components/job-log'
import { TokenChart } from './_components/token-chart'

export const metadata: Metadata = { title: 'Aktivitas AI' }

/** The KPI window; the chart shows the newest `CHART_DAYS` of it. */
const DAYS = 30
const CHART_DAYS = 14
const JOB_LIMIT = 60

const chartLabel = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
})

const avg = (total: number, n: number) =>
  n > 0 ? compact(Math.round(total / n)) : '—'

export default async function AktivitasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(AISA_READ)
  const rawJob = (await searchParams).job
  const focusJobId =
    typeof rawJob === 'string' && rawJob.length <= 200 ? rawJob : undefined

  const days = dailyWindow(await listDailyStats(DAYS), DAYS)
  const windowStart = new Date(
    `${days[0]?.date ?? '1970-01-01'}T00:00:00+07:00`,
  )
  const [jobs, digestCount] = await Promise.all([
    listJobsWithSteps(JOB_LIMIT, focusJobId),
    countDigestsSince(windowStart),
  ])

  const sum = (pick: (d: (typeof days)[number]) => number) =>
    days.reduce((total, d) => total + pick(d), 0)
  const tokensIn = sum((d) => d.stats?.tokensIn ?? 0)
  const tokensOut = sum((d) => d.stats?.tokensOut ?? 0)
  // The penilaian tokens are spent on proposals the model scored; a deck that
  // never reached the model (too little text) costs none, so dividing by every
  // proposal that came in would understate the cost of one assessment. A scored
  // proposal is one that got a kategori, which `byCategory` counts per day.
  const modelAssessed = sum((d) =>
    Object.values(d.stats?.byCategory ?? {}).reduce((a, b) => a + b, 0),
  )
  const kindTokens = (kind: string) =>
    sum((d) => {
      const t = d.stats?.tokensByKind[kind]
      return t ? t.in + t.out : 0
    })
  const modelCalls = sum((d) => d.stats?.modelCalls ?? 0)
  const failed = jobs.filter((job) => job.status === 'gagal').length

  const chartWindow = days.slice(-CHART_DAYS).map((d) => ({
    label: chartLabel.format(new Date(`${d.date}T12:00:00+07:00`)),
    total: (d.stats?.tokensIn ?? 0) + (d.stats?.tokensOut ?? 0),
  }))
  const chart = fromFirstValue(chartWindow, (d) => d.total === 0)
  const chartSince =
    chart.length < chartWindow.length ? chart[0]?.label : undefined

  return (
    <div className="a-stack">
      <div className="a-sh">
        <h2>Pemakaian AI</h2>
        <span className="a-note">
          Token dari usage_metadata setiap respons model
        </span>
      </div>
      <div className="a-kpis">
        <div className="a-kpi">
          <span className="a-l">Token {DAYS} hari</span>
          <span className="a-v" title={formatNumber(tokensIn + tokensOut)}>
            {compact(tokensIn + tokensOut)}
          </span>
          <span className="a-n">
            {compact(tokensIn)} masuk · {compact(tokensOut)} keluar
          </span>
        </div>
        <div className="a-kpi">
          <span className="a-l">Rata-rata per proposal</span>
          <span className="a-v">
            {avg(kindTokens('penilaian'), modelAssessed)}
          </span>
          <span className="a-n">
            {formatNumber(modelAssessed)} proposal dinilai model
          </span>
        </div>
        <div className="a-kpi">
          <span className="a-l">Rata-rata per ringkasan</span>
          <span className="a-v">
            {avg(kindTokens('ringkasan'), digestCount)}
          </span>
          <span className="a-n">
            {formatNumber(digestCount)} ringkasan terkirim
          </span>
        </div>
        <div className="a-kpi">
          <span className="a-l">Panggilan model</span>
          <span className="a-v">{formatNumber(modelCalls)}</span>
          <span className="a-n">
            {failed === 0
              ? `Tidak ada yang gagal di ${formatNumber(jobs.length)} pekerjaan terbaru`
              : `${formatNumber(failed)} gagal di ${formatNumber(jobs.length)} pekerjaan terbaru`}
          </span>
        </div>
      </div>

      <div className="a-chart">
        <h3>Token per hari</h3>
        <div className="a-sub">
          {chartSince
            ? `Sejak ${chartSince}, semua agent`
            : `${CHART_DAYS} hari terakhir, semua agent`}
        </div>
        <TokenChart days={chart} />
      </div>

      <JobLog
        jobs={jobs}
        focusJobId={focusJobId}
        windowFull={jobs.length >= JOB_LIMIT}
      />
    </div>
  )
}
