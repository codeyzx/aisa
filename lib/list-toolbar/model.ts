/**
 * The pure list-toolbar model — a dependency-free state machine for a URL-backed
 * list toolbar (a search box, some filters, a sort, a page size, a view switch).
 * It knows NOTHING about React, Next, the router, Pacer, Firestore, or any
 * feature's schema; a controller (lib/list-toolbar useListToolbar) wires those in,
 * and a feature adapter turns this model's navigation EFFECTS into concrete URLs.
 * Every transition is a pure `(state, …) -> { state, effect? }`, so the whole
 * optimistic/reconciliation dance is provable without a DOM or a timer.
 *
 * The problem it solves: a control's value is SERVER state (it lives in the URL,
 * confirmed by the RSC render), but a click must feel instant. So the model keeps
 * an optimistic `display` overlay on the confirmed `server` values, tracks which
 * controls have an in-flight navigation, and reconciles the two — with
 * latest-wins handling so a slow, stale RSC echo can never stomp a newer choice.
 *
 * Cursor is deliberately absent from `Values`: it is navigation metadata owned by
 * the RSC/adapter, not a toolbar control (see the feature adapter).
 */

/**
 * A typed write. The mapped-union shape is load-bearing: a `name` can only ever
 * carry ITS OWN control's value type, so `{ name: 'pageSize', value: someSort }`
 * is a compile error, not a runtime surprise.
 */
export type ToolbarChange<Values> = {
  [Name in keyof Values]: { name: Name; value: Values[Name] }
}[keyof Values]

export interface ListToolbarState<Values> {
  /** The latest server-confirmed values (what the URL/RSC last rendered). */
  readonly server: Readonly<Values>
  /** The optimistic overlay shown to the reader while a navigation settles. */
  readonly display: Readonly<Values>
  /** In-progress, UNCOMMITTED edits (a search box mid-type) — over `display`. */
  readonly drafts: Readonly<Partial<Values>>
  /** Controls with a navigation in flight (not yet server-confirmed). */
  readonly pendingControls: ReadonlySet<keyof Values>
  /** Monotonic id of the latest navigation intent — the revision clock. */
  readonly latestNavigationId: number
  /** Once disposed, every transition is a no-op that emits no effect. */
  readonly disposed: boolean
}

/**
 * What a transition asks the controller/adapter to DO. The model never builds a
 * URL; it says "navigate so the list reflects these effective values, this is
 * revision N, and these are the controls that changed" — the adapter owns cursor
 * policy (a view switch keeps the cursor; a query change drops it) and href
 * construction.
 */
export interface ToolbarNavigationEffect<Values> {
  readonly navigationId: number
  /** The full effective values to reflect — NOT the stale server prop. */
  readonly values: Readonly<Values>
  /** Every control whose effective value differs from the confirmed server state.
   *  The adapter uses this final delta for policy such as cursor preservation. */
  readonly controls: ReadonlyArray<keyof Values>
}

export interface TransitionResult<Values> {
  readonly state: ListToolbarState<Values>
  readonly effect?: ToolbarNavigationEffect<Values>
}

/** The initial state: display mirrors server, nothing optimistic, nothing pending. */
export function createListToolbarState<Values extends object>(
  server: Values,
): ListToolbarState<Values> {
  return {
    server: { ...server },
    display: { ...server },
    drafts: {} as Partial<Values>,
    pendingControls: new Set(),
    latestNavigationId: 0,
    disposed: false,
  }
}

/** The value a reader should see for a control: a live draft wins over `display`. */
export function effectiveValue<Values, Name extends keyof Values>(
  state: ListToolbarState<Values>,
  name: Name,
): Values[Name] {
  return name in state.drafts
    ? (state.drafts[name] as Values[Name])
    : state.display[name]
}

/** The full effective values (drafts overlaid on display) — what a URL reflects. */
export function effectiveValues<Values extends object>(
  state: ListToolbarState<Values>,
): Values {
  return { ...state.display, ...state.drafts } as Values
}

