/**
 * The rules a bulk selection obeys. Pure set logic, no React, no store.
 *
 * WHY THIS IS ITS OWN MODULE, and not three functions inside the island that
 * uses them: they are the off-by-one-shaped part of bulk select — "is this page
 * fully selected", "does this id survive a filter change" — and they are only
 * testable if nothing around them needs a DOM. `data-table.tsx` keeps `nextSort`
 * and `countLabel` inline for the same reason it can: it is a SERVER module. The
 * selection rules are read by a `'use client'` island, and importing them from
 * `data-table.tsx` would drag its JSX, `next/link` and `lucide-react` into that
 * island's bundle for three set operations. Hence a sibling, and hence `.ts` —
 * vitest's `include` collects test files with that extension only.
 *
 * Deliberately NOT 'use client' and deliberately dependency-free: a Server
 * Component can read these too (the page derives nothing from them today, but
 * nothing stops it), and a module with no imports cannot pull anything in.
 *
 * THE SCOPE FIELD IS THE WHOLE DESIGN — see `selectedIds`.
 */

/**
 * A selection, STAMPED WITH THE FILTER IT WAS MADE UNDER.
 *
 * `ids` accumulates across PAGES on purpose: paging changes the window, not the
 * set the reader is picking from, so walking to page 2 must not silently drop
 * what page 1 selected. `scope` is what stops that accumulation from crossing
 * into a different QUESTION.
 */
export interface Selection {
  /**
   * Names the filtered set `ids` belong to. Mirrors the `scope` that
   * `lib/data/pagination.contract.ts` already stamps into every cursor token, for exactly
   * the same reason and with the same shape — a position (there) and a
   * selection (here) are both meaningless against a query that is not the one
   * that produced them. This is that concept reused, not a second one invented.
   */
  scope: string
  ids: ReadonlySet<string>
}

/**
 * The empty selection — what a store starts at.
 *
 * `''` is the ABSENT scope, the same spelling `lib/data/pagination.contract.ts` gives it
 * (`opts.scope ?? ''`), and it is safe as a sentinel for the same reason it is
 * safe there: a real scope names a filter, and no filter is spelled with the
 * empty string — `/assets` passes `'all' | 'active' | 'retired'`, where even the
 * unfiltered case is the WORD `all` precisely so that "no filter" and "no scope"
 * stay different values. That is a property of the callers, not something this
 * module can enforce; hand it `''` as a real scope and the empty selection would
 * read as belonging to it.
 */
export const EMPTY_SELECTION: Selection = { scope: '', ids: new Set() }

/**
 * The selected ids that are valid under `scope` — empty under any other.
 *
 * THIS IS A SCOPE PRUNE, NOT A PER-ID PRUNE. A per-id prune — `[...selected].filter(id =>
 * filteredIds.has(id))` — is only possible when the WHOLE collection is held in
 * memory, so `filteredIds` is a real set any id can be tested against. This
 * boilerplate server-paginates: the page holds ONE window (25-100
 * rows) and never learns the ids of the filtered rows it did not fetch. So for a
 * selected id that is not on screen, "does it still match the filter?" is a
 * question this code CANNOT ANSWER — answering it needs an id-only query over
 * the whole collection, which is exactly the expensive thing bulk select is
 * supposed to avoid.
 *
 * So it is coarsened to the only fact that IS knowable client-side: the filter
 * changed. It honours the RULE's intent — never act on a row that fell out of
 * the filter — by the only means server pagination leaves.
 *
 * ⚠️ THIS IS A MASK, NOT A DESTRUCTIVE PRUNE. The ids are NOT destroyed on
 * a scope change: the store still holds them, this function just stops reporting
 * them. So `all → retired → all` with nothing ticked in between returns the
 * original selection — a scope change recovers every id rather than dropping the
 * ones that no longer match.
 *
 * What IS true is the safety property, and it is the one that matters: under any
 * other scope this returns empty, so the bulk bar has nothing to show and no
 * action can name those ids. You cannot ACT on a masked selection. And the first
 * write under the new scope destroys them for real, because `toggleSelected` and
 * `setPageSelected` both build from this function's result — an empty set — and
 * re-stamp. Masked until touched, then gone.
 *
 * Resurrection-on-return is arguably the better behaviour anyway: a reader who
 * glances at another filter and comes back keeps their work.
 *
 * KNOWN LIMIT: the scope watches the filter STRING, not row
 * membership. A row someone else archives while it sits selected is still
 * selected, and a bulk delete will take it. Closing that gap needs a re-read at
 * commit time, which is a data-layer decision, not this function's.
 *
 * The scope is whatever the CALLER stamps as the result-set's identity — for
 * /assets the status filter AND the effective search term, spelled by `assetScope`
 * (the same string the cursor carries) — never the sort or the page size.
 * Re-ordering or re-windowing the same set changes which rows are on screen, not
 * which rows are in it, so a reader who selects three rows and then sorts keeps
 * their three; changing the filter OR the search yields a new scope and masks them.
 */
