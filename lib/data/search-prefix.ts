/**
 * Firestore normalized word-prefix search — the `array-contains` scheme, and its
 * hard limits.
 *
 * A document stores, in a derived `searchPrefixes` array, every prefix (length
 * `MIN`..`MAX`) of every normalised word in its searchable fields. A query
 * normalises to ONE prefix token and asks `array-contains`. That is the whole
 * mechanism, and naming what it is NOT is half its contract:
 *
 * - **NOT full-text.** No typo tolerance, no substring match (only word-START
 *   prefixes — `chair` finds `Office Chair`, `hair` does not), no relevance rank.
 * - **First word only for a multi-word query.** `array-contains` takes ONE value,
 *   so `toSearchTerm('office chair')` searches `office`. It narrows to docs with a
 *   word starting `office`; it does not intersect the two words.
 * - **Bounded on BOTH sides.** Prefix generation caps words per doc and prefix
 *   length, so a pathological name cannot explode a document's index. A query is
 *   capped to the same `MAX`, so a term longer than the longest stored prefix
 *   still matches on its first `MAX` characters rather than silently finding
 *   nothing.
 *
 * Generic on purpose: the ALGORITHM lives here; WHICH fields feed it is the
 * feature's call (e.g. a `code` + `name` pair). Pure and
 * isomorphic — the repo derives the field server-side, the URL layer normalises
 * the query with the same rules, neither drags in server-only code.
 */

/** Shortest prefix stored and queried — equal to the UI's minimum query length. */
export const MIN_SEARCH_PREFIX = 2

/** Longest prefix stored (and the cap a longer query is truncated to). */
export const MAX_SEARCH_PREFIX = 15

/** Most distinct words one document contributes to its `searchPrefixes`. */
export const MAX_SEARCH_WORDS = 12

/** Lowercase and split into alphanumeric words; punctuation is a separator. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * The server-derived `searchPrefixes` value for a document, from its searchable
 * field values. Bounded: at most `MAX_SEARCH_WORDS` distinct words, each
 * contributing prefixes of length `MIN`..`MAX`. A word shorter than `MIN`
 * contributes nothing — it can never be a `MIN`-char query.
 *
 * DERIVE THIS ON WRITE, from the trusted field values — never accept a
 * client-supplied `searchPrefixes`. A client that could set it could make a
 * document match (or hide from) any search.
 */
export function toSearchPrefixes(values: readonly string[]): string[] {
  const seenWords = new Set<string>()
  for (const value of values) {
    for (const word of words(value)) {
      if (seenWords.size >= MAX_SEARCH_WORDS) break
      seenWords.add(word)
    }
    if (seenWords.size >= MAX_SEARCH_WORDS) break
  }

  const prefixes = new Set<string>()
  for (const word of seenWords) {
    const cap = Math.min(word.length, MAX_SEARCH_PREFIX)
    for (let length = MIN_SEARCH_PREFIX; length <= cap; length++) {
      prefixes.add(word.slice(0, length))
    }
  }
  return [...prefixes]
}

/**
 * Normalise a raw query to the single prefix token to `array-contains`, or `null`
 * when it is too short to search (`< MIN_SEARCH_PREFIX`). Takes the FIRST word of
 * a multi-word query and truncates it to `MAX_SEARCH_PREFIX`, so it addresses a
 * prefix a document could actually have stored.
 */
export function toSearchTerm(raw: string | null | undefined): string | null {
  if (!raw) return null
  const [first] = words(raw)
  if (!first || first.length < MIN_SEARCH_PREFIX) return null
  return first.slice(0, MAX_SEARCH_PREFIX)
}
