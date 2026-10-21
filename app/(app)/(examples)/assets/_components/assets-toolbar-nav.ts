'use client'

/**
 * The Assets toolbar's NAVIGATION ADAPTER — and ONLY navigation policy. It turns
 * a model navigation effect into a `router.push`, delegating URL construction to
 * `search-params.ts` (the one place any /assets link is built). Labels, options,
 * widths, and card-only visibility are NOT here; they are presentation.
 *
 * Two rules, both read off the effect's final server delta:
 * - a VIEW switch keeps the cursor (`assetsRenderHref`) — same rows, redrawn;
 * - every other change drops the cursor (`assetsViewHref`) — a cursor names a
 *   position in the OLD result set, so resuming a re-queried list from it would
 *   skip rows.
 *
 * It builds each href from the effect's EFFECTIVE values (the controller's
 * optimistic overlay), never the original RSC prop — so a status-then-sort burst
 * before the first server answer carries BOTH choices, and cursor comes from the
 * live query ref, not a stale closure.
 */

import type { useRouter } from 'next/navigation'
import type { RefObject } from 'react'

import type { ListToolbarAdapter } from '@/lib/list-toolbar'

import {
  assetsRenderHref,
  assetsViewHref,
  type AssetsQuery,
} from '../search-params'
import type { AssetsToolbarValues } from './assets-toolbar-scope'

export function createAssetsToolbarAdapter(
  router: ReturnType<typeof useRouter>,
  queryRef: RefObject<AssetsQuery>,
): ListToolbarAdapter<AssetsToolbarValues> {
  return {
    navigate: (effect) => {
      const values = effect.values
      const cursor = queryRef.current.cursor
      const isViewOnly =
        effect.controls.length === 1 && effect.controls[0] === 'view'
      // Reunite the toolbar values with the live cursor to form a full query,
      // then let the builders apply their cursor policy.
      const query: AssetsQuery = { ...values, cursor }
      router.push(
        isViewOnly
          ? assetsRenderHref(query, values.view)
          : // `{}` next: keep every value, drop only the cursor (its `Omit` type).
            assetsViewHref(query, {}),
      )
    },
  }
}
