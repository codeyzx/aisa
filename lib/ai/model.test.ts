import { describe, expect, it } from 'vitest'

import { createMemoryStore, rateLimit } from '@/lib/http'

import { INFERENCE_RATE_LIMIT, INFERENCE_TIMEOUT_MS } from './model'

/**
 * These drive the REAL constant through the REAL limiter, with an injected store
 * and clock — not a copy of the numbers.
 *
 * That is the whole point: a load-bearing constant a test cannot reach is
 * unfalsifiable, and it is why `INFERENCE_RATE_LIMIT` lives in this
 * credential-free module rather than beside its call site in a `'use server'`
 * file that can export nothing but async functions. Assert the SHAPE and the
 * BEHAVIOUR, never the literal `5` — the number is a product call meant to be
 * edited, and a test restating it would fail on every legitimate change while
 * catching no bug.
 */
describe('INFERENCE_RATE_LIMIT', () => {
  it('is a budget the limiter can actually spend', () => {
    expect(Number.isInteger(INFERENCE_RATE_LIMIT.limit)).toBe(true)
    expect(INFERENCE_RATE_LIMIT.limit).toBeGreaterThan(0)
    // A window shorter than one call's deadline would let a single hung request
    // outlive the budget meant to bound it.
    expect(INFERENCE_RATE_LIMIT.windowMs).toBeGreaterThanOrEqual(
      INFERENCE_TIMEOUT_MS,
    )
  })

  it('admits exactly `limit` calls in a window, then refuses with a wait', async () => {
    const store = createMemoryStore()
    const key = 'ai:uid-a'
    const start = 1_000_000

    for (let call = 1; call <= INFERENCE_RATE_LIMIT.limit; call += 1) {
      expect(
        (await rateLimit(key, INFERENCE_RATE_LIMIT, { store, now: start })).ok,
      ).toBe(true)
    }

    const refused = await rateLimit(key, INFERENCE_RATE_LIMIT, {
      store,
      now: start,
    })
    expect(refused.ok).toBe(false)
    // The seconds are what the throw site puts in the server log; a refusal that
    // cannot say when to retry is a dead end.
    expect(refused.retryAfter).toBeGreaterThan(0)
  })

  it('lets the next window through again', async () => {
    const store = createMemoryStore()
    const key = 'ai:uid-a'
    const start = 1_000_000

    for (let call = 0; call <= INFERENCE_RATE_LIMIT.limit; call += 1) {
      await rateLimit(key, INFERENCE_RATE_LIMIT, { store, now: start })
    }

    const nextWindow = start + INFERENCE_RATE_LIMIT.windowMs
    expect(
      (await rateLimit(key, INFERENCE_RATE_LIMIT, { store, now: nextWindow }))
        .ok,
    ).toBe(true)
  })

  it('meters each uid separately', async () => {
    const store = createMemoryStore()
    const start = 1_000_000

    for (let call = 0; call <= INFERENCE_RATE_LIMIT.limit; call += 1) {
      await rateLimit('ai:uid-a', INFERENCE_RATE_LIMIT, { store, now: start })
    }

    // One caller exhausting the budget must not lock everyone else out — the key
    // embeds the resolved uid precisely so it cannot.
    expect(
      (await rateLimit('ai:uid-b', INFERENCE_RATE_LIMIT, { store, now: start }))
        .ok,
    ).toBe(true)
  })

  it('cannot share a counter with another purpose on the same uid', async () => {
    const store = createMemoryStore()
    const start = 1_000_000

    for (let call = 0; call <= INFERENCE_RATE_LIMIT.limit; call += 1) {
      await rateLimit('ai:uid-a', INFERENCE_RATE_LIMIT, { store, now: start })
    }

    // `session:` is the other budget in this codebase (app/api/auth/session).
    // The `ai:` namespace is what keeps spending inference from locking a user
    // out of signing in.
    expect(
      (
        await rateLimit('session:uid-a', INFERENCE_RATE_LIMIT, {
          store,
          now: start,
        })
      ).ok,
    ).toBe(true)
  })
})
