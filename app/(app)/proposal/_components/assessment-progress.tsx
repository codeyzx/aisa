'use client'

import {
  AlertTriangleIcon,
  CheckIcon,
  CircleCheckBigIcon,
  HourglassIcon,
  Loader2Icon,
  MinusIcon,
  OctagonPauseIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAssessmentProgressAction } from '@/features/aisa/aisa.action'
import type { AssessmentProgress } from '@/features/aisa/aisa.repo'
import { settleAction } from '@/lib/data/action.contract'
import { cn } from '@/lib/utils'

import {
  deriveProgress,
  type ProgressPhase,
  type ProgressRow,
} from './assessment-progress-state'
import { LogButton } from './assessment-log'
import { durationText } from './proposal-format'

/** Between polls while a step runs, and while the proposal only waits. */
const RUNNING_EVERY_MS = 1500
const WAITING_EVERY_MS = 3000
/**
 * Stop asking after this long. The slowest assessments seen take a little over
 * a minute; a run still going after this is stuck or very unusual, and the card
 * says so instead of polling forever.
 */
const GIVE_UP_AFTER_MS = 5 * 60_000
/** The model step's usual upper bound: past it, the card says it is slow. */
const MODEL_SLOW_MS = 25_000

/** 83_000 → "1:23". */
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const HEAD: Record<
  ProgressPhase,
  { title: string; icon: LucideIcon; tone: string }
> = {
  antre: {
    title: 'Menunggu giliran dinilai',
    icon: HourglassIcon,
    tone: 'bg-muted text-muted-foreground',
  },
  dijeda: {
    title: 'Penilaian dijeda',
    icon: OctagonPauseIcon,
    tone: 'bg-warning-soft text-warning',
  },
  berjalan: {
    title: 'AISA sedang menilai proposal ini',
    icon: SparklesIcon,
    tone: 'bg-primary text-primary-foreground',
  },
  selesai: {
    title: 'Penilaian selesai',
    icon: CircleCheckBigIcon,
    tone: 'bg-success-soft text-success',
  },
  perlu_dicek_manual: {
    title: 'Proposal perlu dicek manual',
    icon: AlertTriangleIcon,
    tone: 'bg-warning-soft text-warning',
  },
  dihentikan: {
    title: 'Penilaian dihentikan',
    icon: OctagonPauseIcon,
    tone: 'bg-warning-soft text-warning',
  },
  gagal: {
    title: 'Penilaian gagal',
    icon: AlertTriangleIcon,
    tone: 'bg-danger-soft text-danger',
  },
}

