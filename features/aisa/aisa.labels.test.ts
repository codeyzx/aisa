import { describe, expect, it } from 'vitest'

import { historyDetailText, sectorLabel } from './aisa.labels'

describe('sectorLabel', () => {
  it('capitalises the first letter and the letter after & or /', () => {
    expect(sectorLabel('f&b')).toBe('F&B')
    expect(sectorLabel('F&B')).toBe('F&B')
    expect(sectorLabel('agritech')).toBe('Agritech')
    expect(sectorLabel('health / wellness')).toBe('Health / Wellness')
  })
})

describe('historyDetailText', () => {
  it('rewrites the raw intake shape into display words', () => {
    expect(
      historyDetailText(
        'Proposal Kopi Teras Senja masuk: skor 63.1, tidak_cocok',
      ),
    ).toBe('Proposal Kopi Teras Senja masuk: skor 63,1, Tidak cocok')
    expect(historyDetailText('Proposal A masuk: skor 80, sangat_cocok')).toBe(
      'Proposal A masuk: skor 80,0, Sangat cocok',
    )
  })

  it('leaves every other text unchanged', () => {
    for (const text of [
      'Proposal A masuk: skor 63,1, Tidak cocok',
      'Proposal A masuk: skor 63,1, Tidak cocok, berkualitas di luar fokus',
      'Proposal A masuk: perlu dicek manual (teks terlalu sedikit)',
      'Undang semua cocok: 2 proposal (A, B)',
    ])
      expect(historyDetailText(text)).toBe(text)
  })
})
