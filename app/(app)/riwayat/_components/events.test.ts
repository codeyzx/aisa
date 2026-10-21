import { describe, expect, it } from 'vitest'

import type { Digest, History, Proposal } from '@/features/aisa/aisa.schema'

import { csvCell } from './csv'
import { toEvents } from './events'

const at = new Date('2026-10-21T02:00:00Z')
const row = (fields: Partial<History>): History => ({
  id: 'h',
  at,
  via: 'sistem',
  action: 'proposal_masuk',
  detail: 'x',
  ...fields,
})

describe('toEvents', () => {
  it('reads an intake with a kategori as a penilaian by AISA', () => {
    const [e] = toEvents(
      [row({ after: 'cocok', proposalId: 'p1', proposalName: 'Tani' })],
      [],
      [],
    )
    expect(e).toMatchObject({
      kind: 'penilaian',
      actor: 'ai',
      categoryTo: 'cocok',
    })
    expect(e!.proposal).toMatchObject({ name: 'Tani', linkable: true })
  })

  it('reads an intake without a kategori as proposal masuk, flagged manual', () => {
    const [e] = toEvents(
      [row({ after: 'perlu_dicek_manual', proposalId: 'p1' })],
      [],
      [],
    )
    expect(e).toMatchObject({ kind: 'masuk', manual: true })
  })

  it('falls back to the proposal when the row carries no outcome', () => {
    const p = {
      id: 'p1',
      category: 'tidak_cocok',
      tokens: { in: 3, out: 2 },
      source: { kind: 'form' },
    } as unknown as Proposal
    const [e] = toEvents([row({ proposalId: 'p1' })], [p], [])
    expect(e).toMatchObject({
      kind: 'penilaian',
      categoryTo: 'tidak_cocok',
      tokens: 5,
    })
  })

  it('never links a deleted proposal', () => {
    const [e] = toEvents(
      [
        row({
          action: 'tanggapan',
          via: 'dashboard',
          after: 'undang',
          proposalId: 'p1',
          proposalName: '(dihapus)',
        }),
      ],
      [],
      [],
    )
    expect(e).toMatchObject({
      kind: 'keputusan',
      actor: 'manajer',
      decision: 'undang',
    })
    expect(e!.proposal!.linkable).toBe(false)
  })

  it('reads the rules version from a number or a { version } object', () => {
    const events = toEvents(
      [
        row({ action: 'aturan_diubah', after: 3 }),
        row({ id: 'b', action: 'aturan_diubah', after: { version: 1 } }),
      ],
      [],
      [],
    )
    expect(events.map((e) => e.rulesVersion)).toEqual([3, 1])
  })

  it('pairs a ringkasan row with the digest sent just before it', () => {
    const digest = {
      slot: '17.00',
      sentAt: new Date(at.getTime() - 400),
      counts: { belumDitanggapi: 4 },
      text: 'isi',
      usedTemplate: false,
    } as unknown as Digest
    const stale = {
      ...digest,
      slot: '09.00',
      sentAt: new Date(at.getTime() - 3_600_000),
    } as Digest
    const [e] = toEvents(
      [row({ action: 'ringkasan_terkirim' })],
      [],
      [stale, digest],
    )
    expect(e).toMatchObject({ kind: 'whatsapp', slot: '17.00' })
    expect(e!.digest!.text).toBe('isi')
  })

  it('keeps an action newer than this build as lainnya', () => {
    expect(toEvents([row({ action: 'baru_sekali' })], [], [])[0]!.kind).toBe(
      'lainnya',
    )
  })
})

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('plain')).toBe('plain')
  })
})
