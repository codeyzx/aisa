import { type Metadata } from 'next'

import { Page } from '@/components/shell/page-container'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AISA_READ } from '@/features/aisa/aisa.capability'
import {
  JOB_KIND_LABEL,
  JOB_STATUS_LABEL,
  STEP_STATUS_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  countDigestsSince,
  listDailyStats,
  listJobsWithSteps,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { formatDate, formatTime } from '@/lib/format/date'
import { formatNumber } from '@/lib/format/number'

import { ColumnChart, shortDate } from '../_components/charts'
import { dailyWindow } from '../_components/daily-window'

export const metadata: Metadata = { title: 'Aktivitas AI' }

const DAYS = 14
const JOB_LIMIT = 30

function duration(ms: number | null | undefined) {
  if (ms == null) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} dtk`
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

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
  const totalTokens = sum(
    (d) => (d.stats?.tokensIn ?? 0) + (d.stats?.tokensOut ?? 0),
  )
  const proposalsIn = sum((d) => d.stats?.proposalsIn ?? 0)
  const kindTokens = (kind: string) =>
    sum((d) => {
      const t = d.stats?.tokensByKind[kind]
      return t ? t.in + t.out : 0
    })
  const modelCalls = sum((d) => d.stats?.modelCalls ?? 0)
  const avg = (total: number, n: number) =>
    n > 0 ? formatNumber(Math.round(total / n)) : '—'

  return (
    <Page.Root>
      <Page.Header
        title="Aktivitas AI"
        description={`Pemakaian ${DAYS} hari terakhir dan ${JOB_LIMIT} pekerjaan terbaru.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total token"
          value={formatNumber(totalTokens)}
          hint="masuk + keluar"
        />
        <Stat
          label="Rata-rata per proposal"
          value={avg(kindTokens('penilaian'), proposalsIn)}
          hint={`token penilaian / ${formatNumber(proposalsIn)} proposal masuk`}
        />
        <Stat
          label="Rata-rata per ringkasan"
          value={avg(kindTokens('ringkasan'), digestCount)}
          hint={`token ringkasan / ${formatNumber(digestCount)} ringkasan`}
        />
        <Stat label="Panggilan model" value={formatNumber(modelCalls)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Token per hari</CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnChart
            caption="Token per hari"
            unit="token"
            points={days.map((d) => ({
              label: shortDate(d.date),
              value: (d.stats?.tokensIn ?? 0) + (d.stats?.tokensOut ?? 0),
            }))}
          />
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Pekerjaan">
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada pekerjaan tercatat.
          </p>
        ) : null}
        {jobs.map((job) => (
          <details
            key={job.id}
            id={`job-${job.id}`}
            open={job.id === focusJobId}
            className="scroll-mt-20 rounded-xl border bg-card open:ring-1 open:ring-primary/30"
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="font-medium">{job.title}</span>
              <Badge variant="outline">
                {job.agent} · {JOB_KIND_LABEL[job.kind]}
              </Badge>
              <code className="text-xs">{job.model ?? '(kode)'}</code>
              <span className="text-muted-foreground tabular-nums">
                {formatDate(job.startedAt)} {formatTime(job.startedAt)}
              </span>
              <span className="tabular-nums">{job.stepCount} langkah</span>
              <span className="tabular-nums">
                {formatNumber(job.tokensIn)} / {formatNumber(job.tokensOut)}{' '}
                token
              </span>
              <span className="tabular-nums">{duration(job.durationMs)}</span>
              <Badge
                variant={
                  job.status === 'gagal'
                    ? 'destructive'
                    : job.status === 'selesai'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {JOB_STATUS_LABEL[job.status]}
              </Badge>
            </summary>
            <div className="overflow-x-auto border-t px-4 py-3">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Waktu</th>
                    <th className="py-1 pr-3 font-medium">Aksi</th>
                    <th className="py-1 pr-3 font-medium">Tool</th>
                    <th className="py-1 pr-3 font-medium">
                      Data dibaca / ditulis
                    </th>
                    <th className="py-1 pr-3 text-right font-medium">
                      Token masuk / keluar
                    </th>
                    <th className="py-1 pr-3 text-right font-medium">Durasi</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {job.steps.map((step) => (
                    <tr key={step.id} className="border-t align-top">
                      <td className="py-1 pr-3 tabular-nums">
                        {formatTime(step.at)}
                      </td>
                      <td className="py-1 pr-3">
                        {step.action}
                        {step.actor === 'kode' ? (
                          <span className="text-muted-foreground"> (kode)</span>
                        ) : step.model ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {step.model}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1 pr-3">
                        <code>{step.tool}</code>
                      </td>
                      <td className="py-1 pr-3">
                        {step.read ? <div>baca: {step.read}</div> : null}
                        {step.wrote ? <div>tulis: {step.wrote}</div> : null}
                        {!step.read && !step.wrote ? '—' : null}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {formatNumber(step.tokensIn)} /{' '}
                        {formatNumber(step.tokensOut)}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {duration(step.durationMs)}
                      </td>
                      <td className="py-1">
                        {STEP_STATUS_LABEL[step.status]}
                        {step.error ? (
                          <div className="text-destructive">{step.error}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {job.steps.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  Belum ada langkah.
                </p>
              ) : null}
            </div>
          </details>
        ))}
      </section>
    </Page.Root>
  )
}
