import { describe, expect, it } from 'vitest'

import { formatDate, formatTime } from './date'

/**
 * These tests exist to make the timezone pin FALSIFIABLE.
 *
 * Every instant below is chosen to fall on a different calendar day in UTC than
 * in WIB (UTC+7) — that is the entire point. Delete `timeZone` from either
 * formatter and these go red, because vitest runs under TZ=UTC (see
 * vitest.config.ts) and the formatters would follow the host instead.
 *
 * Without the day-boundary instants, or run from a WIB machine, the suite would
 * pass either way and prove nothing — which is exactly what it looked like
 * before: `/assets` rendered `7/16/2026` in production while every check was
 * green.
 */
describe('formatDate', () => {
  it('reads the instant in WIB, not the host zone', () => {
    // 23:30Z on the 16th is already 06:30 on the 17th in Jakarta. A host-zone
    // formatter under UTC says the 16th — the wrong DAY, which is the bug.
    expect(formatDate(new Date('2026-07-16T23:30:00Z'))).toBe('17 Jul 2026')
  })

  it('holds across a year boundary', () => {
    // The same drift, at the point where it is most visible to a reader.
    expect(formatDate(new Date('2026-12-31T20:00:00Z'))).toBe('01 Jan 2027')
  })

  it('formats in id-ID order, not the host locale', () => {
    // `16 Jul` — not `Jul 16` (en-US) and not `7/16/2026`, the literal string
    // the unpinned formatter produced.
    expect(formatDate(new Date('2026-07-16T03:00:00Z'))).toBe('16 Jul 2026')
  })

  it('spells the month in Indonesian, not English', () => {
    // The falsifiability the `Jul` case cannot give: `Jul`/`Jan`/`Feb`/`Sep`/
    // `Nov` are byte-identical in `id-ID` and `en-US`, so a locale that silently
    // fell back to the host would still pass them. These five months DIVERGE —
    // `Agu`≠`Aug`, `Mei`≠`May`, `Okt`≠`Oct`, `Des`≠`Dec` — so they only pass
    // when the formatter is genuinely Indonesian.
    expect(formatDate(new Date('2026-08-15T03:00:00Z'))).toBe('15 Agu 2026')
    expect(formatDate(new Date('2026-05-03T03:00:00Z'))).toBe('03 Mei 2026')
    expect(formatDate(new Date('2026-10-20T03:00:00Z'))).toBe('20 Okt 2026')
    expect(formatDate(new Date('2026-12-09T03:00:00Z'))).toBe('09 Des 2026')
  })
})

describe('formatTime', () => {
  it('reads the instant in WIB, not the host zone', () => {
    // 23:30Z → 06.30 WIB. Under UTC an unpinned formatter says 23.30.
    expect(formatTime(new Date('2026-07-16T23:30:00Z'))).toBe('06.30')
  })

  it('is 24-hour, so midday and midnight cannot collide', () => {
    // 17:00Z → 00.00 WIB the next day. A 12-hour formatter renders this and
    // noon identically once the am/pm marker is dropped.
    expect(formatTime(new Date('2026-07-16T17:00:00Z'))).toBe('00.00')
    expect(formatTime(new Date('2026-07-16T05:00:00Z'))).toBe('12.00')
  })
})
