import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { formatDecimal } from '@/lib/format/number'

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** A token count at a glance: `536,9 rb`, `1,3 jt`. The exact value goes in a `title`. */
export function compact(value: number): string {
  return compactFormatter.format(value)
}

/** Milliseconds as seconds with one decimal: `1,2 dtk`; `—` while a job still runs. */
export function seconds(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return `${formatDecimal(ms / 1000, { min: 1, max: 1 })} dtk`
}

const dayTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const clock = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** `21 Okt 17.00.00`, in WIB. */
export function formatDayTime(date: Date): string {
  return dayTime.format(date).replace(',', '')
}

/** `17.00.00`, in WIB. */
export function formatClock(date: Date): string {
  return clock.format(date)
}
