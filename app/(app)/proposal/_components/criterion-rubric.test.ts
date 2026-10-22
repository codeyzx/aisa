import { describe, expect, it } from 'vitest'

import { rubricFor } from './criterion-rubric'

const five = {
  '1': 'Tidak ada bukti',
  '2': 'Bukti tipis',
  '3': 'Bukti sebagian',
  '4': 'Bukti kuat',
  '5': 'Bukti lengkap',
}

describe('rubricFor', () => {
  it('reads the anchor for the exact value and the next level up', () => {
    expect(rubricFor(five, 3)).toEqual({
      current: { level: 3, text: 'Bukti sebagian' },
      next: { level: 4, text: 'Bukti kuat' },
    })
  })

  it('has no next level at the top of the scale', () => {
    expect(rubricFor(five, 5).next).toBeNull()
  })

  it('skips a missing or blank level up to the nearest written one', () => {
    const old = {
      '1': 'Tidak ada bukti',
      '3': 'Bukti sebagian',
      '5': 'Bukti lengkap',
    }
    expect(rubricFor(old, 2)).toEqual({
      current: null,
      next: { level: 3, text: 'Bukti sebagian' },
    })
    expect(rubricFor({ ...five, '4': '  ' }, 3).next).toEqual({
      level: 5,
      text: 'Bukti lengkap',
    })
  })

  it('returns nothing when the rules carry no anchors', () => {
    expect(rubricFor(undefined, 3)).toEqual({ current: null, next: null })
    expect(rubricFor({}, 3)).toEqual({ current: null, next: null })
  })
})
