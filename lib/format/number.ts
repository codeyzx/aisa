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
