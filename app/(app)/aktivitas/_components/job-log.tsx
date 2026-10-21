'use client'

import { useEffect, useState, type CSSProperties } from 'react'

import {
  JOB_STATUS_LABEL,
  STEP_STATUS_LABEL,
} from '@/features/aisa/aisa.labels'
import type { JobWithSteps } from '@/features/aisa/aisa.repo'
import type { JobStatus, StepStatus } from '@/features/aisa/aisa.schema'
import { formatNumber } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { AGENT_ORDER, agentColor } from '../../_components/badges'
import { compact, formatClock, formatDayTime, seconds } from './format'

const PAGE_SIZE = 12

const STATUS_CLASS: Record<JobStatus | StepStatus, string> = {
  selesai: 'a-ok',
  ok: 'a-ok',
  berjalan: 'a-run',
  gagal: 'a-err',
  dihentikan: 'a-stop',
}

function Tokens({
  tokensIn,
  tokensOut,
}: {
  tokensIn: number
  tokensOut: number
}) {
  return (
    <span
      title={`${formatNumber(tokensIn)} masuk / ${formatNumber(tokensOut)} keluar`}
    >
      Token <b className="font-mono">{compact(tokensIn)}</b> /{' '}
      <b className="font-mono">{compact(tokensOut)}</b>
    </span>
  )
}

function JobCard({
  job,
  open,
  focused,
}: {
  job: JobWithSteps
  open: boolean
  focused: boolean
}) {
  return (
    <details
      className={cn('a-job scroll-mt-20', focused && 'ring-2 ring-primary/30')}
      id={`job-${job.id}`}
      open={open}
    >
      <summary>
        <div style={{ minWidth: 0 }}>
          <div className="a-ttl">{job.title}</div>
          <div className="a-jobsub">
            <span
              className="a-agent"
              style={
                { '--a-agent-color': agentColor(job.agent) } as CSSProperties
              }
            >
              {job.agent}
            </span>
            {job.model ? (
              <span className="a-model">{job.model}</span>
            ) : (
              <span className="a-model a-code">kode · tanpa model</span>
            )}
            <span>{formatDayTime(job.startedAt)}</span>
            <span>{formatNumber(job.stepCount)} langkah</span>
          </div>
        </div>
        <div className="a-tot">
          <Tokens tokensIn={job.tokensIn} tokensOut={job.tokensOut} />
          <span>
            Durasi <b className="font-mono">{seconds(job.durationMs)}</b>
          </span>
          <span className={cn('a-st', STATUS_CLASS[job.status])}>
            {JOB_STATUS_LABEL[job.status]}
          </span>
        </div>
      </summary>
      <div className="a-steps">
        {job.steps.length === 0 ? (
          <p className="a-empty px-3 py-2.5">Belum ada langkah.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aksi</th>
                <th>Tool</th>
                <th>Data dibaca / ditulis</th>
                <th className="a-r">Token masuk / keluar</th>
                <th className="a-r">Durasi</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {job.steps.map((step) => (
                <tr key={step.id}>
                  <td className="a-muted font-mono whitespace-nowrap">
                    {formatClock(step.at)}
                  </td>
                  <td>
                    {step.action}
                    {step.actor === 'kode' ? (
                      <span className="a-muted"> (kode)</span>
                    ) : step.model ? (
                      <span className="a-muted"> · {step.model}</span>
                    ) : null}
                  </td>
                  <td className="a-tool">{step.tool}</td>
                  <td className="a-data">
                    {step.read ? <span>↳ {step.read}</span> : null}
                    {step.wrote ? <span>↦ {step.wrote}</span> : null}
                    {!step.read && !step.wrote ? <span>—</span> : null}
                  </td>
                  <td
                    className="a-r font-mono whitespace-nowrap"
                    title={`${formatNumber(step.tokensIn)} / ${formatNumber(step.tokensOut)}`}
                  >
                    {step.tokensIn || step.tokensOut ? (
                      `${compact(step.tokensIn)} / ${compact(step.tokensOut)}`
                    ) : (
                      <span className="a-muted">0</span>
                    )}
                  </td>
                  <td className="a-r font-mono whitespace-nowrap">
                    {seconds(step.durationMs)}
                  </td>
                  <td>
                    <span className={cn('a-st', STATUS_CLASS[step.status])}>
                      {STEP_STATUS_LABEL[step.status]}
                    </span>
                    {step.error ? (
                      <div className="mt-1 text-danger">{step.error}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  )
}

export function JobLog({
  jobs,
  focusJobId,
  windowFull,
}: {
  jobs: JobWithSteps[]
  focusJobId?: string
  /** The repo returned a full window, so older jobs exist that are not loaded. */
  windowFull: boolean
}) {
  const [agent, setAgent] = useState<string | null>(null)
  // A linked job ("Lihat log penilaian") must be on screen even when it sits
  // past the first page.
  const focusIndex = focusJobId
    ? jobs.findIndex((job) => job.id === focusJobId)
    : -1
  const [limit, setLimit] = useState(Math.max(PAGE_SIZE, focusIndex + 1))

  // The browser's own jump to `#job-…` can land before the shell settles, so
  // the linked card is scrolled to once it is mounted.
  useEffect(() => {
    if (focusJobId)
      document
        .getElementById(`job-${focusJobId}`)
        ?.scrollIntoView({ block: 'start' })
  }, [focusJobId])

  const agents = [...new Set(jobs.map((job) => job.agent))].toSorted(
    (a, b) =>
      (AGENT_ORDER.indexOf(a) + 1 || 99) - (AGENT_ORDER.indexOf(b) + 1 || 99),
  )
  const shown = jobs.filter((job) => agent === null || job.agent === agent)

  return (
    <>
      <div className="a-sh">
        <h2>Log aktivitas</h2>
        <span className="a-note">
          waktu · agent · aksi · tool · data · token · durasi
        </span>
      </div>
      <div className="a-chips">
        <button
          type="button"
          data-on={agent === null}
          onClick={() => {
            setAgent(null)
            setLimit(PAGE_SIZE)
          }}
        >
          Semua agent
        </button>
        {agents.map((name) => (
          <button
            key={name}
            type="button"
            data-on={agent === name}
            onClick={() => {
              setAgent(name)
              setLimit(PAGE_SIZE)
            }}
          >
            <span
              className="a-sw"
              style={{ background: agentColor(name), borderRadius: '50%' }}
            />
            {name}
          </button>
        ))}
      </div>

      <div className="a-stack" style={{ gap: 10 }}>
        {shown.length === 0 ? (
          <p className="a-empty">Belum ada pekerjaan tercatat.</p>
        ) : null}
        {shown.slice(0, limit).map((job, index) => (
          <JobCard
            key={job.id}
            job={job}
            focused={job.id === focusJobId}
            open={focusJobId ? job.id === focusJobId : index < 2}
          />
        ))}
      </div>
      {shown.length > limit ? (
        <button
          className="a-btn self-center"
          type="button"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
        >
          Tampilkan {Math.min(PAGE_SIZE, shown.length - limit)} lagi
        </button>
      ) : null}
      <div className="a-byai">
        ↳ dibaca · ↦ ditulis. Langkah bertanda “kode” tidak memakai model dan
        tidak memakai token.
        {windowFull
          ? ` Log ini memuat ${formatNumber(jobs.length)} pekerjaan terbaru.`
          : null}
      </div>
    </>
  )
}
