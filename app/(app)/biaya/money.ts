import { formatRupiah } from '@/lib/format/currency'
import { LOCALE } from '@/lib/format/locale'
import { formatDecimal } from '@/lib/format/number'

/** Rupiah for a cost that can be a fraction of one rupiah: `< Rp 1`, never `Rp 0`. */
export function rupiah(idr: number): string {
  return idr > 0 && idr < 1 ? '< Rp 1' : formatRupiah(idr)
}

const compactIdr = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** An axis tick or a big round amount: `Rp 1,2 jt`, `Rp 350 rb`. */
export function compactRupiah(idr: number): string {
  return `Rp ${compactIdr.format(idr)}`
}

/** A share as a percentage; a tiny non-zero share keeps two decimals. */
export function share(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  const pct = (part / whole) * 100
  if (pct > 0 && pct < 0.01) return '< 0,01%'
  return `${formatDecimal(pct, { max: pct < 1 ? 2 : pct < 10 ? 1 : 0 })}%`
}

const longDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** `2026-10-06` → `6 Okt 2026`. The ISO date is already a calendar date. */
export function isoDateLabel(iso: string): string {
  return longDate.format(new Date(`${iso}T00:00:00Z`))
}
