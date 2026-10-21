import { describe, expect, it, vi } from 'vitest'

import { normalizeError } from '@/lib/api/errors.normalize'

import {
  DeadlineExceededError,
  FIRESTORE_WRITE_TIMEOUT_MS,
  withDeadline,
} from './deadline'

describe('FIRESTORE_WRITE_TIMEOUT_MS', () => {
  it('is long enough that only a dead database trips it', () => {
    // The reason this file exists at all: a timeout constant in asset.repo.ts
    // sits behind `server-only` and the credential boundary, so dropping it to
    // 5ms would pass every gate and fail every write at runtime.
    //
    // The lower bound is the real assertion. A deadline that fires on ordinary
    // contention converts a slow write into a failed one — strictly worse than
    // no deadline, because the user is now told a lie instead of waiting.
    expect(FIRESTORE_WRITE_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000)
    expect(FIRESTORE_WRITE_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})

describe('withDeadline', () => {
  it('passes a value through untouched when the work wins', async () => {
    await expect(
      withDeadline(Promise.resolve('ok'), 'fastWrite'),
    ).resolves.toBe('ok')
  })

  it("propagates the operation's own rejection rather than masking it", async () => {
    // A deadline must not swallow a real failure and re-report it as a timeout:
    // "the database refused this write" and "the database never answered" are
    // different bugs with different fixes.
    const boom = new Error('permission denied')
    await expect(
      withDeadline(Promise.reject(boom), 'failingWrite'),
    ).rejects.toBe(boom)
  })

  it('rejects with DeadlineExceededError once the deadline passes', async () => {
    vi.useFakeTimers()
    try {
      const hangs = new Promise<never>(() => {})
      const raced = withDeadline(hangs, 'hangingWrite', 10_000)
      const assertion = expect(raced).rejects.toBeInstanceOf(
        DeadlineExceededError,
      )
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('names the call site in the message, or a timeout is not a bug report', async () => {
    vi.useFakeTimers()
    try {
      const raced = withDeadline(
        new Promise<never>(() => {}),
        'createAsset',
        50,
      )
      const assertion = expect(raced).rejects.toThrow(
        /createAsset did not complete within 50ms/,
      )
      await vi.advanceTimersByTimeAsync(50)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('normalises to DEADLINE_EXCEEDED through the taxonomy that already owns it', () => {
    // THE load-bearing assertion of this module. The deadline's whole contract
    // is that a caller cannot tell our timeout from the SDK's — both must land
    // on the same taxonomy code and therefore the same 504. This is what makes
    // `code = 'deadline-exceeded'` a seam rather than a coincidence: rename that
    // string and this goes red instead of the error quietly becoming INTERNAL
    // (a 500), which is what any unrecognised throw normalises to.
    const error = new DeadlineExceededError('createAsset', 10_000)
    expect(normalizeError(error).code).toBe('DEADLINE_EXCEEDED')
  })

  it('clears its timer on the success path so a script can exit promptly', async () => {
    // Without the clear, an outstanding setTimeout keeps Node's event loop alive
    // for the full timeout AFTER the work finished — a migration that has
    // written everything and then appears to freeze for 10s before exiting.
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    try {
      await withDeadline(Promise.resolve('done'), 'fastWrite')
      expect(clearSpy).toHaveBeenCalled()
    } finally {
      clearSpy.mockRestore()
    }
  })
})
