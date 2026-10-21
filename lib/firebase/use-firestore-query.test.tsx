// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Query } from 'firebase/firestore'

/**
 * The stream's IDENTITY. `streams` is a module-level Map that survives a
 * sign-out, so a principal-free key like `assets:active` named the same slot for
 * every person who ever signed into the tab. Isolation then rested on the
 * refcount teardown running to zero before the next principal subscribed —
 * TIMING, not identity — and the module deliberately leaves a terminally-errored
 * entry in place until its last reader unmounts, so a later reader really can
 * find a previous principal's slot.
 *
 * These drive the hook through its two real seams: `onAuthStateChanged` (which
 * principal is signed in) and `onSnapshot` (what the stream publishes). Both are
 * captured so a test can push a new principal, or a snapshot, at will.
 */

const auth = vi.hoisted(() => ({
  listener: null as ((user: { uid: string } | null) => void) | null,
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (
    _auth: unknown,
    next: (user: { uid: string } | null) => void,
  ) => {
    auth.listener = next
    return () => {
      auth.listener = null
    }
  },
}))

const firestore = vi.hoisted(() => ({
  /** Every onSnapshot call, in order, with the emitter that feeds it. */
  subscriptions: [] as {
    emit: (docs: { id: string }[]) => void
    unsubscribe: ReturnType<typeof vi.fn>
  }[],
}))

vi.mock('firebase/firestore', () => ({
  onSnapshot: (
    _query: unknown,
    onNext: (snap: { docs: { id: string }[] }) => void,
  ) => {
    const unsubscribe = vi.fn()
    firestore.subscriptions.push({
      emit: (docs) => onNext({ docs }),
      unsubscribe,
    })
    return unsubscribe
  },
}))

vi.mock('@/lib/firebase/client-auth', () => ({ firebaseAuth: () => ({}) }))

import { useFirestoreQuery } from './use-firestore-query'

/** Sign a principal in (or out with `null`) through the real auth seam. */
function signIn(uid: string | null) {
  act(() => {
    auth.listener?.(uid === null ? null : { uid })
  })
}

function render(key: string) {
  return renderHook(() =>
    useFirestoreQuery<string>({
      key,
      createQuery: () => ({}) as Query,
      parse: (snapshot) => (snapshot as unknown as { id: string }).id,
    }),
  )
}

beforeEach(() => {
  auth.listener = null
  firestore.subscriptions = []
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useFirestoreQuery — principal isolation', () => {
  it('does not serve one principal the rows cached for another', () => {
    // The whole point. Principal A opens `assets:active` and receives rows;
    // principal B mounts the SAME caller key and must start pending, never
    // holding A's documents. With a principal-free key B reads A's snapshot
    // straight out of the module Map — verified: dropping the uid from
    // `streamKey` fails exactly this assertion with ['a-doc'].
    const first = render('assets:active')
    signIn('uid-a')
    act(() => {
      firestore.subscriptions[0].emit([{ id: 'a-doc' }])
    })
    expect(first.result.current.data).toStrictEqual(['a-doc'])

    // A's reader stays mounted — this is the case refcount teardown cannot
    // cover, and it is reachable: a second tab-local component, or the entry a
    // terminal stream error leaves behind.
    const second = render('assets:active')
    signIn('uid-b')

    expect(second.result.current.data).toBeUndefined()
  })

  it('opens a SEPARATE stream when the principal changes', () => {
    const { result } = render('assets:active')
    signIn('uid-a')
    expect(firestore.subscriptions).toHaveLength(1)

    signIn('uid-b')

    // A new subscription, not a reuse of A's. If the key ignored the principal
    // this stays at 1 and B silently reads through A's listener.
    expect(firestore.subscriptions).toHaveLength(2)
    expect(result.current.data).toBeUndefined()
  })

  it('closes the previous principal stream when the principal changes', () => {
    render('assets:active')
    signIn('uid-a')
    signIn('uid-b')

    // A's listener must not outlive A's session — it is not bounded by the
    // session cookie and would keep receiving (and billing).
    expect(firestore.subscriptions[0].unsubscribe).toHaveBeenCalled()
  })

  it('still shares ONE stream between readers of the same principal and key', () => {
    // The regression guard for the fix itself: per-principal keying must not
    // break the sharing invariant this module exists for.
    render('assets:active')
    render('assets:active')
    signIn('uid-a')

    expect(firestore.subscriptions).toHaveLength(1)
  })

  it('stays pending while auth is still restoring', () => {
    // `undefined` is not signed-out; subscribing then is the PERMISSION_DENIED
    // race the hook's auth gate exists to avoid.
    const { result } = render('assets:active')

    expect(result.current.data).toBeUndefined()
    expect(firestore.subscriptions).toHaveLength(0)
  })
})
