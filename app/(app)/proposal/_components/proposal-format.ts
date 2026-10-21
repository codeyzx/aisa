import {
  CRITERIA,
  type Proposal,
  type Rules,
} from '@/features/aisa/aisa.schema'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { formatDecimal, formatNumber } from '@/lib/format/number'

// Display helpers the proposal pages share. Dates use the numeric day ("1 Sep
// 2026"), not `formatDate`'s two-digit one, because that is how the list and
// detail read in the prototype.

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
const longDay = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
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
export const clockTime = (date: Date) => clock.format(date)
export const longDate = (date: Date) => longDay.format(date)
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
