'use client'

/**
 * The React binding for the pure list-toolbar model (./model.ts). The model is a
 * dependency-free state machine; THIS wraps one live instance of it in a
 * `zustand/vanilla` store, drives its transitions from imperative methods, and
 * turns the transitions' navigation EFFECTS into a real navigation via an
 * injected `adapter` (a feature owns cursor policy + href construction; a test
 * injects a recorder — see scope.test.tsx). No router is imported here.
 *
 * `createListToolbarScope<Values>()` is called ONCE per feature at module level to
 * mint a typed scope: a `useListToolbar` controller hook plus a Context + selector
 * pair so descendants in OTHER files subscribe to a control's slice without prop
 * drilling. The Context carries the STABLE controller instance only — never a
 * reactive value — so a state change never changes context identity, and every
 * subscriber re-renders through the store's `useSyncExternalStore`, not through
 * the provider.
 *
 * The controller returned by `useListToolbar` also carries its own bound,
 * per-instance components (`.Provider`, `.Control`, `.Subscribe`, `.Search`,
 * `.Select`, `.View`). Those subscribe DIRECTLY to their own instance's store
 * rather than through Context, so `<toolbar.Select …/>` works whether or not it
 * sits under `<toolbar.Provider>`; the Context path exists for the generic
 * `useToolbarSelector`, which unrelated descendants use.
 */

import * as React from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { shallow } from 'zustand/shallow'

import { useDebouncedCallback } from '@/hooks/use-debounced-callback'
import { ChoiceSelect } from '@/components/ui/choice-select'
import { SearchInput } from '@/components/ui/search-input'
import { ViewToggle, type ViewToggleOption } from '@/components/ui/view-toggle'

import * as model from './model'
import type {
  ListToolbarState,
  ToolbarChange,
  ToolbarNavigationEffect,
} from './model'

/** The one thing a transition asks of the outside world: perform this navigation. */
export interface ListToolbarAdapter<Values> {
  navigate: (effect: ToolbarNavigationEffect<Values>) => void
}

export interface UseListToolbarOptions<Values extends object> {
  /** The server-confirmed values for this render (from `searchParams`/the URL). */
  server: Values
  /** Turns a navigation effect into a real navigation. The feature owns cursor
   *  policy and href construction; the model and this hook stay router-agnostic. */
  adapter: ListToolbarAdapter<Values>
  /** How long a keystroke waits before its draft commits. Defaults to 300ms. */
  searchDelayMs?: number
}

/** The keys of `Values` whose value is a `string` — the leaf-control dimensions. */
type StringKeys<Values> = {
  [K in keyof Values]: Values[K] extends string ? K : never
}[keyof Values]

/** What a `.Control` render-prop receives for its one control. */
interface ControlRenderState<Values, Name extends keyof Values> {
  value: Values[Name]
  pending: boolean
}

/**
 * The controller: the stable per-mount instance `useListToolbar` returns. Its
 * imperative methods dispatch model transitions into `store`; its bound
 * components read slices back out.
 */
export interface ListToolbarController<Values extends object> {
  /** A stable, collision-free id (from `useId`) bound controls derive DOM ids from. */
  readonly id: string
  /** The live store. Subscribe via `useToolbarSelector` or the bound components. */
  readonly store: StoreApi<ListToolbarState<Values>>

  /** Commit one immediate control (filter/sort/size/view) — optimistic + navigate. */
  setValue(change: ToolbarChange<Values>): void
  /** Commit several controls as ONE navigation. */
  patch(changes: ReadonlyArray<ToolbarChange<Values>>): void
  /** Revert every optimistic overlay + draft back to the server, as one navigation. */
  reset(): void
  /** Write an uncommitted draft (a keystroke) — no navigation. */
  setDraft(change: ToolbarChange<Values>): void
  /** Commit a control's draft into a navigation (cancels any scheduled commit first). */
  flushDraft(name: keyof Values): void
  /** Drop a control's draft without committing (cancels any scheduled commit first). */
  cancelDraft(name: keyof Values): void
  /** Schedule a debounced `flushDraft(name)` — the trailing search commit. */
  scheduleDraftCommit(name: keyof Values): void
  /** The search-box lifecycle a debounced string field uses. */
  readonly search: {
    /** A keystroke: record the draft and (re)schedule its trailing commit. */
    change<Name extends StringKeys<Values>>(change: {
      name: Name
      value: Values[Name]
    }): void
    /** Enter: cancel the schedule and commit the draft NOW. */
    enter(name: StringKeys<Values>): void
    /** Clear: cancel the schedule, blank the draft, and commit it NOW. */
    clear(name: StringKeys<Values>): void
  }
  /** Whether the controller's single navigation transition is in flight. */
  isNavigating(): boolean
  /** Mark the model disposed so any late effect is inert. Called on unmount. */
  dispose(): void
  /** Reconcile an incoming server prop into the model. Called by the hook's effect. */
  reconcile(server: Values): void
  /** Mark the next server prop as browser history navigation, not an issued echo. */
  markNextServerAsExternal(): void

