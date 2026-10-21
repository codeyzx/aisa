// @vitest-environment jsdom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { shallow } from 'zustand/shallow'

import { createListToolbarScope } from './scope'
import { effectiveValue, type ToolbarNavigationEffect } from './model'

/**
 * A synthetic value set the test owns (the same SHAPE Assets uses), so these prove
 * the BINDING, not Assets. No router: the adapter is injected and just records the
 * navigation effects the model emits.
 */
interface DemoValues {
  q: string
  status: 'all' | 'active' | 'retired'
  view: 'table' | 'card'
}

const initial: DemoValues = { q: '', status: 'all', view: 'table' }

function makeAdapter() {
  const effects: ToolbarNavigationEffect<DemoValues>[] = []
  const navigate = (effect: ToolbarNavigationEffect<DemoValues>) =>
    effects.push(effect)
  return { navigate, effects }
}

// One scope for the whole file: providers isolate by INSTANCE, not by scope, so
// the same context is safe to reuse across tests.
const scope = createListToolbarScope<DemoValues>()

afterEach(cleanup)

describe('provider context identity', () => {
  it('is STABLE across every state change', () => {
    const identities = new Set<unknown>()
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }

    function Consumer() {
      identities.add(scope.useToolbarContext())
      const status = scope.useToolbarSelector((s) => s.display.status)
      return <span>{status}</span>
    }

    function Harness() {
      const toolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      holder.current = toolbar
      return (
        <toolbar.Provider>
          <Consumer />
        </toolbar.Provider>
      )
    }

    render(<Harness />)
    expect(identities.size).toBe(1)

    act(() => holder.current!.setValue({ name: 'status', value: 'active' }))
    act(() => holder.current!.setValue({ name: 'view', value: 'card' }))

    // The consumer re-rendered (its slice changed) but the context value did not.
    expect(identities.size).toBe(1)
  })
})

describe('primitive selectors', () => {
  it('re-render ONLY their own consumers', () => {
    let statusRenders = 0
    let viewRenders = 0
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }

    // React.memo so a parent re-render (the controller's transition toggling
    // `isNavigating`) cannot cascade in — leaving ONLY the store subscription as
    // a re-render source, which is exactly the isolation under test.
    const StatusView = React.memo(function StatusView() {
      scope.useToolbarSelector((s) => s.display.status)
      statusRenders++
      return null
    })
    const ViewView = React.memo(function ViewView() {
      scope.useToolbarSelector((s) => s.display.view)
      viewRenders++
      return null
    })
    function Harness() {
      const toolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      holder.current = toolbar
      return (
        <toolbar.Provider>
          <StatusView />
          <ViewView />
        </toolbar.Provider>
      )
    }

    render(<Harness />)
    expect(statusRenders).toBe(1)
    expect(viewRenders).toBe(1)

    act(() => holder.current!.setValue({ name: 'status', value: 'active' }))
    expect(statusRenders).toBe(2)
    expect(viewRenders).toBe(1) // untouched — its slice did not change
  })
})

describe('object/array selectors', () => {
  it('re-render on every change WITHOUT an equality fn, and stay stable WITH shallow', () => {
    let noEqRenders = 0
    let withEqRenders = 0
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }

    // Memoized so the only re-render source is the store subscription (see above).
    const NoEq = React.memo(function NoEq() {
      // A fresh array each call — Object.is never holds, so any store change re-renders.
      scope.useToolbarSelector((s) => [s.display.status])
      noEqRenders++
      return null
    })
    const WithEq = React.memo(function WithEq() {
      scope.useToolbarSelector((s) => [s.display.status], shallow)
      withEqRenders++
      return null
    })
    function Harness() {
      const toolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      holder.current = toolbar
      return (
        <toolbar.Provider>
          <NoEq />
          <WithEq />
        </toolbar.Provider>
      )
    }

    render(<Harness />)
    expect(noEqRenders).toBe(1)
    expect(withEqRenders).toBe(1)

    // Change a control NOT in either selector's slice.
    act(() => holder.current!.setValue({ name: 'view', value: 'card' }))

    expect(noEqRenders).toBe(2) // new array each render → re-rendered
    expect(withEqRenders).toBe(1) // shallow-equal array → skipped
  })
})

describe('sibling provider instances', () => {
  it('are independent — changing one does not affect the other', () => {
    let bRenders = 0
    const a: { current: ReturnType<typeof scope.useListToolbar> | null } = {
      current: null,
    }
    const b: { current: ReturnType<typeof scope.useListToolbar> | null } = {
      current: null,
    }

    function BConsumer() {
      bRenders++
      return <span>{scope.useToolbarSelector((s) => s.display.status)}</span>
    }
    function HarnessA() {
      const toolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      a.current = toolbar
      return <toolbar.Provider>{null}</toolbar.Provider>
    }
    function HarnessB() {
      const toolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      b.current = toolbar
      return (
        <toolbar.Provider>
          <BConsumer />
        </toolbar.Provider>
      )
    }

    render(
      <>
        <HarnessA />
        <HarnessB />
      </>,
    )
    expect(bRenders).toBe(1)
    expect(a.current).not.toBe(b.current)

    act(() => a.current!.setValue({ name: 'status', value: 'retired' }))

    expect(b.current!.store.getState().display.status).toBe('all') // untouched
    expect(bRenders).toBe(1) // B's consumer never re-rendered
  })
})

