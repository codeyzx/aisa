// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { useDebouncedCallback } from './use-debounced-callback'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('useDebouncedCallback', () => {
  it('runs once after the delay, with the latest args', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => {
      result.current('a')
      result.current('b')
    })
    expect(fn).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(300))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('invokes the LATEST callback, not the one captured at first render', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: first as (arg: string) => void } },
    )
    act(() => result.current('x'))
    rerender({ cb: second })
    act(() => vi.advanceTimersByTime(300))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('x')
  })

  it('resets the timer on each call — only the last one fires', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => result.current('a'))
    act(() => vi.advanceTimersByTime(200))
    act(() => result.current('b'))
    act(() => vi.advanceTimersByTime(200))
    expect(fn).not.toHaveBeenCalled() // 400ms elapsed, but the timer reset at 200
    act(() => vi.advanceTimersByTime(100))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('does not execute after cancel', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => {
      result.current('a')
      result.current.cancel()
    })
    act(() => vi.advanceTimersByTime(400))
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush runs a pending call immediately and only once', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => result.current('a'))
    act(() => result.current.flush())
    expect(fn).toHaveBeenCalledWith('a')
    act(() => vi.advanceTimersByTime(300))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applies a changed delay to subsequent scheduling', () => {
    const fn = vi.fn()
    const { result, rerender } = renderHook(
      ({ d }) => useDebouncedCallback(fn, d),
      { initialProps: { d: 300 } },
    )
    rerender({ d: 100 })
    act(() => result.current('a'))
    act(() => vi.advanceTimersByTime(100))
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('cancels a pending run when the host unmounts', () => {
    const fn = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => result.current('a'))
    unmount()
    act(() => vi.advanceTimersByTime(400))
    expect(fn).not.toHaveBeenCalled()
  })

  it('schedules exactly once under StrictMode double-invocation', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 300), {
      wrapper: StrictMode,
    })
    act(() => result.current('a'))
    act(() => vi.advanceTimersByTime(300))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('tracks pending only when opted in', () => {
    const fn = vi.fn()
    const untracked = renderHook(() => useDebouncedCallback(fn, 300))
    act(() => untracked.result.current('a'))
    expect(untracked.result.current.pending).toBe(false) // never tracked
    untracked.unmount()

    const { result } = renderHook(() =>
      useDebouncedCallback(fn, 300, { trackPending: true }),
    )
    expect(result.current.pending).toBe(false)
    act(() => result.current('a'))
    expect(result.current.pending).toBe(true)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.pending).toBe(false)
  })
})
