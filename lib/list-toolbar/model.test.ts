import { describe, expect, it } from 'vitest'

import {
  cancelDraft,
  createListToolbarState,
  dispose,
  effectiveValue,
  effectiveValues,
  flushDraft,
  isAnyPending,
  isControlPending,
  patch,
  reconcileExternal,
  reconcileServer,
  reset,
  setDraft,
  setValue,
  type ListToolbarState,
  type ToolbarNavigationEffect,
} from './model'

/**
 * A synthetic list-toolbar value set — the same SHAPE Assets uses (a search, a
 * filter, a sort, a page size, a view) but owned by the test, so these prove the
 * MODEL, not Assets. Cursor is deliberately not here: it is adapter metadata.
 */
interface DemoValues {
  q: string
  status: 'all' | 'active' | 'retired'
  sort: string
  pageSize: '25' | '50'
  view: 'table' | 'card'
}

/** A second feature shape: no view control and unrelated filter names. */
interface InboxValues {
  q: string
  assignee: 'all' | 'mine'
  priority: 'all' | 'urgent'
}

const inboxInitial: InboxValues = {
  q: '',
  assignee: 'all',
  priority: 'all',
}

const initial: DemoValues = {
  q: '',
  status: 'all',
  sort: 'createdAt:desc',
  pageSize: '25',
  view: 'table',
}

const start = () => createListToolbarState(initial)

/**
 * A stand-in for the route-local adapter's cursor policy: a view switch KEEPS the
 * cursor, every query change DROPS it. It reads only `effect.controls`, proving
 * the model hands the adapter enough to decide without knowing about URLs.
 */
function applyCursorPolicy(
  effect: ToolbarNavigationEffect<DemoValues>,
  cursor: string | null,
): { values: DemoValues; cursor: string | null } {
  const keepsCursor =
    effect.controls.length === 1 && effect.controls[0] === 'view'
  return { values: effect.values, cursor: keepsCursor ? cursor : null }
}

const change = <Name extends keyof DemoValues>(
  name: Name,
  value: DemoValues[Name],
) => ({ name, value })

describe('createListToolbarState', () => {
  it('mirrors server into display with nothing optimistic or pending', () => {
    const state = start()
    expect(state.server).toEqual(initial)
    expect(state.display).toEqual(initial)
    expect(state.drafts).toEqual({})
    expect(isAnyPending(state)).toBe(false)
    expect(state.latestNavigationId).toBe(0)
    expect(effectiveValues(state)).toEqual(initial)
  })
})

describe('setValue — an immediate control', () => {
  it('writes display, marks pending, ticks the revision, and emits one effect', () => {
    const { state, effect } = setValue(start(), change('status', 'retired'))
    expect(state.display.status).toBe('retired')
    expect(state.server.status).toBe('all') // server unchanged until confirmed
    expect(isControlPending(state, 'status')).toBe(true)
    expect(state.latestNavigationId).toBe(1)
    expect(effect).toEqual({
      navigationId: 1,
      values: { ...initial, status: 'retired' },
      controls: ['status'],
    })
  })

  it('a control name cannot carry another control value (compile-time)', () => {
    // @ts-expect-error — a pageSize change may not hold a view value.
    setValue(start(), { name: 'pageSize', value: 'card' })
  })
})

describe('optimistic composition — no choice is lost before the server answers', () => {
  it('filter then sort keeps BOTH in display and in the later effect', () => {
    const afterStatus = setValue(start(), change('status', 'retired')).state
    const { state, effect } = setValue(afterStatus, change('sort', 'value:asc'))
    expect(state.display.status).toBe('retired')
    expect(state.display.sort).toBe('value:asc')
    expect(isControlPending(state, 'status')).toBe(true)
    expect(isControlPending(state, 'sort')).toBe(true)
    expect(state.latestNavigationId).toBe(2)
    expect(effect?.values.status).toBe('retired')
    expect(effect?.values.sort).toBe('value:asc')
  })

  it('search then page size keeps both', () => {
    const typed = setDraft(start(), change('q', 'ab')).state
    const searched = flushDraft(typed, 'q').state
    const { state, effect } = setValue(searched, change('pageSize', '50'))
    expect(state.display.q).toBe('ab')
    expect(state.display.pageSize).toBe('50')
    expect(effect?.values).toMatchObject({ q: 'ab', pageSize: '50' })
  })
})

