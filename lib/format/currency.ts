import { CURRENCY, CURRENCY_FRACTION_DIGITS, LOCALE } from './locale'

// Constructing an Intl formatter is the expensive part; formatting is cheap.
// Module scope means one construction per process, shared by every call.
const rupiahFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  // Minor-unit digits are PINNED (lib/format/locale.ts), not left to the
  // currency's CLDR default: that default drifts across ICU versions (IDR → 0 on
  // ICU 78, 2 on ICU 77), so the same build would render `Rp 1.000` or
  // `Rp 1.000,00` depending on the host Node. Pinning makes it deterministic —
  // 0 for IDR (no circulating subunit); a USD fork changes both this and
  // `CURRENCY` in `locale.ts`, so cents are never silently dropped.
  minimumFractionDigits: CURRENCY_FRACTION_DIGITS,
  maximumFractionDigits: CURRENCY_FRACTION_DIGITS,
})

/**
 * Format a rupiah amount for display, e.g. `1234567` -> `Rp 1.234.567`.
 *
 * Takes a plain `number` only. A string or `Date` reaching a money formatter is
 * a bug at the call site, not something to coerce here. Callers decide what an
 * absent amount looks like — this never renders a placeholder.
 */
export function formatRupiah(amount: number): string {
  return rupiahFormatter.format(amount)
}
