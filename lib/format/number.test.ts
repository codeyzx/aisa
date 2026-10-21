import { describe, expect, it } from 'vitest'

import { formatNumber } from './number'

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