  /** Wraps a subtree so `useToolbarContext`/`useToolbarSelector` resolve to this instance. */
  Provider: (props: { children: React.ReactNode }) => React.ReactElement
  /** The generic escape hatch: a render-prop bound to one control's slice. */
  Control: <Name extends keyof Values>(props: {
    name: Name
    children: (args: {
      state: ControlRenderState<Values, Name>
      handleChange: (value: Values[Name]) => void
    }) => React.ReactNode
  }) => React.ReactElement
  /** A render-prop over an arbitrary (shallow-compared) slice of state. */
  Subscribe: <T>(props: {
    selector: (state: ListToolbarState<Values>) => T
    children: (value: T) => React.ReactNode
  }) => React.ReactElement
  /** A debounced `SearchInput` bound to a string control. */
  Search: (props: {
    name: StringKeys<Values>
    label: string
    placeholder?: string
    clearLabel?: string
    hint?: string
  }) => React.ReactElement
  /** A `ChoiceSelect` bound to a string control (immediate commit). */
  Select: <Name extends StringKeys<Values>>(props: {
    name: Name
    values: readonly Extract<Values[Name], string>[]
    labels: Record<Extract<Values[Name], string>, string>
    'aria-label'?: string
    className?: string
  }) => React.ReactElement
  /** A `ViewToggle` bound to a string control (immediate commit). */
  View: <Name extends StringKeys<Values>>(props: {
    name: Name
    options: ViewToggleOption<Extract<Values[Name], string>>[]
    'aria-label': string
  }) => React.ReactElement
}

/** The mutable holders the stable controller reads the newest render values from. */
interface ControllerDeps<Values extends object> {
  server: Values
  instanceId: string
  adapterRef: React.RefObject<ListToolbarAdapter<Values>>
  startTransitionRef: React.RefObject<React.TransitionStartFunction>
  isNavigatingRef: React.RefObject<boolean>
  debouncedRef: React.RefObject<{
    (name: keyof Values): void
    cancel(): void
  } | null>
  Context: React.Context<ListToolbarController<Values> | null>
}

/**
 * Builds ONE controller instance. Called once per mount (from a `useState`
 * initializer), so the store and the bound components have stable identities for
 * the life of the mount, while the newest adapter/transition/debounce are read
 * through the passed refs.
 */
