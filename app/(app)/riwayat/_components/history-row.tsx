'use client'

import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BotIcon,
  ChevronDownIcon,
  LayoutDashboardIcon,
  MessageCircleIcon,
  PlugIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useState, type CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  CATEGORY_LABEL,
  QUALITY_OUTSIDE_FOCUS_LABEL,
  RESPONSE_LABEL,
  VIA_LABEL,
} from '@/features/aisa/aisa.labels'
import {
  CATEGORIES,
  type ResponseKind,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { formatNumber, formatScore } from '@/lib/format/number'
import { cn } from '@/lib/utils'

import {
  CATEGORY_DOT,
  CategoryBadge,
  scoreTone,
} from '../../_components/badges'
import { ACTOR_LABEL, type ActorType, type RiwayatEvent } from './events'
import { eventTone, formatClock, formatFull } from './metrics'

export type Thresholds = Rules['thresholds'] | null

const proposalHref = (id: string) => `/proposal/${encodeURIComponent(id)}`

export function EventIcon({
  event,
  className,
}: {
  event: Pick<RiwayatEvent, 'kind' | 'decision' | 'paused' | 'manual'>
  className?: string
}) {
  const { icon: Icon, tone } = eventTone(event)
  return (
    <span
      aria-hidden
      style={{ '--tone': tone } as CSSProperties}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklch,var(--tone)_13%,var(--card))] text-[var(--tone)] ring-4 ring-card',
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

export function Actor({
  actor,
  className,
}: {
  actor: ActorType
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-semibold',
          actor === 'manajer' && 'bg-primary text-primary-foreground',
          actor === 'ai' &&
            'bg-[color-mix(in_oklch,var(--agent-1)_15%,var(--card))] text-[var(--agent-1)]',
          actor === 'sistem' && 'bg-muted text-muted-foreground',
        )}
      >
        {actor === 'manajer' ? (
          'M'
        ) : actor === 'ai' ? (
          <BotIcon className="size-2.5" />
        ) : (
          <PlugIcon className="size-2.5" />
        )}
      </span>
      <span className="font-medium text-foreground/80">
        {ACTOR_LABEL[actor]}
      </span>
    </span>
  )
}

function Channel({ via }: { via: 'wa' | 'dashboard' }) {
  const Icon = via === 'wa' ? MessageCircleIcon : LayoutDashboardIcon
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3" aria-hidden />
      via {VIA_LABEL[via]}
    </span>
  )
}

function Startup({ event }: { event: RiwayatEvent }) {
  const p = event.proposal
  if (!p) return <b className="font-semibold">proposal</b>
  if (!p.linkable)
    return <b className="font-semibold text-muted-foreground">{p.name}</b>
  return (
    <Link
      href={proposalHref(p.id)}
      className="font-semibold decoration-primary/40 underline-offset-4 hover:text-primary hover:underline"
    >
      {p.name}
    </Link>
  )
}

const DECISION_VERB: Record<ResponseKind, string> = {
  undang: 'diundang diskusi',
  pantau: 'dipantau',
  arsipkan: 'diarsipkan',
}

const SLOT_WORD = { '09.00': 'pagi', '17.00': 'sore' } as const

function Title({ event }: { event: RiwayatEvent }) {
  switch (event.kind) {
    case 'keputusan':
      if (event.action === 'tanggapan_massal')
        return (
          <>
            Tanggapan massal:{' '}
            {event.decision ? DECISION_VERB[event.decision] : 'ditanggapi'}
          </>
        )
      return (
        <>
          <Startup event={event} />{' '}
          {event.decision ? DECISION_VERB[event.decision] : 'ditanggapi'}
        </>
      )
    case 'penilaian':
      return (
        <>
          AISA selesai menilai <Startup event={event} />
        </>
      )
    case 'masuk':
      return event.manual ? (
        <>
          <Startup event={event} /> masuk, perlu dicek manual
        </>
      ) : (
        <>
          <Startup event={event} /> mengirim proposal
        </>
      )
    case 'whatsapp':
      return (
        <>Ringkasan {event.slot ? `${SLOT_WORD[event.slot]} ` : ''}terkirim</>
      )
    case 'koreksi':
      return (
        <>
          Kategori <Startup event={event} /> dikoreksi
        </>
      )
    case 'aturan':
      return (
        <>
          Aturan penilaian diperbarui
          {event.rulesVersion ? ` ke versi ${event.rulesVersion}` : ''}
        </>
      )
    case 'jeda':
      return (
        <>
          {event.paused
            ? 'Pekerjaan AI dijeda (STOP)'
            : 'Pekerjaan AI dilanjutkan (LANJUT)'}
        </>
      )
    case 'dihapus':
      return <>Sebuah proposal dihapus</>
    case 'lainnya':
      return <>{event.detail}</>
  }
}

function Quote({ text }: { text: string }) {
  return (
    <p className="border-l-2 pl-2.5 text-[13px] text-foreground/80 italic">
      “{text}”
    </p>
  )
}

