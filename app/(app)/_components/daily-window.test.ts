import { describe, expect, it } from 'vitest'

import { fromFirstValue, trimLeadingEmpty } from './daily-window'

const isZero = (n: number) => n === 0

describe('trimLeadingEmpty', () => {
  it('drops the empty days before the first value', () => {
    expect(trimLeadingEmpty([0, 0, 3, 1], isZero)).toEqual([3, 1])
  })

  it('keeps a quiet day after the first value', () => {
    expect(trimLeadingEmpty([0, 2, 0, 4, 0], isZero)).toEqual([2, 0, 4, 0])
  })

  it('returns nothing when no day has a value', () => {
    expect(trimLeadingEmpty([0, 0, 0], isZero)).toEqual([])
    expect(trimLeadingEmpty([], isZero)).toEqual([])
  })

  it('leaves a series that starts with a value unchanged', () => {
    expect(trimLeadingEmpty([5, 0, 1], isZero)).toEqual([5, 0, 1])
  })
})

describe('fromFirstValue', () => {
  it('trims like trimLeadingEmpty when a day has a value', () => {
    expect(fromFirstValue([0, 0, 2, 0], isZero)).toEqual([2, 0])
  })

  it('keeps the whole window when no day has a value', () => {
    expect(fromFirstValue([0, 0, 0], isZero)).toEqual([0, 0, 0])
  })
})