function createController<Values extends object>(
  deps: ControllerDeps<Values>,
): ListToolbarController<Values> {
  const {
    server,
    instanceId,
    adapterRef,
    startTransitionRef,
    isNavigatingRef,
    debouncedRef,
    Context,
  } = deps

  const store = createStore<ListToolbarState<Values>>(() =>
    model.createListToolbarState(server),
  )
  const issuedNavigations = new Map<number, Readonly<Values>>()
  let nextServerIsExternal = false

  // A navigation effect is run inside the controller's ONE transition, so its
  // `isNavigating` covers every control; the adapter is read fresh each call.
  function runEffect(effect: ToolbarNavigationEffect<Values>): void {
    issuedNavigations.set(effect.navigationId, effect.values)
    startTransitionRef.current(() => {
      adapterRef.current.navigate(effect)
    })
  }

  function commit(result: model.TransitionResult<Values>): void {
    store.setState(result.state, true)
    if (result.effect) runEffect(result.effect)
  }

  const setValue = (change: ToolbarChange<Values>) =>
    commit(model.setValue(store.getState(), change))

  const patch = (changes: ReadonlyArray<ToolbarChange<Values>>) =>
    commit(model.patch(store.getState(), changes))

  const reset = () => commit(model.reset(store.getState()))

  const setDraft = (change: ToolbarChange<Values>) =>
    commit(model.setDraft(store.getState(), change))

  const flushDraft = (name: keyof Values) => {
    // A synchronous flush must win over any trailing timer already scheduled.
    debouncedRef.current?.cancel()
    commit(model.flushDraft(store.getState(), name))
  }

  const cancelDraft = (name: keyof Values) => {
    debouncedRef.current?.cancel()
    commit(model.cancelDraft(store.getState(), name))
  }

  const scheduleDraftCommit = (name: keyof Values) => {
    debouncedRef.current?.(name)
  }

  const search = {
    change: <Name extends StringKeys<Values>>(change: {
      name: Name
      value: Values[Name]
    }) => {
      setDraft(change as ToolbarChange<Values>)
      scheduleDraftCommit(change.name)
    },
    enter: (name: StringKeys<Values>) => {
      debouncedRef.current?.cancel()
      flushDraft(name)
    },
    clear: (name: StringKeys<Values>) => {
      debouncedRef.current?.cancel()
      setDraft({ name, value: '' } as unknown as ToolbarChange<Values>)
      flushDraft(name)
    },
  }

  const isNavigating = () => isNavigatingRef.current

  const dispose = () => {
    store.setState(model.dispose(store.getState()), true)
  }

  // Server prop → model. Issued effects are recorded by their full values, so a
  // stale RSC echo is distinguishable from a shared link. Browser Back/Forward
  // explicitly marks the next prop external before Next renders it.
  const reconcile = (nextServer: Values) => {
    const state = store.getState()
    if (state.disposed) return
    if (nextServerIsExternal) {
      nextServerIsExternal = false
      issuedNavigations.clear()
      commit(model.reconcileExternal(state, nextServer))
      return
    }
    const issued = [...issuedNavigations.entries()].find(([, values]) =>
      equalValues(values, nextServer),
    )
    if (issued) {
      const [navigationId] = issued
      commit(model.reconcileServer(state, nextServer, navigationId))
      for (const id of issuedNavigations.keys()) {
        if (id <= navigationId) issuedNavigations.delete(id)
      }
      return
    }
    issuedNavigations.clear()
    commit(model.reconcileExternal(state, nextServer))
  }

  const markNextServerAsExternal = () => {
    nextServerIsExternal = true
  }

  // ── Bound, per-instance components — each subscribes to THIS store directly ──

  function useValue<Name extends keyof Values>(name: Name): Values[Name] {
    return useStoreWithEqualityFn(store, (s) => model.effectiveValue(s, name))
  }
  function usePending(name: keyof Values): boolean {
    return useStoreWithEqualityFn(store, (s) => model.isControlPending(s, name))
  }

  function Control<Name extends keyof Values>({
    name,
    children,
  }: {
    name: Name
    children: (args: {
      state: ControlRenderState<Values, Name>
      handleChange: (value: Values[Name]) => void
    }) => React.ReactNode
  }): React.ReactElement {
    const state = useStoreWithEqualityFn(
      store,
      (s) => ({
        value: model.effectiveValue(s, name),
        pending: model.isControlPending(s, name),
      }),
      shallow,
    )
    return (
      <>
        {children({
          state,
          handleChange: (value) =>
            setValue({ name, value } as unknown as ToolbarChange<Values>),
        })}
      </>
    )
  }

  function Subscribe<T>({
    selector,
    children,
  }: {
    selector: (state: ListToolbarState<Values>) => T
    children: (value: T) => React.ReactNode
  }): React.ReactElement {
    const value = useStoreWithEqualityFn(store, selector, shallow)
    return <>{children(value)}</>
  }

  function Search({
    name,
    label,
    placeholder,
    clearLabel,
    hint,
  }: {
    name: StringKeys<Values>
    label: string
    placeholder?: string
    clearLabel?: string
    hint?: string
  }): React.ReactElement {
    const value = useValue(name) as string
    const pending = usePending(name)
    return (
      <SearchInput
        id={`${instanceId}-${String(name)}`}
        label={label}
        value={value}
        placeholder={placeholder}
        pending={pending}
        hint={hint}
        onValueChange={(next) =>
          search.change({
            name,
            value: next as Values[StringKeys<Values>],
          })
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            search.enter(name)
          }
        }}
        // Only wire clear when named — SearchInput's clear button must not ship
        // unlabelled (see its `clearLabel` contract).
        onClear={clearLabel != null ? () => search.clear(name) : undefined}
        clearLabel={clearLabel}
      />
    )
  }

  function Select<Name extends StringKeys<Values>>({
    name,
    values,
    labels,
    className,
    ...props
  }: {
    name: Name
    values: readonly Extract<Values[Name], string>[]
    labels: Record<Extract<Values[Name], string>, string>
    'aria-label'?: string
    className?: string
  }): React.ReactElement {
    const value = useValue(name) as Extract<Values[Name], string>
    const pending = usePending(name)
    return (
      <ChoiceSelect
        id={`${instanceId}-${String(name)}`}
        aria-label={props['aria-label']}
        value={value}
        values={values}
        labels={labels}
        pending={pending}
        className={className}
        onValueChange={(next) =>
          setValue({ name, value: next } as unknown as ToolbarChange<Values>)
        }
      />
    )
  }

  function View<Name extends StringKeys<Values>>({
    name,
    options,
    ...props
  }: {
    name: Name
    options: ViewToggleOption<Extract<Values[Name], string>>[]
    'aria-label': string
  }): React.ReactElement {
    const value = useValue(name) as Extract<Values[Name], string>
    const pending = usePending(name)
    return (
      <ViewToggle
        aria-label={props['aria-label']}
        size="sm"
        value={value}
        options={options}
        className={pending ? 'opacity-70' : undefined}
        onValueChange={(next) =>
          setValue({ name, value: next } as unknown as ToolbarChange<Values>)
        }
      />
    )
  }

  const instance: ListToolbarController<Values> = {
    id: instanceId,
    store,
    setValue,
    patch,
    reset,
    setDraft,
    flushDraft,
    cancelDraft,
    scheduleDraftCommit,
    search,
    isNavigating,
    dispose,
    reconcile,
    markNextServerAsExternal,
    // Provider closes over `instance`, which is fully populated by return.
    // `instance` is the STABLE per-mount controller (the whole point — context
    // identity must never change across state updates), not a per-render object,
    // so the constructed-context-value rule is a false positive here.
    Provider: ({ children }) => (
      // eslint-disable-next-line react/jsx-no-constructed-context-values
      <Context.Provider value={instance}>{children}</Context.Provider>
    ),
    Control,
    Subscribe,
    Search,
    Select,
    View,
  }

  return instance
}

