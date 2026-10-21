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
  useState,
  type ComponentProps,
} from 'react'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { JOB_STATUS_LABEL } from '@/features/aisa/aisa.labels'
import type { Rules } from '@/features/aisa/aisa.schema'
import { formatDecimal, formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import { scoreTone } from '../../_components/badges'
import type {
  AssessmentLogData,
  LogDetail,
  LogStep,
} from './assessment-log-data'
import { DeckPageLink } from './deck-preview'
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

const BY: Record<
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

function Detail({
  detail,
  thresholds,
}: {
  detail: LogDetail
  thresholds: Thresholds
}) {
  switch (detail.type) {
    case 'criteria':
      return (
        <ol className="space-y-2.5">
          {detail.items.map((item) => (
            <li
              key={item.label}
              className="rounded-lg border bg-background p-3"
            >
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
                    <dt className="mb-0.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <FileTextIcon className="size-3" />
                      Bukti dari{' '}
                      <DeckPageLink
                        page={citation.page}
                        className="rounded-sm uppercase"
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
                      <Badge variant="outline">
                        kutipan tidak terverifikasi
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                <div>
                  <dt className="mb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Alasan AI
                  </dt>
                  <dd className="leading-relaxed">{item.reason}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )
    case 'score':
      return (
        <div className="overflow-hidden rounded-lg border bg-background text-[13px]">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
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
    case 'fit':
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
}

function Step({
  step,
  last,
  thresholds,
}: {
  step: LogStep
  last: boolean
  thresholds: Thresholds
}) {
  const [open, setOpen] = useState(step.detail?.type === 'criteria')
  const by = BY[step.by]

  return (
    <li className="relative flex gap-3.5 pb-6 last:pb-0">
      {!last ? (
        <span
          aria-hidden
          className="absolute top-9 bottom-0 left-[17px] w-px bg-border"
        />
      ) : null}
      <span
        className={cn(
          'z-10 grid size-9 shrink-0 place-items-center rounded-full',
          by.dot,
        )}
      >
        <by.icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold">{step.title}</p>
          <Badge
            variant="outline"
            className={cn('h-5 px-1.5 text-[10.5px]', by.badge)}
          >
            {by.label}
          </Badge>
          {step.status !== 'ok' ? (
            <Badge
              variant="outline"
              className="h-5 border-danger/30 bg-danger-soft px-1.5 text-[10.5px] text-danger"
            >
              {step.status === 'gagal' ? 'Gagal' : 'Dihentikan'}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span className={step.by === 'manajer' ? undefined : 'font-mono'}>
            {step.actor}
          </span>
          {step.model ? <span className="font-mono">{step.model}</span> : null}
          <span>{clockTime(step.at)}</span>
          {step.durationMs > 0 ? (
            <span>{durationText(step.durationMs)}</span>
          ) : null}
          {step.tokens > 0 ? (
            <span>{compactNumber(step.tokens)} token</span>
          ) : null}
        </p>
        {step.summary ? (
          <p className="mt-1.5 text-[13.5px] leading-relaxed">{step.summary}</p>
        ) : null}
        {step.error ? (
          <p className="mt-1.5 text-[13px] text-danger">{step.error}</p>
        ) : null}
        {step.detail ? (
          <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
            <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
              {open ? 'Sembunyikan rincian' : 'Lihat rincian'}
              <ChevronDownIcon
                className={cn(
                  'size-3.5 transition-transform',
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

const LogContext = createContext<(() => void) | null>(null)

/**
 * One panel per page, opened from any `LogTrigger` inside it — the header, the
 * Ringkasan AI card and the Riwayat card all open the same sheet, so the log is
 * sent to the browser once. With no `log` (the proposal has no assessment job
 * yet) the triggers render nothing.
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
  const aiSteps = log?.steps.filter((step) => step.by === 'ai').length ?? 0

  return (
    <LogContext.Provider value={log ? openLog : null}>
      {children}
      {log ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
            <SheetHeader className="border-b p-5 pr-12">
              <SheetTitle className="flex items-center gap-2 text-base">
                <ListTreeIcon className="size-4 text-primary" />
                Log penilaian
              </SheetTitle>
              <SheetDescription>
                Urutan kerja AISA saat menilai proposal ini, dari dokumen masuk
                sampai kategori ditentukan.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-5 p-5">
                <div className="grid grid-cols-3 divide-x rounded-xl border text-center">
                  <div className="p-3">
                    <p className="text-lg font-semibold tabular-nums">
                      {log.durationMs !== null
                        ? `${formatDecimal(Math.max(1, Math.round(log.durationMs / 1000)), { max: 0 })} dtk`
                        : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Lama penilaian
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-lg font-semibold tabular-nums">
                      {compactNumber(log.tokens)}
                    </p>
                    <p className="text-xs text-muted-foreground">Token AI</p>
                  </div>
                  <div className="p-3">
                    <p className="text-lg font-semibold tabular-nums">
                      {aiSteps}/{log.steps.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Langkah oleh AI
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-xl bg-muted/50 p-3 text-[13px]">
                  <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>
                    <span className="font-medium">
                      AI hanya memberi nilai dan menulis teks.
                    </span>{' '}
                    <span className="text-muted-foreground">
                      Skor, cek fokus, dan kategori dihitung sistem dengan
                      aturan yang sama untuk semua proposal.
                    </span>
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  {log.status === 'selesai'
                    ? `Dinilai ${longDate(log.endedAt ?? log.startedAt)}`
                    : `${JOB_STATUS_LABEL[log.status]} · mulai ${longDate(log.startedAt)}`}
                </p>
                <ol>
                  {log.steps.map((step, index) => (
                    <Step
                      key={step.id}
                      step={step}
                      last={index === log.steps.length - 1}
                      thresholds={thresholds}
                    />
                  ))}
                </ol>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
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
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </LogContext.Provider>
  )
}

/** A button that opens the page's log panel; nothing when there is no log. */
export function LogButton(
  props: Omit<ComponentProps<typeof Button>, 'onClick'>,
) {
  const openLog = useContext(LogContext)
  if (!openLog) return null
  return <Button {...props} onClick={openLog} />
}
