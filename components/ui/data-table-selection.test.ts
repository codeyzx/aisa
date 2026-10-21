import { describe, expect, it } from 'vitest'

import {
  deselectIds,
  EMPTY_SELECTION,
  isPagePartiallySelected,
  isPageSelected,
  selectedIds,
  setPageSelected,
  toggleSelected,
  type Selection,
} from './data-table-selection'

/**
 * The selection rules are pure set logic, which is exactly the shape of thing a
 * review waves through and a test catches. Each case below names the mutation
 * that reddens it — a test that cannot fail is worse than none (the standard
 * `data-table.test.ts` sets).
 */

const active = (ids: string[]): Selection => ({
  scope: 'active',
  ids: new Set(ids),
})

describe('selectedIds', () => {
  it('returns the ids selected under the scope in hand', () => {
    expect([...selectedIds(active(['a', 'b']), 'active')]).toEqual(['a', 'b'])
  })

  it('reads EMPTY under a different filter — the prune', () => {
    // The whole scope mechanism. Mutation that reddens this: `return
    // selection.ids` unconditionally, which carries a selection made under
    // `active` into a delete fired while looking at `retired`.
    expect(selectedIds(active(['a', 'b']), 'retired').size).toBe(0)
  })

  it('starts empty', () => {
    expect(selectedIds(EMPTY_SELECTION, 'all').size).toBe(0)
  })
})

describe('toggleSelected', () => {
  it('adds an unselected id', () => {
    expect([...toggleSelected(active(['a']), 'active', 'b').ids]).toEqual([
      'a',
      'b',
    ])
  })

  it('removes a selected id', () => {
    // Mutation that reddens this: `ids.add(id)` unconditionally, which makes a
    // checkbox that can be ticked and never unticked.
    expect([...toggleSelected(active(['a', 'b']), 'active', 'a').ids]).toEqual([
      'b',
    ])
  })

  it('drops the old scope rather than merging into it', () => {
    // Toggling under a NEW filter starts from that filter's (empty) set. The
    // mutation that reddens this: seeding from `selection.ids` instead of
    // `selectedIds(selection, scope)`, which resurrects the pruned ids the
    // moment the reader ticks one box under the new filter.
    const next = toggleSelected(active(['a', 'b']), 'retired', 'c')
    expect(next.scope).toBe('retired')
    expect([...next.ids]).toEqual(['c'])
  })

  it('does not mutate the input', () => {
    // The store compares by identity; mutating in place would leave subscribers
    // unnotified. Mutation that reddens this: dropping the `new Set(...)` copy.
    const before = active(['a'])
    toggleSelected(before, 'active', 'b')
    expect(before.ids.size).toBe(1)
  })
})

describe('setPageSelected', () => {
  it('selects every row on the page, keeping ids from other pages', () => {
    // Accumulation across pages is the product rule. Mutation that reddens
    // this: seeding from an empty Set, which makes the header checkbox wipe
    // page 1's selection when pressed on page 2.
    const next = setPageSelected(
      active(['off-page']),
      'active',
      ['a', 'b'],
      true,
    )
    expect([...next.ids].toSorted()).toEqual(['a', 'b', 'off-page'])
  })

  it('clears only the page in hand', () => {
    // Mutation that reddens this: `return { scope, ids: new Set() }` on the
    // false branch — an "unselect this page" that silently means "unselect
    // everything, including rows you cannot see".
    const next = setPageSelected(
      active(['a', 'b', 'off-page']),
      'active',
      ['a', 'b'],
      false,
    )
    expect([...next.ids]).toEqual(['off-page'])
  })
})

describe('isPageSelected', () => {
  it('is true only when every row on the page is selected', () => {
    expect(isPageSelected(['a', 'b'], new Set(['a', 'b']))).toBe(true)
    // Mutation that reddens this: `.some()` instead of `.every()`, which paints
    // the header checked as soon as one row is ticked.
    expect(isPageSelected(['a', 'b'], new Set(['a']))).toBe(false)
  })

  it('ignores selected ids that are not on the page', () => {
    // Cross-page accumulation must not make the header lie about THIS page.
    expect(isPageSelected(['a'], new Set(['a', 'off-page']))).toBe(true)
  })

  it('is false for an empty page', () => {
    // `[].every()` is true. Mutation that reddens this: dropping the
    // `pageIds.length > 0` guard, which checks the header over an empty table.
    expect(isPageSelected([], new Set())).toBe(false)
  })
})