export function selectedIds(
  selection: Selection,
  scope: string,
): ReadonlySet<string> {
  return selection.scope === scope ? selection.ids : EMPTY_SELECTION.ids
}

/** Add `id` if absent, drop it if present. Re-stamps to `scope`. */
export function toggleSelected(
  selection: Selection,
  scope: string,
  id: string,
): Selection {
  const ids = new Set(selectedIds(selection, scope))
  // `delete` reports whether it removed anything, so this is one lookup, not a
  // `has` followed by a branch that repeats it.
  if (!ids.delete(id)) ids.add(id)
  return { scope, ids }
}

/**
 * Select or clear EXACTLY the rows in `pageIds` — the header checkbox's whole
 * reach.
 *
 * Page-scoped is a PRODUCT decision — a user cannot select rows they cannot
 * see — not a limitation of this function. It is
 * also what keeps `@tanstack/react-table`'s adoption trigger unfired: the
 * trigger names "tri-state select-all", and a header that can only ever mean
 * "this page" has no all-across-filter state to be the third of.
 *
 * Note it does not clear ids from OTHER pages — `selected: false` drops the page
 * in hand and leaves the accumulation alone.
 */
export function setPageSelected(
  selection: Selection,
  scope: string,
  pageIds: readonly string[],
  selected: boolean,
): Selection {
  const ids = new Set(selectedIds(selection, scope))
  for (const id of pageIds) {
    if (selected) ids.add(id)
    else ids.delete(id)
  }
  return { scope, ids }
}

/**
 * Whether EVERY row on the page in hand is selected — the header checkbox's
 * checked state.
 *
 * An empty page is NOT "all selected", hence the length guard: `[].every()` is
 * `true`, which would paint a checked header over a table with no rows.
 *
 * The guard is load-bearing: `DataTable` keeps its headers over a zero-row
 * table and swaps only the body, so that header checkbox is on screen with no
 * rows under it. Leave the guard in regardless — this function must not depend
 * on a caller's rendering staying put.
 */
export function isPageSelected(
  pageIds: readonly string[],
  ids: ReadonlySet<string>,
): boolean {
  return pageIds.length > 0 && pageIds.every((id) => ids.has(id))
}

/**
 * Whether the page in hand is PARTIALLY selected — some rows, but not all. The
 * header checkbox's third, `indeterminate`, state (the dash), sitting between
 * `isPageSelected` (all → checked) and no selection (none → unchecked).
 *
 * "Some but not all", spelled as `some && !isPageSelected`, so the three states
 * partition cleanly and cannot overlap: a full page is `isPageSelected`, never
 * partial; an empty page is neither (both `.some()` and `isPageSelected` are
 * false for it, so the guard the sibling documents carries straight through).
 * Reusing `isPageSelected` for the "all" half means the two can never disagree
 * about where "all" ends and "partial" begins.
 */
export function isPagePartiallySelected(
  pageIds: readonly string[],
  ids: ReadonlySet<string>,
): boolean {
  return pageIds.some((id) => ids.has(id)) && !isPageSelected(pageIds, ids)
}

/**
 * Drop `removed` from the selection, keeping the scope stamp.
 *
 * This is what a successful bulk mutation calls: the store outlives the server
 * round-trip (it is a module-level store, not component state), so ids deleted
 * from Firestore would otherwise sit in the set forever — a bar reading "5
 * selected" over five rows that no longer exist, and a retry that targets them.
 */
export function deselectIds(
  selection: Selection,
  removed: readonly string[],
): Selection {
  const ids = new Set(selection.ids)
  for (const id of removed) ids.delete(id)
  return { scope: selection.scope, ids }
}