function headline(
  phase: ProgressPhase,
  reason: string | null,
  paused: boolean,
): string {
  switch (phase) {
    case 'antre':
      return 'Proposal sudah masuk antrean dan belum mulai dinilai. Biasanya mulai beberapa detik setelah diunggah; proposal yang tertahan di antrean dinilai setelah perintah LANJUT.'
    case 'dijeda':
      return 'AI sedang dijeda (STOP). Proposal ini akan dinilai setelah LANJUT.'
    case 'berjalan':
      return paused
        ? 'STOP baru saja aktif: penilaian ini berhenti di titik pemeriksaan berikutnya.'
        : 'Halaman ini mengikuti setiap langkah secara langsung. Penilaian tetap berjalan walau halaman ditutup.'
    case 'selesai':
      return 'Menampilkan hasilnya…'
    case 'perlu_dicek_manual':
      return `${reason ? `Alasannya: ${reason}. ` : ''}AI tidak memberi skor atau grade; buka berkas proposal dan tinjau sendiri.`
    case 'dihentikan':
      return 'STOP aktif, jadi penilaian berhenti. Proposal ini dinilai ulang dari awal setelah LANJUT.'
    case 'gagal':
      return `${reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. ` : ''}Proposal kembali ke antrean dan dinilai lagi setelah perintah LANJUT.`
  }
}

function Node({ state }: { state: ProgressRow['state'] }) {
  const base =
    'z-10 grid size-7 shrink-0 place-items-center rounded-full bg-card'
  switch (state) {
    case 'selesai':
      return (
        <span className={cn(base, 'bg-success text-white')}>
          <CheckIcon className="size-4" strokeWidth={3} aria-hidden />
        </span>
      )
    case 'gagal':
      return (
        <span className={cn(base, 'bg-danger text-white')}>
          <XIcon className="size-4" strokeWidth={3} aria-hidden />
        </span>
      )
    case 'dihentikan':
      return (
        <span className={cn(base, 'bg-warning text-white')}>
          <OctagonPauseIcon className="size-4" aria-hidden />
        </span>
      )
    case 'berjalan':
      return (
        <span className={cn(base, 'text-primary ring-2 ring-primary')}>
          <Loader2Icon
            className="size-4 motion-safe:animate-spin"
            aria-hidden
          />
        </span>
      )
    case 'berikutnya':
      return (
        <span
          className={cn(base, 'border-2 border-dashed border-primary/60')}
        />
      )
    case 'dilewati':
      return (
        <span className={cn(base, 'border text-muted-foreground')}>
          <MinusIcon className="size-3.5" aria-hidden />
        </span>
      )
    case 'menunggu':
      return <span className={cn(base, 'border-2 border-border')} />
  }
}

const STATE_TEXT: Partial<Record<ProgressRow['state'], string>> = {
  gagal: 'gagal',
  dihentikan: 'dihentikan',
  berikutnya: 'berikutnya',
  dilewati: 'dilewati',
  menunggu: 'menunggu',
}

function Row({
  row,
  last,
  now,
}: {
  row: ProgressRow
  last: boolean
  now: number
}) {
  const running = row.state === 'berjalan'
  const elapsed = running && row.startedAt ? now - row.startedAt.getTime() : 0
  const pending =
    row.state === 'menunggu' ||
    row.state === 'dilewati' ||
    row.state === 'berikutnya'

  return (
    <li
      className="relative flex gap-3 pb-4 last:pb-0"
      data-state={row.state}
      aria-current={running ? 'step' : undefined}
    >
      {!last ? (
        <span
          aria-hidden
          className={cn(
            'absolute top-7 bottom-0 left-3.5 w-px -translate-x-1/2',
            row.state === 'selesai' ? 'bg-success/50' : 'bg-border',
          )}
        />
      ) : null}
      <Node state={row.state} />
      <div
        className={cn(
          'min-w-0 flex-1',
          running &&
            '-mt-1.5 -ml-1.5 rounded-lg bg-primary/[0.06] py-1.5 pr-3 pl-1.5',
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
          <p
            className={cn(
              'text-sm',
              running ? 'font-semibold' : 'font-medium',
              pending && 'text-muted-foreground',
            )}
          >
            {row.title}
          </p>
          {row.by === 'ai' ? (
            <Badge
              variant="outline"
              className="h-5 border-primary/30 bg-primary/10 px-1.5 text-[11px] text-primary"
            >
              AI
            </Badge>
          ) : null}
          <span className="ml-auto text-xs whitespace-nowrap tabular-nums">
            {row.state === 'selesai' && row.durationMs !== null ? (
              <span className="text-muted-foreground">
                <span className="sr-only">selesai dalam </span>
                {durationText(row.durationMs)}
              </span>
            ) : running ? (
              <span
                className="font-semibold text-primary"
                suppressHydrationWarning
              >
                <span className="sr-only">berjalan </span>
                {clock(elapsed)}
              </span>
            ) : (
              <span
                className={cn(
                  row.state === 'gagal' && 'font-medium text-danger',
                  row.state === 'dihentikan' && 'font-medium text-warning',
                  row.state === 'berikutnya' && 'text-primary',
                  (row.state === 'menunggu' || row.state === 'dilewati') &&
                    'text-muted-foreground/80',
                )}
              >
                {STATE_TEXT[row.state]}
              </span>
            )}
          </span>
        </div>
        {row.explain ? (
          <p
            className={cn(
              'mt-0.5 text-[13px] leading-relaxed',
              running ? 'text-foreground' : 'text-muted-foreground',
              pending && 'max-sm:hidden',
            )}
          >
            {row.explain}
          </p>
        ) : null}
        {running && row.typical ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {elapsed > MODEL_SLOW_MS
              ? 'Lebih lama dari biasanya; masih menunggu jawaban AI.'
              : `Langkah terlama, ${row.typical}.`}
          </p>
        ) : null}
        {row.error ? (
          <p className="mt-1 text-[13px] text-danger">{row.error}</p>
        ) : null}
      </div>
    </li>
  )
}

/**
 * The detail page's live view of an assessment, polling
 * `getAssessmentProgressAction` while the proposal is queued or being scored.
 * Rendered on every detail page so it survives the page's own re-render: it
 * shows only when the page first rendered a proposal that was still in
 * progress (`initial` non-null), and keeps showing the outcome after it.
 */
export function AssessmentProgressCard({
  proposalId,
  initial,
}: {
  proposalId: string
  initial: AssessmentProgress | null
}) {
  const [snap, setSnap] = useState(initial)
  const [shown, setShown] = useState(initial !== null)
  const [stalled, setStalled] = useState(false)
  const [offline, setOffline] = useState(false)
  const [announce, setAnnounce] = useState('')
  // The server's clock minus the browser's, so a running step is timed on the
  // clock that stamped its start.
  const [offset, setOffset] = useState(() =>
    initial ? initial.serverNow.getTime() - Date.now() : 0,
  )
  const [now, setNow] = useState(() => Date.now() + offset)
  const [round, setRound] = useState(0)
  // The status the page last rendered: the poll re-renders the page when the
  // status moves on (see getAssessmentProgressAction).
  const seenStatus = useRef(initial?.status)

  // A fresh server render of a still-unsettled proposal is at least as new as
  // the last poll.
  useEffect(() => {
    if (!initial) return
    seenStatus.current = initial.status
    setSnap(initial)
    setShown(true)
    setOffset(initial.serverNow.getTime() - Date.now())
  }, [initial])

  const view = snap ? deriveProgress(snap) : null
  const phase = view?.phase ?? null
  const polling = shown && view !== null && !view.settled && !stalled
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // Poll until the assessment settles or GIVE_UP_AFTER_MS passes.
  useEffect(() => {
    if (!polling) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const giveUpAt = Date.now() + GIVE_UP_AFTER_MS
    const schedule = () => {
      timer = setTimeout(
        tick,
        phaseRef.current === 'berjalan' ? RUNNING_EVERY_MS : WAITING_EVERY_MS,
      )
    }
    const tick = async () => {
      if (document.hidden) return schedule()
      const result = await settleAction(() =>
        getAssessmentProgressAction(proposalId, seenStatus.current),
      )
      if (cancelled) return
      setOffline(!result.ok)
      if (result.ok) {
        // Gone: the response re-rendered the page as not found.
        if (result.data === null) return
        seenStatus.current = result.data.status
        setOffset(result.data.serverNow.getTime() - Date.now())
        setSnap(result.data)
      }
      if (Date.now() > giveUpAt) setStalled(true)
      else schedule()
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [polling, proposalId, round])

  // Whether the page has re-rendered with the status the last poll saw: a
  // settled proposal renders no `initial` (a failed run renders as queued),
  // one still in progress renders its own.
  const caughtUp =
    !snap ||
    (view?.settled && phase !== 'gagal'
      ? initial === null
      : initial?.status === snap.status)
  // Tick once a second while something runs, and also until the page has
  // caught up with a status change. In the built app the re-render that the
  // poll's response carries was seen to stay off screen until some other
  // React update rendered; the tick is that update.
  const ticking = (polling && phase === 'berjalan') || !caughtUp
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now() + offset), 1000)
    setNow(Date.now() + offset)
    return () => clearInterval(timer)
  }, [ticking, offset])

  // Announce each finished step and the outcome, once.
  const done = view?.rows.filter((r) => r.state === 'selesai') ?? []
  const lastDone = done.at(-1)?.title ?? null
  const doneCount = done.length
  const seenDone = useRef(doneCount)
  useEffect(() => {
    if (doneCount > seenDone.current && lastDone)
      setAnnounce(`Selesai: ${lastDone}.`)
    seenDone.current = doneCount
  }, [doneCount, lastDone])

  // Announce the outcome once it settles. The page itself re-renders with the
  // result through the poll that saw it (see getAssessmentProgressAction).
  const settledPhase = view?.settled ? phase : null
  useEffect(() => {
    if (settledPhase) setAnnounce(HEAD[settledPhase].title)
  }, [settledPhase])

  if (!shown || !view || !phase) return null

  const live = (
    <p className="sr-only" aria-live="polite" aria-atomic>
      {announce}
    </p>
  )

  // After the success re-render, the result is on the page: say so briefly.
  if (phase === 'selesai' && initial === null) {
    return (
      <section
        aria-label="Penilaian selesai"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success-soft/60 px-4 py-3 text-sm"
      >
        {live}
        <CircleCheckBigIcon className="size-5 text-success" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Penilaian selesai</span>
          {view.totalMs !== null
            ? ` dalam ${durationText(view.totalMs)}.`
            : '.'}{' '}
          Hasilnya ada di bawah.
        </p>
        <LogButton variant="outline" size="sm" className="bg-card">
          Lihat langkahnya
        </LogButton>
        <Button variant="ghost" size="icon-sm" onClick={() => setShown(false)}>
          <XIcon />
          <span className="sr-only">Tutup</span>
        </Button>
      </section>
    )
  }

  const head = HEAD[phase]
  const total =
    view.totalMs ??
    (view.jobStartedAt ? now - view.jobStartedAt.getTime() : null)

  return (
    <section
      aria-labelledby="assessment-progress-title"
      data-phase={phase}
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-xs',
        phase === 'berjalan' && 'border-primary/30',
        phase === 'gagal' && 'border-danger/30',
        (phase === 'perlu_dicek_manual' ||
          phase === 'dihentikan' ||
          phase === 'dijeda') &&
          'border-warning/30',
        phase === 'selesai' && 'border-success/30',
      )}
    >
      {live}
      {phase === 'berjalan' ? (
        <div
          aria-hidden
          className="h-1 bg-primary/70 motion-safe:animate-pulse"
        />
      ) : null}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-2xl',
            head.tone,
          )}
        >
          <head.icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="assessment-progress-title"
            className="text-lg font-semibold tracking-tight"
          >
            {head.title}
          </h2>
          <p className="mt-0.5 max-w-prose text-[13.5px] text-muted-foreground">
            {headline(phase, view.statusReason, view.paused)}
          </p>
        </div>
        {total !== null ? (
          <div className="shrink-0 sm:text-right">
            <p className="text-xs text-muted-foreground">
              {view.totalMs !== null ? 'Lama penilaian' : 'Sudah berjalan'}
            </p>
            <p
              className="text-2xl font-semibold tabular-nums"
              data-testid="progress-total"
              suppressHydrationWarning
            >
              {view.totalMs !== null ? durationText(total) : clock(total)}
            </p>
          </div>
        ) : null}
      </div>

      {view.rows.length && phase !== 'antre' && phase !== 'dijeda' ? (
        <ol aria-label="Langkah penilaian" className="border-t px-5 py-4">
          {view.rows.map((row, index) => (
            <Row
              key={row.id}
              row={row}
              last={index === view.rows.length - 1}
              now={now}
            />
          ))}
        </ol>
      ) : null}

      {stalled || offline ? (
        <div className="flex flex-wrap items-center gap-3 border-t bg-muted/40 px-5 py-3 text-[13px]">
          <p className="min-w-0 flex-1">
            {stalled
              ? 'Masih berjalan lebih lama dari biasanya, jadi halaman berhenti memeriksa otomatis.'
              : 'Tidak bisa memeriksa kemajuan; mencoba lagi.'}
          </p>
          {stalled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStalled(false)
                setRound((n) => n + 1)
              }}
            >
              <RefreshCwIcon />
              Periksa lagi
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
