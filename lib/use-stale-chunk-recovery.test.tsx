// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { attemptChunkReload, isChunkLoadError } = vi.hoisted(() => ({
  attemptChunkReload: vi.fn(),
  isChunkLoadError: vi.fn(),
}))

vi.mock('./chunk-error', () => ({ attemptChunkReload, isChunkLoadError }))

import { useStaleChunkRecovery } from './use-stale-chunk-recovery'

afterEach(cleanup)

describe('useStaleChunkRecovery', () => {
  beforeEach(() => {
    attemptChunkReload.mockReset()
    isChunkLoadError.mockReset()
  })

  it('keeps the ordinary fallback for a non-chunk error', () => {
    isChunkLoadError.mockReturnValue(false)

    const { result } = renderHook(() =>
      useStaleChunkRecovery(new Error('asset_not_found')),
    )

    expect(result.current).toBe(false)
    expect(attemptChunkReload).not.toHaveBeenCalled()
  })

  it('waits for the first recovery reload instead of showing a terminal fallback', () => {
    isChunkLoadError.mockReturnValue(true)
    attemptChunkReload.mockReturnValue(true)

    const { result } = renderHook(() =>
      useStaleChunkRecovery(new Error('Failed to load chunk')),
    )

    expect(result.current).toBe(false)
    expect(attemptChunkReload).toHaveBeenCalledTimes(1)
  })

  it('shows the stale-deploy fallback when reload recovery is exhausted', () => {
    isChunkLoadError.mockReturnValue(true)
    attemptChunkReload.mockReturnValue(false)

    const { result } = renderHook(() =>
      useStaleChunkRecovery(new Error('Failed to load chunk')),
    )

    expect(result.current).toBe(true)
  })
})
