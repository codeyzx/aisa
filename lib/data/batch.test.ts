import { describe, expect, it } from 'vitest'

import { chunk, FIRESTORE_BATCH_LIMIT } from './batch'

describe('FIRESTORE_BATCH_LIMIT', () => {
  it('never exceeds the cap Firestore actually enforces', () => {
    // The reason this file exists. A constant sitting in asset.repo.ts — behind
    // `server-only` and the credential boundary, reachable only through the
    // runner's scaffolding — lets a raise to 5000 pass typecheck, lint and every
    // test, then fail at runtime, mid-delete, after earlier chunks have already
    // committed.
    //
    // It is not a preference. 500 is Firestore's documented hard cap on writes
    // per WriteBatch; over it, commit() throws.
    expect(FIRESTORE_BATCH_LIMIT).toBeLessThanOrEqual(500)
    expect(FIRESTORE_BATCH_LIMIT).toBeGreaterThan(0)
    expect(Number.isInteger(FIRESTORE_BATCH_LIMIT)).toBe(true)
  })
})

describe('chunk', () => {
  it('splits at the boundary without dropping or duplicating', () => {
    // The off-by-one this function exists to make testable: a `<=` where `<`
    // belongs loses the last element of every run, which on a delete reads as
    // "some rows just would not go away" rather than as an error.
    const ids = Array.from({ length: 7 }, (_, i) => `id-${i}`)

    expect(chunk(ids, 3)).toEqual([
      ['id-0', 'id-1', 'id-2'],
      ['id-3', 'id-4', 'id-5'],
      ['id-6'],
    ])
    expect(chunk(ids, 3).flat()).toEqual(ids)
  })

  it('yields one whole chunk at an exact multiple, not a trailing empty one', () => {
    // An empty trailing chunk would commit an empty batch — a round-trip that
    // asks Firestore to do nothing.
    expect(chunk(['a', 'b'], 2)).toEqual([['a', 'b']])
  })

  it('yields nothing for nothing', () => {
    expect(chunk([], FIRESTORE_BATCH_LIMIT)).toEqual([])
  })

  it('refuses a size that could never terminate', () => {
    // `size < 1` loops forever rather than misbehaving visibly — reject it at
    // the boundary rather than hanging the request.
    expect(() => chunk(['a'], 0)).toThrow(RangeError)
    expect(() => chunk(['a'], -1)).toThrow(RangeError)
  })

  it('refuses a NaN or fractional size instead of dropping the operation', () => {
    // The subtle one a bare `size < 1` misses: `NaN < 1` is `false`, so NaN
    // slips through and `start += NaN` never advances — the loop returns `[]`,
    // no chunks, no throw, and on a delete the whole batch is silently dropped.
    // A fractional step slices at non-integer offsets, which is equally nonsense
    // for a write count. Reject both at the boundary.
    expect(() => chunk(['a'], Number.NaN)).toThrow(RangeError)
    expect(() => chunk(['a'], 2.5)).toThrow(RangeError)
    expect(() => chunk(['a'], Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('chunks a real over-cap selection into commitable runs', () => {
    // Reachable: page size tops out at 100 and selection accumulates across
    // pages, so six pages of ticking clears the cap.
    const ids = Array.from({ length: 601 }, (_, i) => `id-${i}`)
    const chunks = chunk(ids, FIRESTORE_BATCH_LIMIT)

    expect(chunks).toHaveLength(2)
    expect(chunks.every((c) => c.length <= FIRESTORE_BATCH_LIMIT)).toBe(true)
    expect(chunks.flat()).toHaveLength(601)
  })
})