export function isControlPending<Values>(
  state: ListToolbarState<Values>,
  name: keyof Values,
): boolean {
  return state.pendingControls.has(name)
}

export function isAnyPending<Values>(state: ListToolbarState<Values>): boolean {
  return state.pendingControls.size > 0
}

// A disposed model is inert: return it unchanged with no effect.
function inert<Values>(
  state: ListToolbarState<Values>,
): TransitionResult<Values> {
  return { state }
}

function withDraftDeleted<Values>(
  drafts: Readonly<Partial<Values>>,
  name: keyof Values,
): Partial<Values> {
  if (!(name in drafts)) return { ...drafts }
  const next = { ...drafts }
  delete next[name]
  return next
}

/**
 * Commit an immediate control (a filter, sort, page size, view). The optimistic
 * `display` updates NOW, any stale draft for that control is dropped, the control
 * is marked pending, the revision clock ticks, and an effect asks for navigation.
 *
 * Crucially the effect carries the FULL effective values, so a status change made
 * before a prior sort's server round-trip lands still travels WITH that sort —
 * the two optimistic choices compose instead of the later one clobbering the
 * earlier.
 */
export function setValue<Values extends object>(
  state: ListToolbarState<Values>,
  change: ToolbarChange<Values>,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  return commitChanges(state, [change])
}

/** Commit several controls as ONE navigation (one revision, one effect). */
export function patch<Values extends object>(
  state: ListToolbarState<Values>,
  changes: ReadonlyArray<ToolbarChange<Values>>,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  if (changes.length === 0) return inert(state)
  return commitChanges(state, changes)
}

function commitChanges<Values extends object>(
  state: ListToolbarState<Values>,
  changes: ReadonlyArray<ToolbarChange<Values>>,
): TransitionResult<Values> {
  const display = { ...state.display } as Values
  const writableDisplay = display as Record<keyof Values, Values[keyof Values]>
  let drafts = state.drafts
  const pendingControls = new Set(state.pendingControls)
  for (const change of changes) {
    writableDisplay[change.name] = change.value
    drafts = withDraftDeleted(drafts, change.name)
    pendingControls.add(change.name)
  }
  const navigationId = state.latestNavigationId + 1
  const nextState: ListToolbarState<Values> = {
    ...state,
    display,
    drafts,
    pendingControls,
    latestNavigationId: navigationId,
  }
  return {
    state: nextState,
    effect: {
      navigationId,
      values: { ...display },
      controls: changedKeys(state.server, display),
    },
  }
}

/**
 * Write an UNCOMMITTED draft (a keystroke in the search box). No navigation, no
 * pending, no revision tick — the draft just shadows `display` for that control
 * until `flushDraft` commits it. A draft equal to the current display value is
 * still recorded, so the box owns its own text verbatim while typing.
 */
export function setDraft<Values extends object>(
  state: ListToolbarState<Values>,
  change: ToolbarChange<Values>,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  return {
    state: {
      ...state,
      drafts: {
        ...state.drafts,
        [change.name]: change.value,
      } as Partial<Values>,
    },
  }
}

/**
 * Commit a control's draft into a navigation (a debounce firing, or Enter). If
 * there is no draft, it is a no-op with no effect — flushing nothing must not mint
 * a redundant round-trip.
 */
export function flushDraft<Values extends object>(
  state: ListToolbarState<Values>,
  name: keyof Values,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  if (!(name in state.drafts)) return inert(state)
  const change = {
    name,
    value: state.drafts[name],
  } as ToolbarChange<Values>
  return commitChanges(state, [change])
}

/**
 * Drop a control's uncommitted draft WITHOUT committing it (the reader reverts to
 * the displayed value). Used when a scheduled debounce is cancelled with nothing
 * to send. It does not abort an already-issued navigation — that is what the
 * revision reconciliation below is for.
 */
export function cancelDraft<Values extends object>(
  state: ListToolbarState<Values>,
  name: keyof Values,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  if (!(name in state.drafts)) return inert(state)
  return { state: { ...state, drafts: withDraftDeleted(state.drafts, name) } }
}

