import {
  CRITERIA,
  type Proposal,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { formatDecimal, formatNumber } from '@/lib/format/number'

// Display helpers the proposal pages share. Dates use the numeric day ("1 Sep
// 2026"), not `formatDate`'s two-digit one, because that is how the list and
// detail read in the original design.

const day = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const dayTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const clock = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const minuteClock = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})
const weekdayDay = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const compact = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const shortDate = (date: Date) => day.format(date)

/**
 * Select-all's visible text AND accessible name. It names the page it reaches,
 * because the list paginates: a bare "Pilih semua" beside "dari 87" reads as
 * picking all 87.
 */
export const selectAllLabel = (onPage: number) =>
  `Pilih semua ${formatNumber(onPage)} proposal di halaman ini`
export const dateTime = (date: Date) => dayTime.format(date)
/** "10.56.40 WIB": the exact moment, for a tooltip beside a coarser label. */
export const clockTime = (date: Date) => `${clock.format(date)} WIB`
/** 25_700 → "25,7 rb", for token counts. */
export const compactNumber = (value: number) => compact.format(value)

/** "Tani Maju" → "TM". */
export const initials = (name: string) =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')

/**
 * When an assessment ran, to the minute: "Kamis, 22 Okt 2026 · 10.56–10.58 WIB".
 * One time when it started and ended in the same minute, "10.56–… WIB" while it
 * is still running, and the end's own day when it ran past WIB midnight.
 */
export function timeRange(start: Date, end: Date | null) {
  const from = minuteClock.format(start)
  const startDay = weekdayDay.format(start)
  if (!end) return `${startDay} · ${from}–… WIB`
  const to = minuteClock.format(end)
  const endDay = weekdayDay.format(end)
  if (endDay !== startDay)
    return `${startDay} · ${from} – ${endDay} · ${to} WIB`
  return `${startDay} · ${from === to ? from : `${from}–${to}`} WIB`
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/**
 * Time since the assessment started, in whole seconds: "+12 dtk",
 * "+1 mnt 05 dtk", and past an hour "+1 jam 02 mnt". A step logged a moment
 * before the job's own start reads "+0 dtk", never a negative offset.
 */
export function elapsedText(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `+${seconds} dtk`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `+${minutes} mnt ${pad2(seconds % 60)} dtk`
  return `+${Math.floor(minutes / 60)} jam ${pad2(minutes % 60)} mnt`
}

export const durationText = (ms: number) =>
  ms >= 1000
    ? `${formatDecimal(ms / 1000, { max: 1 })} dtk`
    : `${formatDecimal(ms, { max: 0 })} md`

/**
 * One criterion's points under `weights`: the same formula the API scores with,
 * Σ bobot × (nilai − 1) / 4, on a 0–100 scale.
 */
export function criterionPoints(value: number, weight: number) {
  return weight * 100 * ((value - 1) / 4)
}

/** The score the CURRENT weights would give; compared with the stored one. */
export function scoreUnder(
  assessment: NonNullable<Proposal['assessment']>,
  weights: Rules['weights'],
) {
  return CRITERIA.reduce((sum, criterion) => {
    const item = assessment.criteria[criterion]
    return item ? sum + criterionPoints(item.value, weights[criterion]) : sum
  }, 0)
}
