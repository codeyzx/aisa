import { describe, expect, it } from 'vitest'

import { greeting, nextDigestSlot, routeHeading } from './shell-routes'

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

describe('nextDigestSlot', () => {
  it('names the slot the scheduler sends next, in WIB', () => {
    expect(nextDigestSlot(wib('08:59'))).toBe('09.00')
    expect(nextDigestSlot(wib('09:00'))).toBe('17.00')
    expect(nextDigestSlot(wib('16:59'))).toBe('17.00')
    expect(nextDigestSlot(wib('17:00'))).toBe('09.00')
  })
})

describe('greeting', () => {
  it('uses the WIB part of day and date', () => {
    expect(greeting(wib('08:00'))).toBe('Selamat pagi, Pak · Rabu, 21 Oktober')
    expect(greeting(wib('13:00'))).toMatch(/^Selamat siang/)
    expect(greeting(wib('16:00'))).toMatch(/^Selamat sore/)
  })
})
