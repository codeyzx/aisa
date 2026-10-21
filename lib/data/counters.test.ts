import { describe, expect, it } from 'vitest'

import { formatCode } from './counters'

describe('formatCode', () => {
  it('zero-pads to the counter’s width', () => {
    expect(formatCode('INV-', 4, 1)).toBe('INV-0001')
    expect(formatCode('INV-', 4, 42)).toBe('INV-0042')
    expect(formatCode('INV-', 4, 9999)).toBe('INV-9999')
  })

  it('GROWS past the width rather than truncating and colliding', () => {
    // The load-bearing case. Truncating to fit would make INV-10000 render as
    // INV-0000 — a duplicate of a code minted 10000 mints ago, in a sequence
    // whose entire purpose is uniqueness. A longer code sorts oddly in a
    // spreadsheet; a duplicate code is a corrupt ledger. Width is padding, not
    // a maximum, and this test pins that.
    expect(formatCode('INV-', 4, 10_000)).toBe('INV-10000')
    expect(formatCode('INV-', 4, 123_456)).toBe('INV-123456')
  })

  it('handles the first mint and a width of 1', () => {
    expect(formatCode('INV-', 4, 0)).toBe('INV-0000')
    expect(formatCode('X', 1, 7)).toBe('X7')
  })

  it('supports an empty prefix — the prefix is not required to exist', () => {
    expect(formatCode('', 5, 12)).toBe('00012')
  })

  it('refuses a nonsense value at the boundary instead of rendering nonsense', () => {
    // Rejecting loudly beats formatCode('INV-', 4, -1) quietly yielding "INV--1"
    // or a fractional mint yielding "INV-1.5" — both of which would be written
    // to a document and discovered by a human reading an invoice.
    expect(() => formatCode('INV-', 4, -1)).toThrow(RangeError)
    expect(() => formatCode('INV-', 4, 1.5)).toThrow(RangeError)
    expect(() => formatCode('INV-', 0, 1)).toThrow(RangeError)
    expect(() => formatCode('INV-', 1.5, 1)).toThrow(RangeError)
  })
})
