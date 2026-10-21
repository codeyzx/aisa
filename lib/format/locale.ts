/**
 * The fork knobs for localised output. A non-Indonesian fork changes these —
 * HTML language, locale, timezone, currency — and every `lib/format/*` formatter
 * (and the root `<html lang>`) follows; nothing else spells them.
 *
 * `LOCALE` and `TIME_ZONE` are pinned rather than left to the runtime: an `Intl`
 * formatter with no `timeZone` uses the HOST timezone, so the same `Date` would
 * render as one time on the server (UTC on most hosts) and another in the
 * browser — a hydration mismatch, and wrong for a user in WIB either way.
 * Pinning makes server and client render identically.
 */

/**
 * The BCP 47 language tag stamped on the root `<html lang>` (and on
 * `app/global-error.tsx`, which replaces the root layout on a crash and so
 * carries its own `<html>`). This is the DEFAULT PRODUCT LANGUAGE — Bahasa
 * Indonesia — and it is the one place both documents read it, so they cannot
 * disagree. It is the language subtag of `LOCALE` (`id-ID` → `id`) kept as its
 * own constant because a document's language and a formatter's locale are
 * different questions: `lang` is `id`, region-free, because the region only
 * matters for number/date formatting, which is `LOCALE`'s job.
 */
export const HTML_LANG = 'id'

export const LOCALE = 'id-ID'

/** WIB. Fixed offset (UTC+7), no DST. */
export const TIME_ZONE = 'Asia/Jakarta'

/**
 * ISO 4217 code the money formatter renders.
 */
export const CURRENCY = 'IDR'

/**
 * Minor-unit digits `formatRupiah` renders — PINNED, not derived from the
 * currency's CLDR default, for the same reason `TIME_ZONE` is pinned: the
 * default DRIFTS across ICU versions. IDR resolves to 0 fraction digits on
 * ICU 78 but 2 on ICU 77, so leaving it to `Intl` renders `Rp 1.000` on one host
 * and `Rp 1.000,00` on another off the SAME build (measured on a contributor
 * machine whose Node shipped ICU 77, against a container on ICU 78 — the two
 * disagreed on identical code). IDR has no circulating subunit, so 0 is the
 * product's answer; a USD
 * fork changes `CURRENCY` to `'USD'` and this to `2` in the same edit.
 */
export const CURRENCY_FRACTION_DIGITS = 0
