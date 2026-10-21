import { beforeEach, describe, expect, it, vi } from 'vitest'

import { attemptChunkReload, isChunkLoadError } from './chunk-error'

const chunkError = (name: string, message: string): Error =>
  Object.assign(new Error(message), { name })

describe('isChunkLoadError', () => {
  it('detects the error THIS repo actually throws, verbatim from a prod build', () => {
    // Not invented. Captured by driving `next build` + `next start` with the
    // chunk requests aborted: name and message exactly as observed.
    expect(
      isChunkLoadError(
        chunkError(
          'ChunkLoadError',
          'Failed to load chunk /_next/static/chunks/17tjyejc3s72f.js from module 87972',
        ),
      ),
    ).toBe(true)
  })

  it('falls back to the message when the name is lost', () => {
    // The leg that stands if Turbopack's runtime ever stops setting `name`.
    expect(
      isChunkLoadError(
        chunkError('Error', 'Failed to load chunk /_next/static/chunks/x.js'),
      ),
    ).toBe(true)
  })

  it('still matches WEBPACK’s wording, which is NOT Turbopack’s', () => {
    // The trap this test pins. A webpack-era regex matches "Loading chunk
    // 42 failed" — webpack's phrasing. Turbopack says "Failed to load chunk".
    // A straight port of that regex into this Next 16 repo would match NOTHING,
    // and the whole recovery would be dead code that passes every test and
    // never fires in production.
    expect(
      isChunkLoadError(chunkError('Error', 'Loading chunk 42 failed.')),
    ).toBe(true)
    expect(
      isChunkLoadError(chunkError('Error', 'Loading CSS chunk 7 failed.')),
    ).toBe(true)
  })

  it('does NOT claim unrelated errors', () => {
    // A false positive here reloads the page on an ordinary bug — turning a
    // readable error panel into a mysterious refresh, and hiding the bug.
    expect(isChunkLoadError(new Error('asset_not_found'))).toBe(false)
    expect(isChunkLoadError(new Error('Something went wrong'))).toBe(false)
    expect(
      isChunkLoadError(
        new Error('failed to load the user chunk of the report'),
      ),
    ).toBe(false)
  })
})

describe('attemptChunkReload', () => {
  const reload = vi.fn()

  beforeEach(() => {
    reload.mockClear()
    vi.stubGlobal('location', { reload })
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
  })

  it('reloads on the FIRST occurrence', () => {
    expect(attemptChunkReload()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does NOT reload on the second — this is the infinite-loop guard', () => {
    // THE test of this module. Without the flag, a chunk 404 that a reload
    // cannot fix (CDN broken, not merely stale) reloads into the same error
    // forever. This is the assertion that the guard stays in place.
    expect(attemptChunkReload()).toBe(true)
    expect(attemptChunkReload()).toBe(false)
    expect(attemptChunkReload()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('refuses to reload when sessionStorage is unavailable', () => {
    // Privacy modes and sandboxed iframes throw on access. Reloading without a
    // working guard is the one outcome worse than showing the panel.
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(attemptChunkReload()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('marks the attempt BEFORE reloading, not after', () => {
    // reload() may never return, so a flag written afterwards is never written
    // at all — the loop, reintroduced by a line that looks like cleanup.
    let flagAtReloadTime: string | null = null
    vi.stubGlobal('location', {
      reload: () => {
        flagAtReloadTime = sessionStorage.getItem('chunk-reload-attempted')
      },
    })
    attemptChunkReload()
    expect(flagAtReloadTime).not.toBeNull()
  })
})
