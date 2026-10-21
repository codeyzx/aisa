import { describe, expect, it } from 'vitest'

import { ariaSort, countLabel, nextSort } from './data-table'

/**
 * `countLabel` is the only part of the table that does arithmetic on what the
 * reader is told, so it is the only part with a unit test. Each case below is
 * pinned to a mutation that makes it fail — a test that cannot fail is worse
 * than none (lib/format shipped with zero tests and a deletable timeZone pin).
 */
describe('countLabel', () => {
  it('reports the page against the filtered total', () => {
    // Mutation that reddens this: `dari ${total}` instead of `dari ${filtered}`.
    expect(countLabel({ shown: 20, filtered: 87, total: 87 })).toBe(
      'Menampilkan 20 dari 87',
    )
  })

  it('stays silent about filtering when nothing is filtered out', () => {
    // The clause is gated on `total > filtered`. Mutation that reddens this:
    // relaxing it to `>=` (or `!==`), which appends "(disaring dari 87)" to
    // every unfiltered page — a filter notice where there is no filter.
    expect(countLabel({ shown: 5, filtered: 5, total: 5 })).not.toContain(
      'disaring dari',
    )
  })

  it('names the pre-filter total once a filter narrows the set', () => {
    // Mutations that redden this: dropping the clause; swapping the operands
    // (`filtered` and `total` are both plain numbers, so a swap typechecks
    // cleanly and reads plausibly — exactly the bug review misses).
    expect(countLabel({ shown: 20, filtered: 87, total: 120 })).toBe(
      'Menampilkan 20 dari 87 (disaring dari 120)',
    )
  })

  it('groups large counts with id-ID separators', () => {
    // Proves `formatNumber` (id-ID) is actually wired into the label, not just
    // string interpolation: the thousands separator is a DOT. A raw
    // `${filtered}` would render `1234`, not `1.234`, and redden this.
    expect(countLabel({ shown: 100, filtered: 1234, total: 56789 })).toBe(
      'Menampilkan 100 dari 1.234 (disaring dari 56.789)',
    )
  })

  it('still reports the denominator when the filter matches nothing', () => {
    // Zero rows is when the denominator matters
    // MOST, because the filter is the reason the table is empty. Mutation that
    // reddens this: an `if (shown === 0) return 'No rows'` early return — the
    // "helpful" special case that throws the explanation away.
    expect(countLabel({ shown: 0, filtered: 0, total: 120 })).toBe(
      'Menampilkan 0 dari 0 (disaring dari 120)',
    )
  })

  it('says nothing about filtering on a genuinely empty collection', () => {
    // Zero rows with nothing filtered: there is no denominator to explain, so
    // the clause must not appear. Distinguishes "your filter hid them" from
    // "there is nothing here" — the same distinction the empty state draws.
    expect(countLabel({ shown: 0, filtered: 0, total: 0 })).toBe(
      'Menampilkan 0 dari 0',
    )
  })
})

/**
 * The header's half of sorting. `nextSort` decides what a click MEANS; the page
 * turns that into a URL and the server re-queries. It is pure for the same
 * reason `countLabel` is: a direction flip reads correct in review whichever way
 * round it is written.
 */
describe('nextSort', () => {
  it('flips the active column', () => {
    // Mutation that reddens this: returning `active` unchanged, or always
    // 'desc' — a header that will not toggle, which looks like a dead link.
    expect(
      nextSort('createdAt', { field: 'createdAt', direction: 'desc' }),
    ).toEqual({
      field: 'createdAt',
      direction: 'asc',
    })
    expect(
      nextSort('createdAt', { field: 'createdAt', direction: 'asc' }),
    ).toEqual({
      field: 'createdAt',
      direction: 'desc',
    })
  })

  it('opens an inactive column at "most first"', () => {
    // Not arbitrary: the standard only admits columns that answer "which is the
    // most X", so the first click should show the most. Newest date,
    // biggest amount. Mutation that reddens this: defaulting to 'asc', which
    // opens a Created column on the oldest rows nobody asked about.
    expect(
      nextSort('amount', { field: 'createdAt', direction: 'asc' }),
    ).toEqual({
      field: 'amount',
      direction: 'desc',
    })
  })

  it('does not carry the old column direction to a new column', () => {
    // Mutation that reddens this: `{ field, direction: active.direction }` for
    // the inactive branch — plausible, and it makes the first click on a column
    // depend on which column you clicked last.
    expect(
      nextSort('amount', { field: 'createdAt', direction: 'asc' }).direction,
    ).toBe('desc')
  })
})

describe('ariaSort', () => {
  it('names the direction of the sorted column', () => {
    // ARIA's words, not ours. Mutation that reddens this: passing 'asc'/'desc'
    // straight through — a screen reader announces nothing at all, silently, and
    // the table still looks perfect.
    expect(ariaSort(true, 'asc')).toBe('ascending')
    expect(ariaSort(true, 'desc')).toBe('descending')
  })

  it('says "none" for a sortable column that is not the active one', () => {
    // "none" means sortable-but-unsorted, which is why the table passes
    // `undefined` (not this function's output) for a column that cannot sort at
    // all. Mutation that reddens this: returning the direction regardless of
    // `active`, which claims every column is sorted at once.
    expect(ariaSort(false, 'desc')).toBe('none')
  })
})
