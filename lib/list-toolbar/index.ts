/**
 * The list-toolbar public surface — flat re-exports, CLIENT ONLY. A feature
 * imports the scope factory, the layout shell, and the model's pure API from here.
 *
 * No dotted compound (`ListToolbar.Root`): exports stay flat so a 'use client'
 * consumer never trips the client-reference `.Root === undefined` trap. And no
 * server-only module is dragged in — model.ts is dependency-free, scope/layout
 * are 'use client'.
 */

export {
  createListToolbarScope,
  type ListToolbarAdapter,
  type ListToolbarController,
  type UseListToolbarOptions,
} from './scope'

export {
  ListToolbarRoot,
  ListToolbarRow,
  ListToolbarLeading,
  ListToolbarControls,
  ListToolbarFooter,
} from './toolbar-layout'

export {
  createListToolbarState,
  setValue,
  patch,
  setDraft,
  flushDraft,
  cancelDraft,
  reset,
  reconcileServer,
  reconcileExternal,
  dispose,
  effectiveValue,
  effectiveValues,
  isControlPending,
  isAnyPending,
  type ListToolbarState,
  type ToolbarChange,
  type ToolbarNavigationEffect,
  type TransitionResult,
} from './model'