describe('isPagePartiallySelected', () => {
  it('is true when some but not all rows are selected', () => {
    // The dash state. Mutation that reddens this: `.every()` instead of
    // `.some()`, which never fires the indeterminate state and leaves the header
    // stuck on unchecked while rows below it are ticked.
    expect(isPagePartiallySelected(['a', 'b'], new Set(['a']))).toBe(true)
  })

  it('is false when NONE are selected', () => {
    expect(isPagePartiallySelected(['a', 'b'], new Set())).toBe(false)
  })

  it('is false when ALL are selected — that is checked, not partial', () => {
    // The two states must partition, never overlap. Mutation that reddens this:
    // dropping the `!isPageSelected(...)` half, which would paint a dash over a
    // fully-selected page instead of a check.
    expect(isPagePartiallySelected(['a', 'b'], new Set(['a', 'b']))).toBe(false)
  })

  it('is false for an empty page', () => {
    // Neither some nor all — an empty page has no third state to be in. Mutation
    // that reddens this: `.some()` on `[]` is already false, but a future
    // `pageIds.length === 0 ? true` shortcut would paint a dash over no rows.
    expect(isPagePartiallySelected([], new Set())).toBe(false)
  })

  it('ignores selected ids that are not on the page', () => {
    // A full page whose only off-page id is extra is still ALL-selected, never
    // partial — cross-page accumulation must not fake a mixed state here.
    expect(isPagePartiallySelected(['a'], new Set(['a', 'off-page']))).toBe(
      false,
    )
  })
})

describe('deselectIds', () => {
  it('drops exactly the ids handed to it', () => {
    // What a successful bulk delete calls. The store is module-level and
    // survives revalidation, so the ids must go or the bar counts dead rows.
    const next = deselectIds(active(['a', 'b', 'c']), ['a', 'c'])
    expect([...next.ids]).toEqual(['b'])
  })

  it('keeps the scope stamp', () => {
    // Mutation that reddens this: returning `{ scope: EMPTY_SELECTION.scope,
    // ids }`, which would silently prune the survivors on the next read.
    expect(deselectIds(active(['a', 'b']), ['a']).scope).toBe('active')
  })
})

describe('the scope mask — what it actually does', () => {
  it('hides the selection under another scope, and cannot be acted on', () => {
    // The safety property, and the only one that matters: whatever the store
    // holds, a caller under a different filter is handed nothing to delete.
    const picked = setPageSelected(
      EMPTY_SELECTION,
      'status=all',
      ['a', 'b'],
      true,
    )

    expect([...selectedIds(picked, 'status=retired')]).toEqual([])
  })

  it('RECOVERS the selection on returning to the original scope', () => {
    // Pins the honest behaviour: a scope change is a mask, not a prune. The ids
    // survive, they are just unreported. Round-trip and they are back.
    //
    // Arguably the better UX — a reader who glances elsewhere keeps their work.
    // Pinned so the next reader cannot mistake it for a bug and "fix" it into a
    // real prune without deciding to.
    const picked = setPageSelected(
      EMPTY_SELECTION,
      'status=all',
      ['a', 'b'],
      true,
    )
    expect([...selectedIds(picked, 'status=retired')]).toEqual([])

    expect([...selectedIds(picked, 'status=all')].sort()).toEqual(['a', 'b'])
  })

  it('destroys the masked ids on the first write under the new scope', () => {
    // The other half of the truth: masked until touched, then gone for real.
    // `toggleSelected` builds from `selectedIds` — empty under the new scope —
    // so the old ids cannot survive a tick.
    const picked = setPageSelected(
      EMPTY_SELECTION,
      'status=all',
      ['a', 'b'],
      true,
    )

    const ticked = toggleSelected(picked, 'status=retired', 'z')

    expect([...selectedIds(ticked, 'status=retired')]).toEqual(['z'])
    // And now the round-trip finds nothing — the re-stamp destroyed them.
    expect([...selectedIds(ticked, 'status=all')]).toEqual([])
  })
})
