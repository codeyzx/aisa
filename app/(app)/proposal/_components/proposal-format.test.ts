import { describe, expect, it } from 'vitest'

import { clockTime, elapsedText, timeRange } from './proposal-format'

// 03:56:40 UTC is 10.56.40 WIB (UTC+7).
const start = new Date('2026-10-22T03:56:40Z')
const plus = (ms: number) => new Date(start.getTime() + ms)

describe('elapsedText', () => {
  it.each([
    [0, '+0 dtk'],
    [999, '+0 dtk'],
    [12_000, '+12 dtk'],
    [59_999, '+59 dtk'],
    [60_000, '+1 mnt 00 dtk'],
    [65_000, '+1 mnt 05 dtk'],
    [3_599_000, '+59 mnt 59 dtk'],
    [3_600_000, '+1 jam 00 mnt'],
    [3_725_000, '+1 jam 02 mnt'],
  ])('%i ms reads %s', (ms, text) => {
    expect(elapsedText(ms)).toBe(text)
  })

  it('never reads negative for a step logged before the job start', () => {
    expect(elapsedText(-400)).toBe('+0 dtk')
  })
})

describe('timeRange', () => {
  it('names the WIB day and the range to the minute', () => {
    expect(timeRange(start, plus(95_000))).toBe(
      'Kamis, 22 Okt 2026 · 10.56–10.58 WIB',
    )
  })

  it('reads one time when it started and ended in the same minute', () => {
    expect(timeRange(start, plus(10_000))).toBe(
      'Kamis, 22 Okt 2026 · 10.56 WIB',
    )
  })

  it('marks a running assessment as open-ended', () => {
    expect(timeRange(start, null)).toBe('Kamis, 22 Okt 2026 · 10.56–… WIB')
  })

  it('uses the WIB day, not the UTC one', () => {
    // 17:30 UTC on the 21st is already 00.30 on the 22nd in WIB.
    const lateUtc = new Date('2026-10-21T17:30:00Z')
    expect(timeRange(lateUtc, new Date('2026-10-21T17:31:00Z'))).toBe(
      'Kamis, 22 Okt 2026 · 00.30–00.31 WIB',
    )
  })

  it('names the end day when it ran past WIB midnight', () => {
    expect(
      timeRange(
        new Date('2026-10-22T16:58:00Z'),
        new Date('2026-10-22T17:02:00Z'),
      ),
    ).toBe('Kamis, 22 Okt 2026 · 23.58 – Jumat, 23 Okt 2026 · 00.02 WIB')
  })
})

describe('clockTime', () => {
  it('is the exact WIB clock time with seconds', () => {
    expect(clockTime(start)).toBe('10.56.40 WIB')
  })
})