describe('a second list shape — no view control required', () => {
  it('composes unrelated filters without Assets-shaped assumptions', () => {
    const startInbox = createListToolbarState(inboxInitial)
    const assigned = setValue(startInbox, { name: 'assignee', value: 'mine' })
    const { effect } = setValue(assigned.state, {
      name: 'priority',
      value: 'urgent',
    })

    expect(effect?.values).toEqual({
      q: '',
      assignee: 'mine',
      priority: 'urgent',
    })
    expect(effect?.controls).toEqual(['assignee', 'priority'])
  })
})

describe('patch and reset — many controls at once', () => {
  it('patch applies every change as ONE revision and one effect', () => {
    const { state, effect } = patch(start(), [
      change('status', 'active'),
      change('pageSize', '50'),
    ])
    expect(state.display).toMatchObject({ status: 'active', pageSize: '50' })
    expect(state.latestNavigationId).toBe(1)
    expect(effect?.controls).toEqual(['status', 'pageSize'])
  })

  it('reset reverts optimistic display and drafts back to the server', () => {
    const dirty = setValue(start(), change('status', 'retired')).state
    const drafted = setDraft(dirty, change('q', 'ab')).state
    const { state, effect } = reset(drafted)
    expect(state.display).toEqual(initial)
    expect(state.drafts).toEqual({})
    expect(isControlPending(state, 'status')).toBe(true)
    expect(effect?.values).toEqual(initial)
    expect(effect?.controls).toEqual(['status'])
  })

  it('drops an uncommitted draft without navigating', () => {
    const drafted = setDraft(start(), change('q', 'typing')).state
    const { state, effect } = reset(drafted)
    expect(state.drafts).toEqual({})
    expect(effect).toBeUndefined()
  })

  it('reset is a no-op with no effect when nothing is optimistic', () => {
    const result = reset(start())
    expect(result.effect).toBeUndefined()
    expect(result.state).toEqual(start())
  })
})

describe('drafts — the search box lifecycle', () => {
  it('a draft shadows display without navigating', () => {
    const { state, effect } = setDraft(start(), change('q', 'ab'))
    expect(effect).toBeUndefined()
    expect(state.display.q).toBe('') // display untouched
    expect(effectiveValue(state, 'q')).toBe('ab') // draft wins for the reader
    expect(isAnyPending(state)).toBe(false)
  })

  it('a later draft replaces the earlier one', () => {
    const first = setDraft(start(), change('q', 'ab')).state
    const second = setDraft(first, change('q', 'abc')).state
    expect(effectiveValue(second, 'q')).toBe('abc')
  })

  it('cancel drops the draft, reverting to the displayed value, no effect', () => {
    const typed = setDraft(start(), change('q', 'ab')).state
    const { state, effect } = cancelDraft(typed, 'q')
    expect(effect).toBeUndefined()
    expect(effectiveValue(state, 'q')).toBe('')
    expect('q' in state.drafts).toBe(false)
  })

  it('flush commits the draft into a navigation and clears it', () => {
    const typed = setDraft(start(), change('q', 'ab')).state
    const { state, effect } = flushDraft(typed, 'q')
    expect(state.display.q).toBe('ab')
    expect('q' in state.drafts).toBe(false)
    expect(isControlPending(state, 'q')).toBe(true)
    expect(effect?.values.q).toBe('ab')
  })

  it('flush with no draft is a no-op — nothing to send, no redundant round-trip', () => {
    const result = flushDraft(start(), 'q')
    expect(result.effect).toBeUndefined()
    expect(result.state.latestNavigationId).toBe(0)
  })

  it('clear is a flush of an empty draft', () => {
    const withValue = flushDraft(
      setDraft(start(), change('q', 'ab')).state,
      'q',
    ).state
    const cleared = flushDraft(setDraft(withValue, change('q', '')).state, 'q')
    expect(cleared.state.display.q).toBe('')
    expect(cleared.effect?.values.q).toBe('')
  })
})