function DigestDetails({ event }: { event: RiwayatEvent }) {
  const [open, setOpen] = useState(false)
  const digest = event.digest
  if (!digest)
    return <p className="text-[13px] text-muted-foreground">{event.detail}</p>
  const pending = digest.counts.belumDitanggapi
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <p className="text-[13px] text-muted-foreground">
        {pending
          ? `Ke WhatsApp · ${formatNumber(pending)} proposal menunggu keputusan`
          : 'Ke WhatsApp · semua proposal sudah ditanggapi'}
        {digest.usedTemplate ? ' · template' : ''}
        <span aria-hidden> · </span>
        <CollapsibleTrigger className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
          {open ? 'Tutup isi' : 'Lihat isi'}
          <ChevronDownIcon
            className={cn(
              'size-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
      </p>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 rounded-lg border bg-muted/50 p-3 text-[13px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {CATEGORIES.map((category) => (
              <span key={category} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    CATEGORY_DOT[category],
                  )}
                />
                {CATEGORY_LABEL[category]}
                <b className="font-mono font-semibold tabular-nums">
                  {digest.counts[category]}
                </b>
              </span>
            ))}
            {digest.counts.perluDicekManual ? (
              <span className="inline-flex items-center gap-1.5">
                Perlu dicek manual
                <b className="font-mono font-semibold tabular-nums">
                  {digest.counts.perluDicekManual}
                </b>
              </span>
            ) : null}
          </div>
          {digest.insight ? (
            <p className="leading-relaxed text-foreground/85">
              {digest.insight}
            </p>
          ) : null}
          <div className="rounded-lg rounded-tl-sm border bg-background p-3 text-xs leading-relaxed whitespace-pre-line text-muted-foreground shadow-xs">
            {digest.text}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const SOURCE_WORD = {
  form: 'masuk lewat Google Form',
  upload: 'diunggah manual',
}

function Details({
  event,
  thresholds,
}: {
  event: RiwayatEvent
  thresholds: Thresholds
}) {
  const p = event.proposal
  switch (event.kind) {
    case 'penilaian':
      return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {p?.score !== undefined ? (
            <span className="text-muted-foreground">
              Skor{' '}
              <b
                className={cn(
                  'font-mono font-semibold tabular-nums',
                  scoreTone(p.score, thresholds).text,
                )}
              >
                {formatScore(p.score)}
              </b>
              /100
            </span>
          ) : null}
          {event.categoryTo ? (
            <CategoryBadge category={event.categoryTo} />
          ) : null}
          {p?.qualityOutsideFocus ? (
            <Badge variant="outline">{QUALITY_OUTSIDE_FOCUS_LABEL}</Badge>
          ) : null}
          {p?.sector || p?.source ? (
            <span className="text-muted-foreground">
              {[p.sector, p.source ? SOURCE_WORD[p.source] : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </div>
      )
    case 'masuk':
      return (
        <p className="text-[13px] text-muted-foreground">
          {(event.manual && p?.statusReason) || event.detail}
        </p>
      )
    case 'koreksi':
      return (
        <div className="space-y-1.5 text-[13px]">
          {event.categoryFrom && event.categoryTo ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge
                category={event.categoryFrom}
                className="opacity-70"
              />
              <ArrowRightIcon
                className="size-3.5 text-muted-foreground"
                aria-label="menjadi"
              />
              <CategoryBadge category={event.categoryTo} />
            </div>
          ) : (
            <p className="text-muted-foreground">{event.detail}</p>
          )}
          {event.reason ? <Quote text={event.reason} /> : null}
        </div>
      )
    case 'keputusan':
      if (event.action === 'tanggapan_massal')
        return (
          <p className="text-[13px] text-muted-foreground">{event.detail}</p>
        )
      return event.previousDecision || event.reason ? (
        <div className="space-y-1.5">
          {event.previousDecision ? (
            <p className="text-[13px] text-muted-foreground">
              Sebelumnya: {RESPONSE_LABEL[event.previousDecision]}
            </p>
          ) : null}
          {event.reason ? <Quote text={event.reason} /> : null}
        </div>
      ) : null
    case 'whatsapp':
      return <DigestDetails event={event} />
    case 'aturan':
      return (
        <div className="space-y-1.5">
          <p className="text-[13px] text-muted-foreground">
            Berlaku untuk proposal berikutnya. Skor lama tidak berubah.
          </p>
          {event.reason ? <Quote text={event.reason} /> : null}
        </div>
      )
    case 'dihapus':
      return (
        <div className="space-y-1.5">
          <p className="text-[13px] text-muted-foreground">{event.detail}</p>
          {event.reason ? <Quote text={event.reason} /> : null}
        </div>
      )
    case 'jeda':
    case 'lainnya':
      return null
  }
}

export function HistoryRow({
  event,
  thresholds,
}: {
  event: RiwayatEvent
  thresholds: Thresholds
}) {
  const href = event.proposal?.linkable
    ? proposalHref(event.proposal.id)
    : event.kind === 'aturan'
      ? '/aturan'
      : undefined

  return (
    <li className="group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-[calc(1rem+15.5px)] w-px bg-border group-first:top-6 group-last:bottom-[calc(100%-1.5rem)] sm:left-[calc(1.25rem+15.5px)]"
      />
      <EventIcon event={event} className="relative mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <Title event={event} />
          </p>
          <time
            dateTime={event.at.toISOString()}
            title={formatFull(event.at)}
            className="shrink-0 pt-px font-mono text-xs text-muted-foreground tabular-nums"
          >
            {formatClock(event.at)}
          </time>
        </div>
        <Details event={event} thresholds={thresholds} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Actor actor={event.actor} />
          {event.via !== 'sistem' ? <Channel via={event.via} /> : null}
          {event.tokens !== undefined ? (
            <span>{formatNumber(event.tokens)} token</span>
          ) : null}
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          aria-label={
            event.proposal?.linkable
              ? `Buka proposal ${event.proposal.name}`
              : 'Buka aturan penilaian'
          }
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
            '-mr-1 self-center text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
          )}
        >
          <ArrowUpRightIcon />
        </Link>
      ) : null}
    </li>
  )
}
