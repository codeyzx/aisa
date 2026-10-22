import { describe, expect, it } from 'vitest'

import { greeting, nextDigest, routeHeading } from './shell-routes'

// Instants are UTC; WIB is UTC+7.
const wib = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00+07:00`)

describe('routeHeading', () => {
  it('counts pending proposals in the Proposal subtitle', () => {
    expect(routeHeading('/proposal', 4)).toEqual({
      title: 'Proposal',
      subtitle: '4 menunggu keputusan Anda',
      greets: false,
    })
  })

  it('names a proposal detail page as such', () => {
    expect(routeHeading('/proposal/abc', 4).subtitle).toBe('Detail proposal')
  })

  it('greets only on the Dashboard', () => {
    expect(routeHeading('/dashboard', 0).greets).toBe(true)
    expect(routeHeading('/aturan', 0).title).toBe('Aturan penilaian')
  })

  it('titles the Biaya AI page', () => {
    expect(routeHeading('/biaya', 0)).toEqual({
      title: 'Biaya AI',
      subtitle: 'Berapa biaya AI dan berapa yang dihemat dibanding cek manual',
      greets: false,
    })
  })

  it('does not claim a prefix-sharing path', () => {
    expect(routeHeading('/proposal-arsip', 0).title).toBe('AISA')
  })
})

// 2026-10-21 is a Wednesday, 2026-10-23 a Friday, 2026-10-24 a Saturday.
const at = (day: string, hhmm: string) =>
  nextDigest(new Date(`2026-10-${day}T${hhmm}:00+07:00`)).label

describe('nextDigest', () => {
  it('sends 09.00 every day and 17.00 only on Fridays, in WIB', () => {
    expect(at('21', '08:59')).toBe('09.00')
    expect(at('21', '09:00')).toBe('Besok 09.00')
    expect(at('21', '10:00')).toBe('Besok 09.00')
    expect(at('21', '17:30')).toBe('Besok 09.00')
    expect(at('23', '08:00')).toBe('09.00')
    expect(at('23', '10:00')).toBe('17.00 (mingguan)')
    expect(at('23', '16:59')).toBe('17.00 (mingguan)')
    expect(at('23', '18:00')).toBe('Besok 09.00')
    expect(at('24', '10:00')).toBe('Besok 09.00')
  })

  it('reads the WIB weekday, not the host one', () => {
    // Thursday 23:30 UTC is already Friday 06:30 WIB, and Friday 11:00 UTC is
    // Friday 18:00 WIB.
    expect(nextDigest(new Date('2026-10-22T23:30:00Z')).label).toBe('09.00')
    expect(nextDigest(new Date('2026-10-23T03:00:00Z'))).toEqual({
      slot: '17.00',
      period: 'mingguan',
      tomorrow: false,
      label: '17.00 (mingguan)',
    })
    expect(nextDigest(new Date('2026-10-23T11:00:00Z')).label).toBe(
      'Besok 09.00',
    )
  })
})

describe('greeting', () => {
  it('uses the WIB part of day and date', () => {
    expect(greeting(wib('08:00'))).toBe('Selamat pagi, Pak · Rabu, 21 Oktober')
    expect(greeting(wib('13:00'))).toMatch(/^Selamat siang/)
    expect(greeting(wib('16:00'))).toMatch(/^Selamat sore/)
  })
})
