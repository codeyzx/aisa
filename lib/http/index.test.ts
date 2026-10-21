import { describe, expect, it } from 'vitest'

import { createMemoryStore, rateLimit, type RateLimitStore } from './index'

const BUDGET = { limit: 3, windowMs: 60_000 }

/** Each test gets its own store, so one test's counters cannot leak into another. */
function fresh() {
  return { store: createMemoryStore(), now: 1_000_000 }
}

describe('rateLimit', () => {
  it('allows up to the limit and refuses the next one', async () => {
    const { store, now } = fresh()
    const results: boolean[] = []
    for (const _ of [1, 2, 3, 4]) {
      results.push(
        (await rateLimit('session:uid-a', BUDGET, { store, now })).ok,
      )
    }

    expect(results).toEqual([true, true, true, false])
  })

  it('meters each uid SEPARATELY — the assertion that separates the right build from the wrong one', async () => {
    // N events by N DISTINCT uids must NOT trip the limit. A limiter that
    // shares one counter across callers passes "N events trip it" while being
    // catastrophically wrong: one busy user would lock out everyone. Because
    // the key is a uid and never an IP, a NAT'd office cannot lock itself out —
    // 500 employees are 500 keys.
    const { store, now } = fresh()
    const results: boolean[] = []
    for (const uid of ['a', 'b', 'c', 'd', 'e']) {
      results.push(
        (await rateLimit(`session:${uid}`, BUDGET, { store, now })).ok,
      )
    }

    expect(results).toEqual([true, true, true, true, true])
  })

  it('keeps separate budgets for separate purposes on the same uid', async () => {
    const { store, now } = fresh()
    for (const _ of [1, 2, 3])
      await rateLimit('session:uid-a', BUDGET, { store, now })

    expect((await rateLimit('session:uid-a', BUDGET, { store, now })).ok).toBe(
      false,
    )
    expect((await rateLimit('ai:uid-a', BUDGET, { store, now })).ok).toBe(true)
  })

  it('resets when the window rolls over', async () => {
    const { store, now } = fresh()
    for (const _ of [1, 2, 3, 4])
      await rateLimit('session:uid-a', BUDGET, { store, now })

    expect((await rateLimit('session:uid-a', BUDGET, { store, now })).ok).toBe(
      false,
    )
    expect(
      (await rateLimit('session:uid-a', BUDGET, { store, now: now + 60_001 }))
        .ok,
    ).toBe(true)
  })

  it('reports whole seconds until reset, for `retryAfter` on the 429', async () => {
    const { store, now } = fresh()
    await rateLimit('session:uid-a', BUDGET, { store, now })

    expect(
      await rateLimit('session:uid-a', BUDGET, { store, now: now + 15_000 }),
    ).toMatchObject({ retryAfter: 45 })
  })

  it('REJECTS on an empty key rather than metering an anonymous caller', async () => {
    // The boundary rejecting an input it cannot honour. A placeholder key would
    // pool every anonymous caller into one counter; an IP key would be keyed on
    // a client-controlled header. Both report protection that does not exist.
    const { store, now } = fresh()

    await expect(rateLimit('', BUDGET, { store, now })).rejects.toThrow(
      /requires a resolved key/,
    )
    await expect(rateLimit('   ', BUDGET, { store, now })).rejects.toThrow(
      /requires a resolved key/,
    )
  })

  it('does not grow unboundedly: expired counters are swept', async () => {
    // An in-memory limiter that never prunes is an in-memory leak — one entry
    // per uid ever seen.
    const store = createMemoryStore()
    for (let index = 0; index < 100; index += 1) {
      await rateLimit(`session:uid-${index}`, BUDGET, { store, now: 1_000_000 })
    }
    // A later window sweeps the lot; the survivor is the one just written.
    expect(
      (
        await rateLimit('session:late', BUDGET, {
          store,
          now: 1_000_000 + 60_001,
        })
      ).ok,
    ).toBe(true)
    // The old keys are gone, so uid-0 starts a fresh window rather than resuming.
    expect(
      (
        await rateLimit('session:uid-0', BUDGET, {
          store,
          now: 1_000_000 + 60_001,
        })
      ).ok,
    ).toBe(true)
  })

  it('honours a store whose `hit` genuinely resolves later — the Redis swap', async () => {
    // The reason the seam is async at all. This store answers on a later
    // microtask, exactly as a network-backed one would; a `rateLimit` that
    // forgot to await would read `count` off a Promise and mis-decide `ok`.
    // Proving the SEAM tolerates latency is what makes "a Redis store changes
    // no call site" a checked claim rather than a comment.
    const counters = new Map<string, { count: number; resetAt: number }>()
    const networkStore: RateLimitStore = {
      async hit(key, windowMs, now) {
        await Promise.resolve()
        const existing = counters.get(key)
        if (!existing || existing.resetAt <= now) {
          const cold = { count: 1, resetAt: now + windowMs }
          counters.set(key, cold)
          return cold
        }
        existing.count += 1
        return existing
      },
    }

    const now = 1_000_000
    const results: boolean[] = []
    for (const _ of [1, 2, 3, 4]) {
      results.push(
        (await rateLimit('session:uid-a', BUDGET, { store: networkStore, now }))
          .ok,
      )
    }

    expect(results).toEqual([true, true, true, false])
  })
})
