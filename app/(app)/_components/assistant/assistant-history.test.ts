// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  MAX_CONVERSATIONS,
  cleanTitle,
  deriveTitle,
  describeTime,
  groupByDate,
  groupLabel,
  historyKey,
  loadHistory,
  matchesQuery,
  parseHistory,
  prune,
  saveHistory,
  startedBeforeToday,
  type Conversation,
} from './assistant-history'

/** 22 Oct 2026 10.00 WIB. */
const NOW = Date.parse('2026-10-22T03:00:00Z')
const HOUR = 3_600_000

function conv(id: string, updatedAt: number, text = 'Halo'): Conversation {
  return {
    id,
    title: deriveTitle(text),
    createdAt: updatedAt,
    updatedAt,
    messages: [{ id: `${id}:q`, role: 'user', content: text }],
  }
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('deriveTitle', () => {
  it('keeps a short question on one line', () => {
    expect(deriveTitle('  Fintech yang\n  sangat layak  ')).toBe(
      'Fintech yang sangat layak',
    )
  })

  it('cuts a long question at a word and marks the cut', () => {
    const title = deriveTitle(
      'Bandingkan Tani Maju dan Kopi Kita dari sisi tim, traksi, dan dana yang diminta',
    )
    expect(title.length).toBeLessThanOrEqual(48)
    expect(title).toBe('Bandingkan Tani Maju dan Kopi Kita dari sisi…')
  })

  it('rejects a rename that leaves nothing', () => {
    expect(cleanTitle('   ')).toBeNull()
    expect(cleanTitle(' Rapat  Senin ')).toBe('Rapat Senin')
  })
})

describe('grouping in WIB', () => {
  it('reads the date in Jakarta, not UTC', () => {
    // 21 Oct 17.30 UTC is already 22 Oct 00.30 WIB: today, not yesterday.
    expect(groupLabel(Date.parse('2026-10-21T17:30:00Z'), NOW)).toBe('Hari ini')
    // 21 Oct 16.59 UTC is 21 Oct 23.59 WIB.
    expect(groupLabel(Date.parse('2026-10-21T16:59:00Z'), NOW)).toBe('Kemarin')
  })

  it('buckets by age, then by month', () => {
    const day = 24 * HOUR
    expect(groupLabel(NOW - 3 * day, NOW)).toBe('7 hari terakhir')
    expect(groupLabel(NOW - 7 * day, NOW)).toBe('7 hari terakhir')
    expect(groupLabel(NOW - 8 * day, NOW)).toBe('30 hari terakhir')
    expect(groupLabel(NOW - 30 * day, NOW)).toBe('30 hari terakhir')
    expect(groupLabel(Date.parse('2026-08-10T03:00:00Z'), NOW)).toBe(
      'Agustus 2026',
    )
  })

  it('lists groups and their items newest first', () => {
    const groups = groupByDate(
      [conv('a', NOW - 40 * 24 * HOUR), conv('b', NOW - HOUR), conv('c', NOW)],
      NOW,
    )
    expect(groups.map((g) => g.label)).toEqual(['Hari ini', 'September 2026'])
    expect(groups[0].conversations.map((c) => c.id)).toEqual(['c', 'b'])
  })

  it('knows a conversation begun yesterday', () => {
    expect(startedBeforeToday(conv('a', NOW - 24 * HOUR), NOW)).toBe(true)
    expect(startedBeforeToday(conv('a', NOW - HOUR), NOW)).toBe(false)
  })

  it('describes the time relative to now', () => {
    expect(describeTime(NOW - 3 * HOUR, NOW)).toMatch(/^3 jam yang lalu · /)
  })
})

describe('search', () => {
  it('matches the title or any message, ignoring case', () => {
    const c = conv('a', NOW, 'Fintech yang sangat layak')
    c.messages.push({
      id: 'a:a',
      role: 'assistant',
      content: 'Ada *Kopi Kita*',
    })
    expect(matchesQuery(c, 'FINTECH')).toBe(true)
    expect(matchesQuery(c, 'kopi')).toBe(true)
    expect(matchesQuery(c, 'agritech')).toBe(false)
  })
})

describe('storage', () => {
  it('prunes to the newest MAX_CONVERSATIONS', () => {
    const many = Array.from({ length: MAX_CONVERSATIONS + 5 }, (_, i) =>
      conv(`c${i}`, NOW - i * HOUR),
    )
    const kept = prune(many)
    expect(kept).toHaveLength(MAX_CONVERSATIONS)
    expect(kept.at(-1)?.id).toBe(`c${MAX_CONVERSATIONS - 1}`)
  })

  it('drops malformed entries instead of failing the whole history', () => {
    const raw = JSON.stringify([conv('ok', NOW), { id: 'bad' }])
    expect(parseHistory(raw).map((c) => c.id)).toEqual(['ok'])
    expect(parseHistory('{not json')).toEqual([])
  })

  it('migrates the old sessionStorage conversation once, for its own uid', () => {
    sessionStorage.setItem(
      'aisa:tanya-aisa',
      JSON.stringify({
        uid: 'u1',
        conversationId: 'old',
        messages: [
          { id: 'x:q', role: 'user', content: 'Fintech yang sangat layak' },
          { id: 'x:a', role: 'assistant', content: 'Ada 2.' },
        ],
      }),
    )
    expect(loadHistory('u2', NOW).list).toEqual([])

    const first = loadHistory('u1', NOW)
    expect(first.migratedId).toBe('old')
    expect(first.list[0]).toMatchObject({
      id: 'old',
      title: 'Fintech yang sangat layak',
    })
    expect(sessionStorage.getItem('aisa:tanya-aisa')).toBeNull()
    expect(parseHistory(localStorage.getItem(historyKey('u1')))).toHaveLength(1)

    const again = loadHistory('u1', NOW)
    expect(again.migratedId).toBeNull()
    expect(again.list).toHaveLength(1)
  })

  it('keeps one user out of another user’s history', () => {
    saveHistory('u1', [conv('a', NOW)])
    expect(loadHistory('u2', NOW).list).toEqual([])
    expect(loadHistory('u1', NOW).list.map((c) => c.id)).toEqual(['a'])
  })
})
