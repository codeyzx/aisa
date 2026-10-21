/**
 * The URL-state contract for /state (see docs/reference/contracts/ui.md) — declared
 * ONCE and imported by both sides:
 * the Server Component reads it through `loadStateSearchParams`, the client
 * island writes it through `stateSearchParams.status`. Same parser, same
 * default, same key.
 *
 * That single declaration is the main thing nuqs buys over hand-rolling, and
 * `/assets` makes the same point: rather than spelling its contract twice —
 * `page.tsx` parsing `?status` by hand while a status filter re-builds it from a
 * `/assets?status=${next}` template, with nothing linking the two — it declares
 * its own `search-params.ts` exactly like this one. What is left to compare is
 * the WRITE side, not the declaration: see `_components/status-filter.tsx`.
 *
 * NOT a client/server hazard: `nuqs/server` is isomorphic (parsers + a loader,
 * no framework imports), so this module is safe to pull into a 'use client'
 * island. `AssetStatusSchema` is likewise schema-only — it never reaches
 * firebase-admin.
 */
import { createLoader, parseAsStringLiteral } from 'nuqs/server'

import { AssetStatusSchema } from '@/features/asset/asset.schema'
import { parseAsStrictSingle } from '@/lib/search-param'

/**
 * The filter widens the entity's own status set with an unfiltered option. The
 * statuses are derived from the schema, never hand-listed — the enum already
 * owns that set, and a literal copy here would be a parallel taxonomy.
 */
export const statusFilterValues = ['all', ...AssetStatusSchema.options] as const

export type StatusFilterValue = (typeof statusFilterValues)[number]

/**
 * `parseAsStringLiteral` narrows to the union AND handles the invalid case the
 * way a view preference should: an unrecognized `?status=nope` falls back to the
 * default rather than throwing. Same policy as /assets, but declared once.
 */
export const stateSearchParams = {
  status: parseAsStrictSingle(
    parseAsStringLiteral(statusFilterValues),
  ).withDefault('all'),
}

/** RSC-side reader. Accepts the Next 16 `searchParams` Promise directly. */
export const loadStateSearchParams = createLoader(stateSearchParams)
