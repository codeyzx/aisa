import {
  ArrowRightLeftIcon,
  BanIcon,
  CircleHelpIcon,
  FileInputIcon,
  FileWarningIcon,
  MessageCircleIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  ThumbsUpIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react'

import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { formatScore } from '@/lib/format/number'

import type { EventKind, RiwayatEvent } from './events'

export type KindFilter = EventKind | 'semua'
export type Period = '7' | '30' | 'semua'
export type ChannelFilter = 'semua' | 'dashboard' | 'wa'

export const PERIOD_LABEL: Record<Period, string> = {
  '7': '7 hari terakhir',
  '30': '30 hari terakhir',
  semua: 'Semua waktu',
}

export const CHANNEL_FILTER_LABEL: Record<ChannelFilter, string> = {
  semua: 'Semua kanal',
  dashboard: 'Lewat Dashboard',
  wa: 'Lewat WhatsApp',
}

/** Tab order; short labels so they fit on a phone. */
export const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: 'semua', label: 'Semua' },
  { value: 'keputusan', label: 'Keputusan' },
  { value: 'penilaian', label: 'Penilaian AI' },
  { value: 'nilai_ulang', label: 'Dinilai ulang' },
  { value: 'masuk', label: 'Proposal masuk' },
  { value: 'whatsapp', label: 'Ringkasan WA' },
  { value: 'koreksi', label: 'Koreksi' },
  { value: 'aturan', label: 'Aturan' },
  { value: 'jeda', label: 'STOP/LANJUT' },
  { value: 'dihapus', label: 'Dihapus' },
  { value: 'lainnya', label: 'Lainnya' },
]

export const KIND_LABEL: Record<EventKind, string> = {
  keputusan: 'Keputusan',
  penilaian: 'Penilaian AI',
  nilai_ulang: 'Penilaian ulang (skala baru)',
  masuk: 'Proposal masuk',
  whatsapp: 'Ringkasan WhatsApp',
  koreksi: 'Koreksi grade',
  aturan: 'Perubahan aturan',
  jeda: 'STOP/LANJUT',
  dihapus: 'Proposal dihapus',
  lainnya: 'Lainnya',
}

/** Icon and colour (a CSS token) per event; a decision takes its response's colour. */
export function eventTone(
  event: Pick<
    RiwayatEvent,
    'kind' | 'decision' | 'paused' | 'manual' | 'migrated'
  >,
): { icon: LucideIcon; tone: string } {
  switch (event.kind) {
    case 'penilaian':
      return { icon: SparklesIcon, tone: 'var(--agent-1)' }
    case 'nilai_ulang':
      return { icon: RefreshCwIcon, tone: 'var(--agent-1)' }
    case 'masuk':
      return event.manual
        ? { icon: FileWarningIcon, tone: 'var(--warning)' }
        : { icon: FileInputIcon, tone: 'var(--muted-foreground)' }
    case 'whatsapp':
      return { icon: MessageCircleIcon, tone: 'var(--agent-2)' }
    case 'koreksi':
      return { icon: PencilLineIcon, tone: 'var(--warning)' }
    case 'aturan':
      return { icon: SlidersHorizontalIcon, tone: 'var(--foreground)' }
    case 'jeda':
      return event.paused
        ? { icon: PauseIcon, tone: 'var(--danger)' }
        : { icon: PlayIcon, tone: 'var(--success)' }
    case 'dihapus':
      return { icon: Trash2Icon, tone: 'var(--danger)' }
    case 'lainnya':
      return { icon: CircleHelpIcon, tone: 'var(--muted-foreground)' }
    case 'keputusan':
      if (event.migrated)
        return { icon: ArrowRightLeftIcon, tone: 'var(--muted-foreground)' }
      if (event.decision === 'setuju')
        return { icon: ThumbsUpIcon, tone: 'var(--success)' }
      if (event.decision === 'tolak')
        return { icon: BanIcon, tone: 'var(--danger)' }
      return { icon: CircleHelpIcon, tone: 'var(--muted-foreground)' }
  }
}

const DAY_MS = 86_400_000

export const inPeriod = (event: RiwayatEvent, period: Period, now: number) =>
  period === 'semua' || event.at.getTime() >= now - Number(period) * DAY_MS

const wibDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `yyyy-MM-dd` of the instant in WIB — the timeline's day key. */
export const dayKey = (date: Date) => wibDate.format(date)

export type StatKind = 'keputusan' | 'penilaian' | 'whatsapp' | 'koreksi'

export interface EventStat {
  kind: StatKind
  value: number
  previous: number
  /** Per WIB day, 7 days, oldest first. */
  daily: { day: string; count: number }[]
  hint: string
}

// A migration row moved an old decision onto the new scale; nobody decided
// anything, so it is not counted as a keputusan.
const counted = (e: RiwayatEvent) => !e.migrated

/** Rolling 7 days (not calendar) against the 7 days before. */
export function eventStats(events: RiwayatEvent[], now: number): EventStat[] {
  const start = now - 7 * DAY_MS
  const previousStart = now - 14 * DAY_MS
  const recent = events.filter((e) => e.at.getTime() >= start)
  const days = Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(now - (6 - i) * DAY_MS)),
  )

  const build = (kind: StatKind, hint: string): EventStat => {
    const of = events.filter((e) => e.kind === kind && counted(e))
    return {
      kind,
      value: of.filter((e) => e.at.getTime() >= start).length,
      previous: of.filter(
        (e) => e.at.getTime() >= previousStart && e.at.getTime() < start,
      ).length,
      daily: days.map((day) => ({
        day,
        count: of.filter((e) => dayKey(e.at) === day).length,
      })),
      hint,
    }
  }

  const decisions = recent.filter((e) => e.kind === 'keputusan' && counted(e))
  const by = (kind: string) =>
    decisions.filter((e) => e.decision === kind).length
  const unknown = decisions.filter((e) => e.decision === undefined).length
  const legacy = decisions.length - by('setuju') - by('tolak') - unknown
  const viaWhatsapp = decisions.filter((e) => e.via === 'wa').length
  const assessed = recent.filter((e) => e.kind === 'penilaian')
  const scores = assessed
    .map((e) => e.proposal?.score)
    .filter((s): s is number => s !== undefined)
  const corrections = recent.filter((e) => e.kind === 'koreksi').length

  return [
    build(
      'keputusan',
      decisions.length
        ? [
            `${by('setuju')} disetujui`,
            `${by('tolak')} ditolak`,
            ...(legacy ? [`${legacy} skala lama`] : []),
            // Deleting a proposal blanks its rows' before/after, so their kind
            // is gone; counting them keeps the breakdown summing to the total.
            ...(unknown ? [`${unknown} tanpa rincian`] : []),
          ].join(' · ')
        : 'Belum ada keputusan',
    ),
    build(
      'penilaian',
      scores.length
        ? `Rata-rata skor ${formatScore(scores.reduce((a, b) => a + b, 0) / scores.length)}`
        : 'Belum ada penilaian',
    ),
    build(
      'whatsapp',
      viaWhatsapp
        ? `${viaWhatsapp} keputusan dibalas lewat WhatsApp`
        : 'Belum ada balasan lewat WhatsApp',
    ),
    build(
      'koreksi',
      corrections
        ? assessed.length
          ? `${Math.round((corrections / assessed.length) * 100)}% dari penilaian minggu ini`
          : `${corrections} koreksi minggu ini`
        : 'Grade AI belum perlu dikoreksi',
    ),
  ]
}

const dayLong = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const dayLongYear = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
})

/** "Hari ini" / "Kemarin" (with the date beside it), else the weekday and date. */
export function dayLabel(
  sample: Date,
  now: number,
): { label: string; date?: string } {
  const key = dayKey(sample)
  if (key === dayKey(new Date(now)))
    return { label: 'Hari ini', date: dayMonth.format(sample) }
  if (key === dayKey(new Date(now - DAY_MS)))
    return { label: 'Kemarin', date: dayMonth.format(sample) }
  const sameYear = key.slice(0, 4) === dayKey(new Date(now)).slice(0, 4)
  return { label: (sameYear ? dayLong : dayLongYear).format(sample) }
}

const clock = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const full = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  dateStyle: 'full',
  timeStyle: 'short',
})

export const formatClock = (date: Date) => clock.format(date)
export const formatFull = (date: Date) => full.format(date)