describe('cursor policy through a mock adapter', () => {
  it('a view switch preserves the cursor', () => {
    const { effect } = setValue(start(), change('view', 'card'))
    const applied = applyCursorPolicy(effect!, 'CURSOR')
    expect(applied.cursor).toBe('CURSOR')
    expect(applied.values.view).toBe('card')
  })

  it('a query change drops the cursor', () => {
    const { effect } = setValue(start(), change('status', 'retired'))
    const applied = applyCursorPolicy(effect!, 'CURSOR')
    expect(applied.cursor).toBeNull()
  })

  it('a view change after a pending query change still drops the cursor', () => {
    const afterStatus = setValue(start(), change('status', 'retired')).state
    const { effect } = setValue(afterStatus, change('view', 'card'))
    const applied = applyCursorPolicy(effect!, 'CURSOR')
    expect(effect?.controls).toEqual(['status', 'view'])
    expect(applied.cursor).toBeNull()
  })
})

describe('server reconciliation — latest wins', () => {
  it('a stale echo records the server fact but does NOT stomp newer display', () => {
    const afterStatus = setValue(start(), change('status', 'retired')).state // nav 1
    const afterSort = setValue(afterStatus, change('sort', 'value:asc')).state // nav 2
    // The server answers nav 1 (status only) AFTER nav 2 was issued.
    const staleServer: DemoValues = { ...initial, status: 'retired' }
    const { state } = reconcileServer(afterSort, staleServer, 1)
    expect(state.display.sort).toBe('value:asc') // newer optimism survives
    expect(state.display.status).toBe('retired')
    expect(state.server).toEqual(staleServer) // but the fact is recorded
    expect(isControlPending(state, 'sort')).toBe(true) // still awaiting nav 2
  })

  it('the latest echo confirms optimism: display snaps to server, pending clears', () => {
    const afterStatus = setValue(start(), change('status', 'retired'))
    const landedServer: DemoValues = { ...initial, status: 'retired' }
    const { state } = reconcileServer(
      afterStatus.state,
      landedServer,
      afterStatus.state.latestNavigationId,
    )
    expect(state.display).toEqual(landedServer)
    expect(state.server).toEqual(landedServer)
    expect(isAnyPending(state)).toBe(false)
  })
})

describe('external navigation — Back / Forward / a shared link', () => {
  it('discards optimistic overlays, reseeds drafts, and jumps the revision clock', () => {
    const optimistic = setValue(start(), change('status', 'retired')).state
    const drafted = setDraft(optimistic, change('q', 'typing')).state
    const external: DemoValues = {
      ...initial,
      q: 'shared',
      status: 'active',
    }
    const { state } = reconcileExternal(drafted, external)
    expect(state.display).toEqual(external) // optimism gone
    expect(state.drafts).toEqual({}) // draft discarded
    expect(effectiveValue(state, 'q')).toBe('shared') // box reseeds from URL
    expect(isAnyPending(state)).toBe(false)
    expect(state.latestNavigationId).toBeGreaterThan(drafted.latestNavigationId)
  })

  it('a pre-external stale echo is ignored after the clock jumped', () => {
    const optimistic = setValue(start(), change('status', 'retired')).state // nav 1
    const external = reconcileExternal(optimistic, {
      ...initial,
      status: 'active',
    }).state // clock jumps to 2
    // The old nav-1 echo finally arrives; it must not resurrect 'retired'.
    const { state } = reconcileServer(
      external,
      { ...initial, status: 'retired' },
      1,
    )
    expect(state.display.status).toBe('active')
  })
})

describe('dispose — late effects are ignored', () => {
  it('every transition is inert after dispose', () => {
    const disposed = dispose(start())
    const transitions: Array<ListToolbarState<DemoValues>> = [
      setValue(disposed, change('status', 'retired')).state,
      patch(disposed, [change('status', 'retired')]).state,
      setDraft(disposed, change('q', 'ab')).state,
      flushDraft(disposed, 'q').state,
      cancelDraft(disposed, 'q').state,
      reset(disposed).state,
      reconcileServer(disposed, initial, 5).state,
      reconcileExternal(disposed, initial).state,
    ]
    for (const next of transitions) {
      expect(next).toBe(disposed) // same reference — untouched
    }
    // And none of them emitted an effect.
    expect(
      setValue(disposed, change('status', 'retired')).effect,
    ).toBeUndefined()
  })
})
