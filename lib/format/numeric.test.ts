import { describe, expect, it } from 'vitest'

import {
  isNumericBlank,
  numericSeparators,
  resolveNumericChange,
} from './numeric'

describe('resolveNumericChange', () => {
  it('holds on a cleared / non-finite field', () => {
    expect(resolveNumericChange(undefined)).toEqual({ kind: 'hold' })
    expect(resolveNumericChange(Number.NaN)).toEqual({ kind: 'hold' })
  })

  it('emits a finite in-bounds value unchanged', () => {
    expect(resolveNumericChange(1500)).toEqual({ kind: 'emit', value: 1500 })
    expect(resolveNumericChange(0, { min: 0 })).toEqual({
      kind: 'emit',
      value: 0,
    })
  })

  it('passes a decimal value through unclamped', () => {
    expect(resolveNumericChange(1.5)).toEqual({ kind: 'emit', value: 1.5 })
  })

  it('clamps above max and below min', () => {
    expect(resolveNumericChange(120, { min: 0, max: 100 })).toEqual({
      kind: 'emit',
      value: 100,
    })
    expect(resolveNumericChange(-5, { min: 0, max: 100 })).toEqual({
      kind: 'emit',
      value: 0,
    })
  })
})

describe('isNumericBlank', () => {
  it('treats a cleared field as blank whatever its stale value', () => {
    // The core fix: a cleared field posts nothing, not the previous number.
    expect(isNumericBlank(1500, true)).toBe(true)
  })

  it('treats a missing value as blank', () => {
    expect(isNumericBlank(null, false)).toBe(true)
    expect(isNumericBlank(undefined, false)).toBe(true)
  })

  it('is not blank for a present, uncleared value — including explicit zero', () => {
    expect(isNumericBlank(1500, false)).toBe(false)
    expect(isNumericBlank(0, false)).toBe(false)
  })
})

describe('numericSeparators', () => {
  it('derives Indonesian grouping/decimal from the default locale', () => {
    expect(numericSeparators('id-ID')).toEqual({ group: '.', decimal: ',' })
  })

  it('follows a repointed locale — the fork knob, not hardcoded punctuation', () => {
    expect(numericSeparators('en-US')).toEqual({ group: ',', decimal: '.' })
  })
})
