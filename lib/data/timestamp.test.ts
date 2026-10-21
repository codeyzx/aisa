import { describe, expect, it } from 'vitest'

import { TimestampSchema } from './timestamp'

/**
 * The copy-in codec for a Firestore Timestamp. The output is always a real
 * `Date`; the risk is a bad `{ seconds, nanoseconds }` slipping through as a
 * plausible-but-wrong or `Invalid Date`, which then travels as if it were a
 * real timestamp on an entity. Every rejecting case below names what a caller
 * loses if its guard is removed.
 */
describe('TimestampSchema', () => {
  it('hydrates a Firestore-style value via toDate()', () => {
    const when = new Date('2026-07-17T00:00:00.000Z')
    expect(TimestampSchema.parse({ toDate: () => when })).toEqual(when)
  })

  it('passes an already-hydrated Date through untouched', () => {
    const when = new Date('2026-07-17T00:00:00.000Z')
    expect(TimestampSchema.parse(when)).toEqual(when)
  })

  it('rebuilds a Date from a plain { seconds, nanoseconds } value', () => {
    // 1_500 seconds + half a second of nanos = 1_500_500 ms.
    expect(
      TimestampSchema.parse({ seconds: 1_500, nanoseconds: 500_000_000 }),
    ).toEqual(new Date(1_500_500))
  })

  it('rejects fractional seconds or nanoseconds', () => {
    // A timestamp is not a fraction of a nanosecond. Mutation that reddens this:
    // dropping `.int()` — `seconds: 1.5` would then build a real-looking Date.
    expect(
      TimestampSchema.safeParse({ seconds: 1.5, nanoseconds: 0 }).success,
    ).toBe(false)
    expect(
      TimestampSchema.safeParse({ seconds: 0, nanoseconds: 1.5 }).success,
    ).toBe(false)
  })

  it('rejects nanoseconds outside [0, 1e9) rather than silently normalizing', () => {
    // THE quiet one: `nanoseconds: 2e9` is not an error to arithmetic — it folds
    // into +2000ms and yields a plausible, wrong Date. Mutation that reddens
    // this: dropping the `.min(0).max(999_999_999)` bound.
    expect(
      TimestampSchema.safeParse({ seconds: 0, nanoseconds: 2_000_000_000 })
        .success,
    ).toBe(false)
    expect(
      TimestampSchema.safeParse({ seconds: 0, nanoseconds: -1 }).success,
    ).toBe(false)
  })

  it('rejects seconds that overflow the representable Date range', () => {
    // A legal integer can still overflow `new Date()` to `Invalid Date`, which
    // must not travel as a real timestamp. Mutation that reddens this: dropping
    // the `.refine(!isNaN)` check on the resulting Date.
    const result = TimestampSchema.safeParse({
      seconds: 1e17,
      nanoseconds: 0,
    })
    expect(result.success).toBe(false)
  })

  it('throws on parse (not just safeParse) so a bad value cannot pass silently', () => {
    // `.parse()` is how entity schemas consume this — a bad timestamp must be a
    // loud throw at the boundary, not a null that reads as absent.
    expect(() =>
      TimestampSchema.parse({ seconds: 0, nanoseconds: 2_000_000_000 }),
    ).toThrow()
  })
})
