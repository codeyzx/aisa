import { LOCALE } from './locale'

// Constructing an Intl formatter is the expensive part; formatting is cheap.
// Module scope means one construction per process, shared by every call.
const numberFormatter = new Intl.NumberFormat(LOCALE)

/**
 * Format a plain integer count/total for display with locale grouping, e.g.
 * `1234567` -> `1.234.567` in `id-ID` (the thousands separator is a dot, not a
 * comma — the one thing a reader would misread if the raw number shipped).
 *
 * For a user-visible COUNT or TOTAL — "Menampilkan 20 dari 1.234" — never a
 * MONEY amount: money carries a currency and goes through `formatRupiah`
 * (`lib/format/currency.ts`), which this deliberately does not duplicate. Takes
 * a plain `number`; a string reaching a number formatter is a call-site bug, not
 * something to coerce here.
 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

// One formatter per fraction-digit shape, built on first use and then shared.
const decimalFormatters = new Map<string, Intl.NumberFormat>()

/**
 * Format a decimal MEASURE — a score, a percentage — with the `id-ID` decimal
 * COMMA (`92,5`, not `92.5`), so every number on screen reads the way the
 * WhatsApp texts and the rules summary already write it. `min` pads trailing
 * zeros (`50,0`); `max` rounds. Prefer `formatScore` / `formatPercent`, which pin
 * the shape each kind of number uses.
 */
export function formatDecimal(
  value: number,
  { min = 0, max }: { min?: number; max: number },
): string {
  const key = `${min}:${max}`
  let formatter = decimalFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    })
    decimalFormatters.set(key, formatter)
  }
  return formatter.format(value)
}

/** A 0–100 quality score, always one decimal: `92,5`, `50,0`. */
export function formatScore(score: number): string {
  return formatDecimal(score, { min: 1, max: 1 })
}

/** A value already in percent units, up to two decimals: `27,5%`, `30%`. */
export function formatPercent(percent: number): string {
  return `${formatDecimal(percent, { max: 2 })}%`
}
