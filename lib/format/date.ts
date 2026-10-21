import { LOCALE, TIME_ZONE } from './locale'

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/** Calendar date in WIB, e.g. `16 Jul 2026`. */
export function formatDate(date: Date): string {
  return dateFormatter.format(date)
}

/**
 * Clock time in WIB, 24-hour, e.g. `18.30`.
 *
 * The instant is interpreted in WIB, not the host zone: a `Date` at
 * `2026-07-16T23:30:00Z` is already 17 Jul 06.30 in Jakarta.
 */
export function formatTime(date: Date): string {
  return timeFormatter.format(date)
}
