import { describe, expect, it } from 'vitest'

import { formatRupiah, formatUsd } from './currency'

/**
 * These pin the money format to `id-ID` + `IDR`, the same way `date.test.ts`
 * pins the timezone: delete the `LOCALE`/`CURRENCY` from the formatter and these
 * go red, because a host-locale formatter would group with commas and print two
 * decimal places.
 *
 * `id-ID` emits a NON-BREAKING space (U+00A0) between `Rp` and the digits — a
 * real ICU behaviour, not an accident — so every assertion collapses whitespace
 * (`\s`, which matches U+00A0 in JS) to a plain space to stay legible. The
 * digits and separators are what matter.
 */
/** id-ID puts U+00A0 after `Rp`; `\s` matches it, so collapse to a plain space. */
const normalize = (value: number) => formatRupiah(value).replace(/\s+/g, ' ')

describe('formatRupiah', () => {
  it('groups thousands with dots, not commas (id-ID)', () => {
    // `1.234.567`, not `1,234,567` (en-US) — the one thing a reader misreads if
    // the locale silently falls back to the host.
    expect(normalize(1234567)).toBe('Rp 1.234.567')
  })

  it('renders no minor unit — IDR has no circulating subunit', () => {
    // `Rp 0`, never `Rp 0,00`: `Intl` derives the minor-unit digits from the
    // currency code, and IDR's CLDR default is 0.
    expect(normalize(0)).toBe('Rp 0')
    expect(normalize(1500)).toBe('Rp 1.500')
  })
})

describe('formatUsd', () => {
  it('uses id-ID separators with a dollar sign', () => {
    expect(formatUsd(1234.5)).toBe('$1.234,50')
    expect(formatUsd(1.5)).toBe('$1,50')
  })

  it('keeps up to four decimals below one dollar, so small costs stay visible', () => {
    expect(formatUsd(0.0148)).toBe('$0,0148')
    expect(formatUsd(0.8)).toBe('$0,80')
    expect(formatUsd(0)).toBe('$0,00')
  })
})