/**
 * Revert every optimistic overlay and draft back to the confirmed server values,
 * as ONE navigation (so the URL sheds the optimistic changes too). A no-op with no
 * effect when there is nothing optimistic to undo.
 */
export function reset<Values extends object>(
  state: ListToolbarState<Values>,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  const displayDirty = !shallowEqual(state.display, state.server)
  const draftsDirty = Object.keys(state.drafts).length > 0
  if (!displayDirty && !draftsDirty) return inert(state)
  if (!displayDirty) {
    return { state: { ...state, drafts: {} as Partial<Values> } }
  }
  const controls = changedKeys(state.display, state.server)
  const navigationId = state.latestNavigationId + 1
  const nextState: ListToolbarState<Values> = {
    ...state,
    display: { ...state.server },
    drafts: {} as Partial<Values>,
    pendingControls: new Set(controls),
    latestNavigationId: navigationId,
  }
  return {
    state: nextState,
    effect: {
      navigationId,
      values: { ...state.server },
      controls,
    },
  }
}

/**
 * Reconcile an RSC render that is the ECHO of a navigation WE issued. Latest-wins:
 *
 * - A stale echo (`navigationId` older than the latest intent) only records the
 *   new `server` fact; it must NOT touch `display`/`drafts`, or a slow response
 *   for an earlier choice would stomp the newer one the reader is already seeing.
 * - The latest echo confirms the optimism: `display` snaps to `server`, the
 *   controls it covered stop pending, and any draft equal to the confirmed value
 *   is cleared.
 *
 * No effect: reconciliation reacts to a render, it does not start a navigation.
 */
export function reconcileServer<Values extends object>(
  state: ListToolbarState<Values>,
  server: Values,
  navigationId: number,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  if (navigationId < state.latestNavigationId) {
    // Stale echo: keep the newer optimism, only remember the server fact.
    return { state: { ...state, server: { ...server } } }
  }
  // The latest (or a newer external-seeded) revision has landed.
  return {
    state: {
      ...state,
      server: { ...server },
      display: { ...server },
      drafts: reseedDrafts(state.drafts, server),
      pendingControls: new Set(),
    },
  }
}

/**
 * Reconcile an EXTERNAL navigation the toolbar did not issue — Back, Forward, or a
 * shared link. The optimistic overlay is meaningless against a URL the reader
 * jumped to, so it is discarded wholesale: `display` and `server` become the
 * incoming values, drafts reseed from them (the search box shows the new URL's
 * term), pending clears, and the revision clock jumps PAST every id so any
 * older in-flight echo is now stale and ignored.
 */
export function reconcileExternal<Values extends object>(
  state: ListToolbarState<Values>,
  server: Values,
): TransitionResult<Values> {
  if (state.disposed) return inert(state)
  return {
    state: {
      ...state,
      server: { ...server },
      display: { ...server },
      drafts: {} as Partial<Values>,
      pendingControls: new Set(),
      latestNavigationId: state.latestNavigationId + 1,
    },
  }
}

/** Mark the model disposed; from here every transition is inert. */
export function dispose<Values extends object>(
  state: ListToolbarState<Values>,
): ListToolbarState<Values> {
  if (state.disposed) return state
  return { ...state, disposed: true }
}

// Drop any draft that now equals the confirmed server value; keep drafts the
// reader is still actively diverging (mid-type over a just-landed value).
function reseedDrafts<Values extends object>(
  drafts: Readonly<Partial<Values>>,
  server: Values,
): Partial<Values> {
  const next: Partial<Values> = {}
  for (const key of Object.keys(drafts) as Array<keyof Values>) {
    if (!Object.is(drafts[key], server[key])) next[key] = drafts[key]
  }
  return next
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as Array<keyof T>
  return keys.every((key) => Object.is(a[key], b[key]))
}

function changedKeys<T extends object>(a: T, b: T): Array<keyof T> {
  return (Object.keys(a) as Array<keyof T>).filter(
    (key) => !Object.is(a[key], b[key]),
  )
}
