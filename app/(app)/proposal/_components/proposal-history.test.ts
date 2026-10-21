import { describe, expect, it } from 'vitest'

import type { History, Proposal } from '@/features/aisa/aisa.schema'

import { proposalHistoryEntries } from './proposal-history'

const row = (fields: Partial<History>): History => ({
  id: 'h',
  at: new Date('2026-10-21T02:00:00Z'),
  via: 'sistem',
  action: 'proposal_masuk',
  proposalId: 'p1',
  detail: 'Proposal Tani masuk: skor 63.1, tidak_cocok',
  ...fields,
})
const response = (
  at: string,
  fields: Partial<NonNullable<Proposal['response']>> = {},
): Proposal['response'] => ({
  kind: 'arsipkan',
  at: new Date(at),
  via: 'wa',
  ...fields,
})

describe('proposalHistoryEntries', () => {
  it('shows the rows with display words', () => {
    const [entry] = proposalHistoryEntries([row({})], null)
    expect(entry).toMatchObject({
      title: 'Proposal masuk',
      detail: 'Proposal Tani masuk: skor 63,1, Tidak cocok',
    })
  })

  it('adds a response no proposal-scoped row explains as a tanggapan massal', () => {
    const entries = proposalHistoryEntries(
      [row({})],
      response('2026-10-22T02:00:00Z'),
    )
    expect(entries.map((e) => e.title)).toEqual([
      'Tanggapan massal',
      'Proposal masuk',
    ])
    expect(entries[0]).toMatchObject({
      detail: 'Diarsipkan lewat tanggapan massal',
      via: 'wa',
      reason: null,
    })
  })

  it('adds nothing when a tanggapan row was written at or after the response', () => {
    const at = '2026-10-22T02:00:00Z'
    const entries = proposalHistoryEntries(
      [
        row({
          id: 't',
          action: 'tanggapan',
          at: new Date(at),
          detail: 'Arsipkan Tani',
        }),
        row({}),
      ],
      response(at),
    )
    expect(entries).toHaveLength(2)
  })

  it('still adds the response when the only tanggapan row is older than it', () => {
    const entries = proposalHistoryEntries(
      [
        row({
          id: 't',
          action: 'tanggapan',
          at: new Date('2026-10-21T03:00:00Z'),
        }),
      ],
      response('2026-10-22T02:00:00Z', { kind: 'undang', note: ' Hubungi ' }),
    )
    expect(entries[0]).toMatchObject({
      title: 'Tanggapan massal',
      detail: 'Diundang lewat tanggapan massal',
      reason: 'Hubungi',
    })
  })
})
