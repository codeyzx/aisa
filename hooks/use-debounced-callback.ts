import * as React from 'react'
import { useDebouncer } from '@tanstack/react-pacer/debouncer'

/**
 * The repo's debounce contract, a thin adapter over TanStack Pacer's lower-level
 * `useDebouncer`. Features get ONLY this shape — never a Pacer instance — so the
 * dependency stays swappable and the surface stays the approved one:
 *
 * - TRAILING scheduling: calling the returned function (re)starts a `delayMs`
 *   timer; the latest call runs once the caller stops calling for that long.
 * - `.cancel()` drops a pending run — call it before firing synchronously (an
 *   Enter key, a submit) or on a reset.
 * - `.flush()` runs a pending run immediately instead of waiting out the delay.
 * - `.pending` reports whether a trailing run is scheduled — but only when
 *   `{ trackPending: true }` is passed; otherwise it stays `false` and the hook
 *   subscribes to no state, so it never re-renders on its own.
 * - Unmount cleanup and latest-callback/args are Pacer's: the instance is created
 *   once and its `fn` is repointed at the newest `callback` every render, so the
 *   debounced function never fires a stale closure, and a scheduled run is
 *   cancelled when the host unmounts.
 */
export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void
  cancel(): void
  flush(): void
  readonly pending: boolean
}

export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
  options?: { trackPending?: boolean },
): DebouncedCallback<Args> {
  const trackPending = options?.trackPending ?? false

  const debouncer = useDebouncer(
    callback,
    { wait: delayMs, leading: false, trailing: true },
    // No selector unless pending is tracked: an absent selector opts out of every
    // reactive subscription, so the hook (and its host) never re-renders on a
    // schedule/execute — the stable-reference behaviour the search field needs.
    trackPending ? (state) => ({ isPending: state.isPending }) : undefined,
  )

  const pending = trackPending ? (debouncer.state.isPending ?? false) : false

  return React.useMemo(() => {
    const debounced = ((...args: Args) => {
      debouncer.maybeExecute(...args)
    }) as DebouncedCallback<Args>
    debounced.cancel = () => debouncer.cancel()
    debounced.flush = () => debouncer.flush()
    Object.defineProperty(debounced, 'pending', { value: pending })
    return debounced
  }, [debouncer, pending])
}
