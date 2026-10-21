'use client'

/**
 * URL state with nuqs (see docs/reference/contracts/ui.md) — the same status filter
 * `/assets` builds by hand, so the
 * two are directly comparable. Read them side by side:
 *
 *   assets-toolbar.tsx             this file
 *   ─────────────────────────      ─────────────────────────
 *   useRouter()                    useQueryState()
 *   useTransition()                useTransition()   (only to render `pending`)
 *   useOptimistic()                —
 *   value passed down as a prop    —  reads the URL itself
 *   assetsViewHref() + router.push  —  the parser owns the key
 *
 * Three hooks become one, and two of the removals are behavioural, not cosmetic:
 *
 * - No `useOptimistic`: nuqs holds the new value in local state the moment you
 *   set it and reconciles when the server render lands. The hand-rolled control
 *   needs `useOptimistic` or it sits on the stale segment for the whole RSC
 *   round-trip and reads as dead.
 * - No `value` prop: the URL is the source of truth, so the island reads it
 *   directly. The parent RSC no longer has to parse-and-pass.
 *
 * The two options that make this work with RSC:
 * - `shallow: false` — notify the server so the Server Component re-runs and
 *   re-queries Firestore. Without it the URL changes and the list does not.
 * - `startTransition` — hands nuqs the transition so `pending` covers the whole
 *   server round-trip, not just the URL write.
 */
import { useTransition } from 'react'
import { useQueryState } from 'nuqs'

import { ChoiceSelect } from '@/components/ui/choice-select'
import { ASSET_STATUS_LABEL } from '@/features/asset/asset.schema'

import {
  stateSearchParams,
  statusFilterValues,
  type StatusFilterValue,
} from '../search-params'

/**
 * The same map `/assets` builds. Not imported from there: two independent demos
 * of one entity, and a cross-route import would tie this page's vocabulary to
 * that page's URL contract. The part worth sharing — the status names — already
 * is, via `ASSET_STATUS_LABEL`.
 */
const STATUS_FILTER_LABEL: Record<StatusFilterValue, string> = {
  all: 'Semua status',
  ...ASSET_STATUS_LABEL,
}

export function StatusFilter() {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useQueryState(
    'status',
    stateSearchParams.status.withOptions({
      shallow: false,
      startTransition,
      history: 'push',
      // Keep `?status=all` out of the URL — the default IS the absence of the
      // param, so a shared link stays clean and /state === /state?status=all.
      clearOnDefault: true,
    }),
  )

  return (
    // The SAME `ChoiceSelect` /assets renders (closed-value label, ordered
    // options, non-null guard all live there now), so the ONLY difference
    // between this file and assets-toolbar.tsx is the state strategy — the one
    // thing this page exists to demo. `setStatus` returns a Promise that settles
    // when the URL does; there is nothing to sequence after it, so it is voided.
    <ChoiceSelect
      value={status}
      values={statusFilterValues}
      labels={STATUS_FILTER_LABEL}
      aria-label="Filter aset berdasarkan status"
      className="w-[160px]"
      pending={pending}
      onValueChange={(next) => void setStatus(next)}
    />
  )
}
