'use client'

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CpuIcon,
  FileTextIcon,
  ListTreeIcon,
  SparklesIcon,
  UserIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from 'react'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CATEGORY_LABEL, JOB_STATUS_LABEL } from '@/features/aisa/aisa.labels'
import type { Rules } from '@/features/aisa/aisa.schema'
import { formatDecimal, formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { scoreTone } from '../../_components/badges'
import type {
  AssessmentLogData,
  LogDetail,
  LogStep,
} from './assessment-log-data'
import { DeckPageLink, useDeckPreviewPanel } from './deck-preview'
import {
  clockTime,
  compactNumber,
  durationText,
  longDate,
} from './proposal-format'

type Thresholds = Pick<
  Rules['thresholds'],
  'sangatCocok' | 'cocok' | 'kurangCocok'
> | null

export const BY: Record<
  LogStep['by'],
  { label: string; icon: LucideIcon; dot: string; badge: string }
> = {
  ai: {
    label: 'AI',
    icon: SparklesIcon,
    dot: 'bg-primary text-primary-foreground',
    badge: 'border-primary/30 bg-primary/10 text-primary',
  },
  sistem: {
    label: 'Sistem',
    icon: CpuIcon,
    dot: 'bg-muted text-muted-foreground ring-1 ring-border',
    badge: 'border-border bg-muted text-muted-foreground',
  },
  manajer: {
    label: 'Manajer',
    icon: UserIcon,
    dot: 'bg-warning-soft text-warning ring-1 ring-warning/30',
    badge: 'border-warning/30 bg-warning-soft text-warning',
  },
}

const fieldLabel = 'mb-0.5 text-xs font-medium text-muted-foreground'

function CriteriaDetail({
  detail,
  thresholds,
}: {
  detail: Extract<LogDetail, { type: 'criteria' }>
  thresholds: Thresholds
}) {
  return (
    <ol className="space-y-2.5">
      {detail.items.map((item) => (
        <li key={item.label} className="rounded-lg border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.label}</p>
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                scoreTone(item.value * 20, thresholds).text,
              )}
            >
              {item.value}
              <span className="text-xs font-normal text-muted-foreground">
                /5
              </span>
            </p>
          </div>
          <dl className="mt-2 space-y-2 text-[13px]">
            {item.citations.map((citation) => (
              <div key={`${citation.page}:${citation.quote}`}>
                <dt className={cn(fieldLabel, 'flex items-center gap-1')}>
                  <FileTextIcon className="size-3" />
                  Bukti dari{' '}
                  <DeckPageLink
                    page={citation.page}
                    className="rounded-sm font-semibold"
                  >
                    hal. {citation.page}
                  </DeckPageLink>
                </dt>
                <dd className="border-l-2 border-primary/40 pl-2.5 leading-relaxed italic">
                  “{citation.quote}”
                </dd>
              </div>
            ))}
            {item.notMentioned || item.citationsUnverified ? (
              <div className="flex flex-wrap gap-1">
                {item.notMentioned ? (
                  <Badge
                    variant="outline"
                    className="border-warning/30 bg-warning-soft text-warning"
                  >
                    tidak disebut
                  </Badge>
                ) : null}
                {item.citationsUnverified ? (
                  <Badge variant="outline">kutipan tidak terverifikasi</Badge>
                ) : null}
              </div>
            ) : null}
            <div>
              <dt className={fieldLabel}>Alasan AI</dt>
              <dd className="leading-relaxed">{item.reason}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  )
}

function ScoreDetail({
  detail,
}: {
  detail: Extract<LogDetail, { type: 'score' }>
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background text-[13px]">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Kriteria</th>
            <th className="px-3 py-2 text-right font-medium">Nilai</th>
            <th className="px-3 py-2 text-right font-medium">Bobot</th>
            <th className="px-3 py-2 text-right font-medium">Poin</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {detail.rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="px-3 py-1.5">{row.label}</td>
              <td className="px-3 py-1.5 text-right">{row.value}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">
                × {formatDecimal(row.weight, { max: 1 })}%
              </td>
              <td className="px-3 py-1.5 text-right font-medium">
                {formatDecimal(row.points, { max: 1 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50 font-semibold">
            <td className="px-3 py-2" colSpan={3}>
              Skor akhir
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {formatScore(detail.stored)}/100
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Poin = bobot × (nilai − 1) / 4.
        {detail.versions
          ? ` Bobot di atas dari aturan v${detail.versions[1]}; proposal ini dinilai dengan aturan v${detail.versions[0]}. Dengan bobot sekarang skornya menjadi ${formatScore(detail.total)}; skor tersimpan tidak ikut berubah.`
          : ''}
      </p>
    </div>
  )
}

function FitDetail({
  detail,
}: {
  detail: Extract<LogDetail, { type: 'fit' }>
}) {
  return (
    <ul className="space-y-1.5 text-[13px]">
      {detail.items.map((item) => (
        <li key={item.label} className="flex items-start gap-2">
          {item.ok ? (
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircleIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          )}
          <span>
            <span className="font-medium">{item.label}:</span> {item.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Why the kategori came out as it did, as the rule in
 * `services/api/aisa/scoring.py` `categorize` reads: a failed fit check is
 * Tidak cocok whatever the score; otherwise the score's threshold decides, and
 * a criterion scored 1 keeps a proposal out of Sangat cocok.
 */
function CategoryDetail({
  detail,
}: {
  detail: Extract<LogDetail, { type: 'category' }>
}) {
  const { thresholds: t, score, category } = detail
  const s = formatScore(score)
  const label = CATEGORY_LABEL[category]
  let why: string
  if (!detail.fitPassed) {
    why = `Tidak lolos cek fokus, jadi kategorinya ${label} berapa pun skornya.`
    if (detail.qualityOutsideFocus)
      why += t
        ? ` Skor ${s} mencapai ${formatScore(t.qualityOutsideFocus)}, jadi ditandai berkualitas, di luar fokus.`
        : ' Skornya cukup tinggi, jadi ditandai berkualitas, di luar fokus.'
  } else if (!t) {
    why = `Lolos cek fokus; skor ${s} menempatkannya di ${label} menurut ambang aturan v${detail.rulesVersion} yang berlaku saat itu.`
  } else if (category === 'sangat_cocok') {
    why = `Lolos cek fokus, skor ${s} mencapai ${formatScore(t.sangatCocok)}, dan tidak ada kriteria bernilai 1.`
  } else if (category === 'cocok') {
    why =
      score >= t.sangatCocok && detail.hasOne
        ? `Lolos cek fokus dan skor ${s} mencapai ${formatScore(t.sangatCocok)}, tetapi ada kriteria bernilai 1, jadi tidak bisa Sangat cocok.`
        : `Lolos cek fokus dan skor ${s} mencapai ${formatScore(t.cocok)}, tetapi di bawah ${formatScore(t.sangatCocok)} untuk Sangat cocok.`
  } else if (category === 'kurang_cocok') {
    why = `Lolos cek fokus, tetapi skor ${s} di bawah ${formatScore(t.cocok)} untuk Cocok, dan masih mencapai ${formatScore(t.kurangCocok)}.`
  } else {
    why = `Lolos cek fokus, tetapi skor ${s} di bawah ${formatScore(t.kurangCocok)}.`
  }
  return (
    <div className="space-y-2 text-[13px]">
      <p className="leading-relaxed">{why}</p>
      {t ? (
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(
            [
              ['sangat_cocok', `≥ ${formatScore(t.sangatCocok)}`],
              ['cocok', `≥ ${formatScore(t.cocok)}`],
              ['kurang_cocok', `≥ ${formatScore(t.kurangCocok)}`],
              ['tidak_cocok', `< ${formatScore(t.kurangCocok)}`],
            ] as const
          ).map(([key, range]) => (
            <li
              key={key}
              className={cn(
                'rounded-md border px-2 py-1.5',
                key === category
                  ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <span className="block text-xs">{CATEGORY_LABEL[key]}</span>
              <span className="tabular-nums">{range}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Detail({
  detail,
  thresholds,
}: {
  detail: LogDetail
  thresholds: Thresholds
}) {
  switch (detail.type) {
    case 'criteria':
      return <CriteriaDetail detail={detail} thresholds={thresholds} />
    case 'score':
      return <ScoreDetail detail={detail} />
    case 'fit':
      return <FitDetail detail={detail} />
    case 'category':
      return <CategoryDetail detail={detail} />
  }
}

function TimelineNode({
  step,
  last,
  totalMs,
  thresholds,
}: {
  step: LogStep
  last: boolean
  totalMs: number | null
  thresholds: Thresholds
}) {
  const [open, setOpen] = useState(step.detail?.type === 'criteria')
  const by = BY[step.by]
  const share =
    totalMs && step.durationMs > 0
      ? Math.min(1, step.durationMs / totalMs)
      : null
  const time = (
    <time
      dateTime={step.startedAt.toISOString()}
      className="text-xs text-muted-foreground tabular-nums"
    >
      {clockTime(step.startedAt)}
    </time>
  )

  return (
    <li className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-1 sm:grid-cols-[4.25rem_2.25rem_minmax(0,1fr)]">
      <div className="hidden pt-2.5 text-right sm:block">{time}</div>
      <div className="relative flex justify-center">
        {!last ? (
          <span
            aria-hidden
            className="absolute top-9 -bottom-6 left-1/2 w-px -translate-x-1/2 bg-border"
          />
        ) : null}
        <span
          className={cn(
            'z-10 grid size-9 shrink-0 place-items-center rounded-full',
            by.dot,
          )}
        >
          <by.icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="min-w-0 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sm:hidden">{time}</span>
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <Badge
            variant="outline"
            className={cn('h-5 px-1.5 text-[11px]', by.badge)}
          >
            {by.label}
          </Badge>
          {step.status !== 'ok' ? (
            <Badge
              variant="outline"
              className="h-5 border-danger/30 bg-danger-soft px-1.5 text-[11px] text-danger"
            >
              {step.status === 'gagal' ? 'Gagal' : 'Dihentikan'}
            </Badge>
          ) : null}
          {step.durationMs > 0 ? (
            <span className="ml-auto text-xs font-medium tabular-nums">
              {durationText(step.durationMs)}
            </span>
          ) : null}
        </div>
        {share !== null ? (
          <div
            aria-hidden
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                'h-full rounded-full',
                step.by === 'ai' ? 'bg-primary' : 'bg-muted-foreground/40',
              )}
              style={{ width: `${Math.max(share * 100, 1.5)}%` }}
            />
          </div>
        ) : null}
        {step.explain ? (
          <p className="mt-1.5 text-[13.5px] leading-relaxed">{step.explain}</p>
        ) : null}
        {step.result ? (
          <p className="mt-1 text-[13px] font-medium text-foreground">
            Hasil: {step.result}
          </p>
        ) : null}
        {step.error ? (
          <p className="mt-1.5 text-[13px] text-danger">{step.error}</p>
        ) : null}
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>{step.recorded}</span>
          {step.model ? <span>model {step.model}</span> : null}
          {step.tokens > 0 ? (
            <span>{compactNumber(step.tokens)} token</span>
          ) : null}
        </p>
        {step.detail ? (
          <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
            <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/50">
              {open ? 'Sembunyikan rincian' : 'Lihat rincian'}
              <ChevronDownIcon
                className={cn(
                  'size-3.5 motion-safe:transition-transform',
                  open && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Detail detail={step.detail} thresholds={thresholds} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </li>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 bg-popover px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
        {children}
      </dd>
    </div>
  )
}

function LogDialogBody({
  log,
  thresholds,
  bodyRef,
}: {
  log: AssessmentLogData
  thresholds: Thresholds
  bodyRef: RefObject<HTMLDivElement | null>
}) {
  const end = log.endedAt
  return (
    <>
      <DialogHeader className="gap-3 bg-popover">
        <div className="space-y-1 pr-8">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ListTreeIcon className="size-4 text-primary" aria-hidden />
            Log penilaian
            {log.status !== 'selesai' ? (
              <Badge variant="outline" className="font-normal">
                {JOB_STATUS_LABEL[log.status]}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="max-sm:sr-only">
            Apa saja yang dikerjakan AISA saat menilai proposal ini, berurutan
            dari awal sampai selesai. Semua jam dalam WIB.
          </DialogDescription>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          <Stat label="Lama penilaian">
            {log.durationMs !== null ? durationText(log.durationMs) : '—'}
          </Stat>
          <Stat label={longDate(log.startedAt)}>
            {clockTime(log.startedAt)} → {end ? clockTime(end) : '…'}
          </Stat>
          <Stat label="Token AI">{compactNumber(log.tokens)}</Stat>
          <Stat label="Model">{log.model ?? 'tidak dipakai'}</Stat>
        </dl>
        <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Pelaku">
          {(['ai', 'sistem', 'manajer'] as const).map((by) =>
            log.counts[by] ? (
              <li key={by}>
                <Badge variant="outline" className={cn('h-6', BY[by].badge)}>
                  {log.counts[by]} langkah {BY[by].label}
                </Badge>
              </li>
            ) : null,
          )}
        </ul>
      </DialogHeader>
      <DialogBody
        ref={bodyRef}
        tabIndex={-1}
        className="px-4 py-5 outline-none sm:px-6"
      >
        <div className="mb-5 flex gap-3 rounded-xl bg-muted/50 p-3 text-[13px]">
          <SparklesIcon
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden
          />
          <p>
            <span className="font-medium">
              AI hanya memberi nilai dan menulis alasannya.
            </span>{' '}
            <span className="text-muted-foreground">
              Skor, cek fokus, dan kategori dihitung sistem dengan aturan yang
              sama untuk semua proposal. Garis di bawah tiap langkah menunjukkan
              porsinya dari seluruh waktu penilaian.
            </span>
          </p>
        </div>
        <ol aria-label="Langkah penilaian">
          {log.steps.map((step, index) => (
            <TimelineNode
              key={step.id}
              step={step}
              last={index === log.steps.length - 1}
              totalMs={log.durationMs}
              thresholds={thresholds}
            />
          ))}
        </ol>
        {log.status === 'berjalan' ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Penilaian masih berjalan. Langkah berikutnya muncul di sini setelah
            selesai.
          </p>
        ) : null}
        {log.after.length ? (
          <>
            <p className="my-5 flex items-center gap-3 text-xs font-medium text-muted-foreground">
              <span aria-hidden className="h-px flex-1 bg-border" />
              Setelah penilaian
              <span aria-hidden className="h-px flex-1 bg-border" />
            </p>
            <ol aria-label="Keputusan manajer">
              {log.after.map((step, index) => (
                <TimelineNode
                  key={step.id}
                  step={step}
                  last={index === log.after.length - 1}
                  totalMs={null}
                  thresholds={thresholds}
                />
              ))}
            </ol>
          </>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Log ini disimpan sebagai jejak audit.
          </p>
          <Link
            href={`/aktivitas?job=${encodeURIComponent(log.jobId)}#job-${log.jobId}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Semua aktivitas AI
            <ArrowRightIcon />
          </Link>
        </div>
      </DialogBody>
    </>
  )
}

const LogContext = createContext<(() => void) | null>(null)

/**
 * One dialog per page, opened from any `LogButton` inside it — the score box,
 * the Ringkasan AI card and the Riwayat card all open the same log, so it is
 * sent to the browser once. With no `log` (the proposal has no assessment job
 * yet) the buttons render nothing.
 */
export function AssessmentLogProvider({
  log,
  thresholds,
  children,
}: {
  log: AssessmentLogData | null
  thresholds: Thresholds
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const openLog = useCallback(() => setOpen(true), [])
  // Open at the top of the timeline: the default would focus the first
  // citation button and scroll past the start on a small screen.
  const bodyRef = useRef<HTMLDivElement>(null)
  const preview = useDeckPreviewPanel()

  return (
    <LogContext.Provider value={log ? openLog : null}>
      {children}
      {log ? (
        <Dialog
          open={open}
          onOpenChange={(next, details) => {
            // An Escape meant for the deck preview opened from this log.
            if (!next && details.reason === 'escape-key' && preview.open)
              return preview.close()
            setOpen(next)
          }}
        >
          <DialogContent
            size="content"
            initialFocus={bodyRef}
            className="max-h-[92svh] max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:rounded-none sm:max-w-3xl"
          >
            <LogDialogBody
              log={log}
              thresholds={thresholds}
              bodyRef={bodyRef}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </LogContext.Provider>
  )
}

/** A button that opens the page's log dialog; nothing when there is no log. */
export function LogButton(
  props: Omit<ComponentProps<typeof Button>, 'onClick'>,
) {
  const openLog = useContext(LogContext)
  if (!openLog) return null
  return <Button {...props} onClick={openLog} />
}
