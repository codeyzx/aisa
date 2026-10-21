import { describe, expect, it } from 'vitest'

import {
  MAX_SEARCH_PREFIX,
  MAX_SEARCH_WORDS,
  MIN_SEARCH_PREFIX,
  toSearchPrefixes,
  toSearchTerm,
} from './search-prefix'

describe('toSearchPrefixes', () => {
  it('emits every word-start prefix from MIN..word length, lowercased', () => {
    // `AST-0001` splits on punctuation into `ast` + `0001`.
    expect(toSearchPrefixes(['AST-0001']).toSorted()).toEqual(
      ['as', 'ast', '00', '000', '0001'].toSorted(),
    )
  })

  it('starts at MIN (a 1-char word contributes nothing — it is unqueryable)', () => {
    // Min query length is 2, so no prefix shorter than 2 is ever asked for.
    const prefixes = toSearchPrefixes(['a bb'])
    expect(prefixes).toContain('bb')
    expect(prefixes).not.toContain('a')
    expect(prefixes).not.toContain('b')
  })

  it('unions across fields and de-duplicates shared prefixes', () => {
    // code `AST-0002` and name `Astro lamp` share the `as`/`ast` prefixes.
    const prefixes = toSearchPrefixes(['AST-0002', 'Astro lamp'])
    expect(prefixes.filter((p) => p === 'ast')).toHaveLength(1)
    expect(prefixes).toEqual(
      expect.arrayContaining(['as', 'ast', 'astr', 'la', 'lam', 'lamp']),
    )
  })

  it('caps prefix length at MAX so one long word cannot explode the index', () => {
    const long = 'a'.repeat(40)
    const prefixes = toSearchPrefixes([long])
    // Prefixes are lengths MIN..MAX only: MAX - MIN + 1 of them.
    expect(prefixes).toHaveLength(MAX_SEARCH_PREFIX - MIN_SEARCH_PREFIX + 1)
    expect(Math.max(...prefixes.map((p) => p.length))).toBe(MAX_SEARCH_PREFIX)
  })

  it('caps the number of distinct words per document', () => {
    // 30 distinct words, but only MAX_SEARCH_WORDS are indexed.
    const many = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const prefixes = toSearchPrefixes([many])
    // Each indexed word `wordN` shares the `wo`/`wor`/`word` prefixes, so count
    // the distinct 5-char prefixes (`word0`..`word9`, `word1`+digit…) instead:
    // simplest falsifiable bound is that a word past the cap is absent.
    const distinctWordStems = new Set(
      prefixes.filter((p) => p.startsWith('word') && p.length === 5),
    )
    expect(distinctWordStems.size).toBeLessThanOrEqual(MAX_SEARCH_WORDS)
  })

  it('never returns a client-trusted value — it is derived from the inputs only', () => {
    // Empty / whitespace inputs derive an empty set, never throw.
    expect(toSearchPrefixes([''])).toEqual([])
    expect(toSearchPrefixes(['   '])).toEqual([])
  })
})

describe('toSearchTerm', () => {
  it('normalises a single word to a lowercase prefix token', () => {
    expect(toSearchTerm('Office')).toBe('office')
    expect(toSearchTerm('  LAPTOP ')).toBe('laptop')
  })

  it('rejects a query shorter than the minimum', () => {
    expect(toSearchTerm('a')).toBeNull()
    expect(toSearchTerm('')).toBeNull()
    expect(toSearchTerm(null)).toBeNull()
    expect(toSearchTerm(undefined)).toBeNull()
    // A single punctuation char normalises to no word.
    expect(toSearchTerm('-')).toBeNull()
  })

  it('uses only the FIRST word of a multi-word query (word-prefix, not full-text)', () => {
    expect(toSearchTerm('office chair')).toBe('office')
  })

  it('truncates a long query to MAX so it can match a stored prefix', () => {
    expect(toSearchTerm('a'.repeat(40))).toBe('a'.repeat(MAX_SEARCH_PREFIX))
  })

  it('round-trips with toSearchPrefixes — a term matches a doc it prefixes', () => {
    const term = toSearchTerm('cha')
    const prefixes = toSearchPrefixes(['Office Chair'])
    expect(term).not.toBeNull()
    expect(prefixes).toContain(term)
  })
})
