'use client'

/**
 * The Assets list-toolbar SCOPE: the typed value set, the query→values
 * projection, and the one `createListToolbarScope` instance the feature shares.
 * Kept apart from navigation policy (assets-toolbar-nav.ts) and presentation /
 * composition (assets-toolbar.tsx) so each concern reads on its own.
 *
 * Cursor is deliberately NOT a toolbar value — it is navigation metadata the RSC
 * owns and the adapter threads. The controls here are exactly `q`, `status`,
 * `sort`, `pageSize`, and `view`.
 */

import { createListToolbarScope } from '@/lib/list-toolbar'
import type { AssetSort } from '@/features/asset/asset.schema'

import type {
  AssetPageSize,
  AssetsQuery,
  AssetsStatusFilterValue,
  AssetsView,
} from '../search-params'

/** The five toolbar controls, as a value set the model is generic over. */
export interface AssetsToolbarValues {
  q: string
  status: AssetsStatusFilterValue
  /** Structured — bound through `toolbar.Control`, serialized only for its UI. */
  sort: AssetSort
  pageSize: AssetPageSize
  view: AssetsView
}

/** Project the server-rendered query onto the toolbar values, dropping cursor. */
export function toAssetsToolbarValues(query: AssetsQuery): AssetsToolbarValues {
  return {
    q: query.q,
    status: query.status,
    sort: query.sort,
    pageSize: query.pageSize,
    view: query.view,
  }
}

/**
 * The ONE scope for the Assets toolbar. `useAssetsToolbar` builds the controller;
 * `useAssetsToolbarContext` / `useAssetsToolbarSelector` let descendants in other
 * files (the search field, the card sort) read a control's slice without prop
 * drilling.
 */
export const {
  useListToolbar: useAssetsToolbar,
  useToolbarContext: useAssetsToolbarContext,
  useToolbarSelector: useAssetsToolbarSelector,
} = createListToolbarScope<AssetsToolbarValues>()