/**
 * Mint a typed toolbar scope: ONE React Context plus the hooks bound to it. Call
 * it once at module level in a feature so `useToolbarSelector` and the controller
 * share the same context.
 */
export function createListToolbarScope<Values extends object>() {
  const Context = React.createContext<ListToolbarController<Values> | null>(
    null,
  )

  function useListToolbar(
    options: UseListToolbarOptions<Values>,
  ): ListToolbarController<Values> {
    const [isNavigating, startTransition] = React.useTransition()
    const instanceId = React.useId()

    // Refs repointed every render so a changed adapter/options never recreates
    // the store — the model instance outlives every prop change but its target.
    const adapterRef = React.useRef(options.adapter)
    adapterRef.current = options.adapter
    const startTransitionRef = React.useRef(startTransition)
    startTransitionRef.current = startTransition
    const isNavigatingRef = React.useRef(isNavigating)
    isNavigatingRef.current = isNavigating
    const debouncedRef = React.useRef<{
      (name: keyof Values): void
      cancel(): void
    } | null>(null)

    const [instance] = React.useState(() =>
      createController<Values>({
        server: options.server,
        instanceId,
        adapterRef,
        startTransitionRef,
        isNavigatingRef,
        debouncedRef,
        Context,
      }),
    )

    // The trailing search commit. Its target (`flushDraft`) reads the newest
    // debouncer via `debouncedRef` set on the next line, so the mutual reference
    // (flush cancels the debounce; the debounce flushes) never captures a stale one.
    const debounced = useDebouncedCallback(
      (name: keyof Values) => instance.flushDraft(name),
      options.searchDelayMs ?? 300,
    )
    debouncedRef.current = debounced

    // Reconcile the server prop into the model whenever it CHANGES. The store is
    // already seeded from the initial server, so the first mount must not
    // reconcile — the guard ref starts at the initial key, so it no-ops until a
    // real change arrives.
    const serverKey = JSON.stringify(options.server)
    const lastServerKeyRef = React.useRef(serverKey)
    React.useEffect(() => {
      if (serverKey === lastServerKeyRef.current) return
      lastServerKeyRef.current = serverKey
      instance.reconcile(options.server)
      // `options.server` is intentionally tracked via its serialization only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverKey])

    React.useEffect(() => {
      const onPopState = () => instance.markNextServerAsExternal()
      window.addEventListener('popstate', onPopState)
      return () => window.removeEventListener('popstate', onPopState)
    }, [instance])

    // On unmount, dispose the model so any late timer/echo is inert. (The
    // debounce hook cancels its own pending run on unmount.)
    React.useEffect(() => {
      return () => instance.dispose()
    }, [instance])

    return instance
  }

  function useToolbarContext(): ListToolbarController<Values> {
    const controller = React.useContext(Context)
    if (controller === null) {
      throw new Error(
        'useToolbarContext / useToolbarSelector must be used within a <toolbar.Provider>. ' +
          'Render the subtree inside the Provider returned by useListToolbar().',
      )
    }
    return controller
  }

  function useToolbarSelector<T>(
    selector: (state: ListToolbarState<Values>) => T,
    equalityFn?: (a: T, b: T) => boolean,
  ): T {
    const controller = useToolbarContext()
    return useStoreWithEqualityFn(controller.store, selector, equalityFn)
  }

  return { useListToolbar, useToolbarContext, useToolbarSelector }
}

function equalValues<Values extends object>(
  left: Readonly<Values>,
  right: Readonly<Values>,
): boolean {
  // URL parsers recreate structured values such as `{ field, direction }` on
  // every RSC render, so reference equality would misclassify our own echo as
  // a shared-link navigation. Toolbar values are URL-serializable by contract.
  return JSON.stringify(left) === JSON.stringify(right)
}
