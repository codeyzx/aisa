import { describe, expect, it } from 'vitest'

import { formatNumber, formatPercent, formatScore } from './number'

/**
 * Pins the count/total format to `id-ID`: the thousands separator is a DOT, so a
 * host-locale (en-US) fallback grouping with commas goes red here. This is the
 * separator a reader would misread — `1.234` is one thousand-two-hundred in
 * Indonesia, not `1.234` the decimal.
 */
describe('formatNumber', () => {
  it('groups thousands with dots (id-ID)', () => {
    expect(formatNumber(1234567)).toBe('1.234.567')
    expect(formatNumber(1234)).toBe('1.234')
  })

  it('leaves small numbers ungrouped', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(87)).toBe('87')
  })
})

/**
 * Scores and percentages use the id-ID decimal COMMA, matching the WhatsApp texts
 * — a dot here would read as a thousands separator to an Indonesian reader.
 */
describe('formatScore / formatPercent', () => {
  it('writes a score with one comma decimal', () => {
    expect(formatScore(92.5)).toBe('92,5')
    expect(formatScore(50)).toBe('50,0')
  })

  it('writes a percentage with up to two comma decimals', () => {
    expect(formatPercent(27.5)).toBe('27,5%')
    expect(formatPercent(102.5)).toBe('102,5%')
    expect(formatPercent(30)).toBe('30%')
    expect(formatPercent(0.275 * 100)).toBe('27,5%')
  })
})