describe('nested scopes', () => {
  it('select the NEAREST provider', () => {
    const outer: { current: ReturnType<typeof scope.useListToolbar> | null } = {
      current: null,
    }
    const inner: { current: ReturnType<typeof scope.useListToolbar> | null } = {
      current: null,
    }

    function Deep() {
      const status = scope.useToolbarSelector((s) => s.display.status)
      return <span data-testid="deep">{status}</span>
    }
    function Harness() {
      const outerToolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      const innerToolbar = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      outer.current = outerToolbar
      inner.current = innerToolbar
      return (
        <outerToolbar.Provider>
          <innerToolbar.Provider>
            <Deep />
          </innerToolbar.Provider>
        </outerToolbar.Provider>
      )
    }

    const { getByTestId } = render(<Harness />)
    expect(getByTestId('deep').textContent).toBe('all')

    // The inner provider is nearest, so its change shows and the outer's does not.
    act(() => outer.current!.setValue({ name: 'status', value: 'retired' }))
    expect(getByTestId('deep').textContent).toBe('all')

    act(() => inner.current!.setValue({ name: 'status', value: 'active' }))
    expect(getByTestId('deep').textContent).toBe('active')
  })
})

describe('missing provider', () => {
  it('throws a useful error', () => {
    function Orphan() {
      scope.useToolbarSelector((s) => s.display.status)
      return null
    }
    // React logs the thrown render error; silence it for a clean run.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Orphan />)).toThrow(/Provider/)
    spy.mockRestore()
  })
})

describe('debounced search', () => {
  it('drafts on a keystroke and commits one navigation after the delay', () => {
    vi.useFakeTimers()
    const adapter = makeAdapter()
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }
    function Harness() {
      holder.current = scope.useListToolbar({ server: initial, adapter })
      return null
    }
    render(<Harness />)

    act(() => holder.current!.search.change({ name: 'q', value: 'ab' }))
    // The draft shows immediately; nothing has navigated yet.
    expect(effectiveValue(holder.current!.store.getState(), 'q')).toBe('ab')
    expect(adapter.effects).toHaveLength(0)

    act(() => vi.advanceTimersByTime(300))
    expect(adapter.effects).toHaveLength(1)
    expect(adapter.effects[0]!.values.q).toBe('ab')
    expect(holder.current!.store.getState().display.q).toBe('ab')

    vi.useRealTimers()
  })

  it('Enter commits immediately, cancelling the scheduled trailing run', () => {
    vi.useFakeTimers()
    const adapter = makeAdapter()
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }
    function Harness() {
      holder.current = scope.useListToolbar({ server: initial, adapter })
      return null
    }
    render(<Harness />)

    act(() => holder.current!.search.change({ name: 'q', value: 'xy' }))
    act(() => holder.current!.search.enter('q'))
    // One immediate commit…
    expect(adapter.effects).toHaveLength(1)
    // …and the scheduled trailing run was cancelled, so time passing adds nothing.
    act(() => vi.advanceTimersByTime(500))
    expect(adapter.effects).toHaveLength(1)

    vi.useRealTimers()
  })
})

describe('reconciliation of the server prop', () => {
  it('does NOT reconcile on the first mount, then confirms a landed navigation', () => {
    const adapter = makeAdapter()
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }
    function Harness({ server }: { server: DemoValues }) {
      holder.current = scope.useListToolbar({ server, adapter })
      return null
    }

    const { rerender } = render(<Harness server={initial} />)
    // First mount: seeded, nothing pending, no navigation from a reconcile.
    expect(holder.current!.store.getState().display.status).toBe('all')

    // Optimistic change → pending; the server prop then echoes it (landed).
    act(() => holder.current!.setValue({ name: 'status', value: 'active' }))
    expect(holder.current!.store.getState().pendingControls.has('status')).toBe(
      true,
    )

    rerender(<Harness server={{ ...initial, status: 'active' }} />)
    const state = holder.current!.store.getState()
    expect(state.server.status).toBe('active')
    expect(state.pendingControls.has('status')).toBe(false) // confirmed
  })

  it('treats an unrelated server change as an external navigation', () => {
    const adapter = makeAdapter()
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }
    function Harness({ server }: { server: DemoValues }) {
      holder.current = scope.useListToolbar({ server, adapter })
      return null
    }

    const { rerender } = render(<Harness server={initial} />)
    // Nothing pending; a shared-link style jump to a new status.
    rerender(<Harness server={{ ...initial, status: 'retired' }} />)
    const state = holder.current!.store.getState()
    expect(state.display.status).toBe('retired')
    expect(state.server.status).toBe('retired')
  })

  it('treats Back/Forward as external even while an issued navigation is pending', () => {
    const adapter = makeAdapter()
    const holder: { current: ReturnType<typeof scope.useListToolbar> | null } =
      {
        current: null,
      }
    function Harness({ server }: { server: DemoValues }) {
      holder.current = scope.useListToolbar({ server, adapter })
      return null
    }

    const { rerender } = render(<Harness server={initial} />)
    act(() => holder.current!.setValue({ name: 'status', value: 'active' }))
    act(() => holder.current!.markNextServerAsExternal())
    rerender(<Harness server={{ ...initial, status: 'retired' }} />)

    const state = holder.current!.store.getState()
    expect(state.display.status).toBe('retired')
    expect(state.pendingControls.size).toBe(0)
  })
})

describe('type safety (compile-time)', () => {
  it('rejects invalid control names and mismatched value types', () => {
    // Never rendered — the compiler checks the body regardless, so the runtime
    // does nothing while the two ts-expect-errors must hold.
    function TypeProbe() {
      const c = scope.useListToolbar({
        server: initial,
        adapter: makeAdapter(),
      })
      // @ts-expect-error — 'nope' is not a control name.
      c.setValue({ name: 'nope', value: 'x' })
      // @ts-expect-error — 'status' cannot carry a view value.
      c.setValue({ name: 'status', value: 'table' })
      return null
    }
    expect(typeof TypeProbe).toBe('function')
  })
})
