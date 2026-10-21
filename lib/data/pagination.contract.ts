/**
 * Database-NEUTRAL cursor pagination contract + codec. No Firebase, no
 * `server-only`, no Node-only APIs — safe to import from either side of the RSC
 * boundary and to unit-test without an emulator. The Firestore query execution
 * that CONSUMES this contract lives in the adapter (`pagination.firestore.ts`);
 * the persistence fork replaces that adapter and keeps this file unchanged.
 *
 * The cursor is an opaque base64url token encoding `{ sort, scope, sortValue,
 * docId, nav }`. The doc id is the stable tiebreaker so results never skip or
 * repeat across rows that share a sort value.
 *
 * A CURSOR BELONGS TO ONE SORT WITHIN ONE SCOPE, and both travel with it. A
 * token names a POSITION, and a position only means something relative to the
 * ordered, filtered set it was measured in:
 *
 * - Different FIELD: usually throws downstream on a value/field type mismatch.
 * - Different DIRECTION: nothing throws — the same value with the scan reversed
 *   silently returns the rows on the OTHER side of it, a plausible wrong page.
 * - Different SCOPE: nothing throws — resumes one filter's set from an offset
 *   counted through another's.
 *
 * So `decodeCursor` cannot be called without naming the sort AND scope it is
 * decoded FOR; a token minted under any other decodes to `null` — treated exactly
 * like a malformed token, so paging restarts at the first page. `null` is the one
 * answer for every unusable token (malformed, wrong shape, wrong ordering, wrong
 * filter) because the caller's response to each is identical: there is no position
 * to resume from. This matches how a `?cursor` reaches us — a bookmarked or
 * hand-edited view position, the same class of input as `?status`, which must land
 * on page one, never a 500.
 */

export interface Page<T> {
  items: T[]
  /** Resume forward from the last row, or `null` on the last page. */
  nextCursor: string | null
  /** Resume backward from the first row, or `null` on the first page. */
  prevCursor: string | null
}

export type SortDirection = 'asc' | 'desc'

/** Identifies the ordered result set a cursor names a position in. */
export interface CursorSort {
  field: string
  direction: SortDirection
}

/** A JSON-safe boxed sort value: scalars pass through, Timestamps become `{ __ts }`. */
export type SortValue = string | number | boolean | { __ts: number }

/**
 * Firestore's representable `Timestamp` range in epoch millis: `0001-01-01` to
 * `9999-12-31`. A decoded `__ts` outside this range — or a non-finite one from a
 * hand-edited `?cursor` — would throw when the adapter rebuilds it during
 * `startAfter`, turning a stale token into a 500 instead of the page-one restart
 * this contract promises. So the bound is checked at decode, not left to the query.
 */
const MIN_TIMESTAMP_MS = -62_135_596_800_000
const MAX_TIMESTAMP_MS = 253_402_300_799_999

/** A finite `__ts` inside Firestore's representable `Timestamp` range. */
export function isBoxedTimestamp(ms: unknown): ms is number {
  return (
    typeof ms === 'number' &&
    Number.isFinite(ms) &&
    ms >= MIN_TIMESTAMP_MS &&
    ms <= MAX_TIMESTAMP_MS
  )
}

export interface Cursor {
  /**
   * The result set this token names a position in. A cursor is a POSITION, and a
   * position only means something relative to the set it was measured in — so
   * BOTH halves of that set's identity travel with it: how it was ordered, and
   * what it was filtered to.
   */
  sort: CursorSort
  scope: string
  sortValue: SortValue
  docId: string
  /**
   * How to RESUME from this anchor: `'next'` scans forward (`startAfter`), `'prev'`
   * scans backward (`endBefore` + `limitToLast`). Distinct from `sort.direction`
   * (asc/desc): a `'prev'` cursor lists in the SAME sort order — it just anchors on
   * the current page's FIRST row and fills the page before it.
   */
  nav: 'next' | 'prev'
}

// Portable base64url — `btoa`/`atob`/`TextEncoder`/`TextDecoder` are globals in
// both Node (>=16) and browsers, so the codec carries no Node `Buffer` dependency
// and stays honestly client-safe.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(token: string): string {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  // `atob` throws on invalid base64 — decodeCursor's try/catch turns that into a
  // page-one restart, exactly as a malformed JSON payload would.
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Encode an opaque cursor from a sort value + doc id. Pure — no I/O. */
export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify(cursor))
}

/** Narrow a decoded `sort` to a real `CursorSort`. */
function isCursorSort(value: unknown): value is CursorSort {
  if (typeof value !== 'object' || value === null) return false
  const { field, direction } = value as Record<string, unknown>
  return (
    typeof field === 'string' && (direction === 'asc' || direction === 'desc')
  )
}

/**
 * Decode an opaque cursor MINTED UNDER `sort` WITHIN `scope`, or `null`. Pure.
 *
 * Both are required arguments, not courtesy checks: together they are the whole
 * reason a caller cannot resume one result set from another one's token. `null`
 * covers every way a token is unusable — malformed, wrong shape, wrong ordering,
 * wrong filter — because the caller's response to each is identical: there is no
 * position to resume from, so start at the beginning.
 */
export function decodeCursor(
  token: string,
  sort: CursorSort,
  scope: string,
): Cursor | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(token))
  } catch {
    return null
  }
  // No `'sort' in parsed` alongside these: `isCursorSort` below already rejects
  // a missing sort (`undefined` is not an object), so listing it here would be a
  // second guard on the same fact — one that no mutation can redden.
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('sortValue' in parsed) ||
    !('docId' in parsed)
  ) {
    return null
  }
  const {
    sort: tokenSort,
    scope: tokenScope,
    sortValue,
    docId,
    nav: tokenNav,
  } = parsed as Record<string, unknown>
  const validSortValue =
    typeof sortValue === 'string' ||
    (typeof sortValue === 'number' && Number.isFinite(sortValue)) ||
    typeof sortValue === 'boolean' ||
    (typeof sortValue === 'object' &&
      sortValue !== null &&
      isBoxedTimestamp((sortValue as { __ts?: unknown }).__ts))
  // A doc id is the last segment of a real document ref: always non-empty and
  // never containing `/`. A forged empty or slash-bearing id would reach
  // `startAfter` and throw in the SDK, so reject it here as unusable → page one.
  const validDocId =
    typeof docId === 'string' && docId.length > 0 && !docId.includes('/')
  if (!validSortValue || !validDocId) return null
  // A token minted before `scope`/`nav` existed carries none. Absent must NOT read
  // as "matches anything" — that is exactly the hole this closes.
  if (typeof tokenScope !== 'string') return null
  if (tokenNav !== 'next' && tokenNav !== 'prev') return null
  if (!isCursorSort(tokenSort)) return null
  // ALL THREE matter: a wrong field usually throws downstream on a type mismatch;
  // a wrong direction never throws and just serves the rows on the other side; a
  // wrong scope never throws and serves rows counted through a different set.
  if (
    tokenSort.field !== sort.field ||
    tokenSort.direction !== sort.direction ||
    tokenScope !== scope
  ) {
    return null
  }
  return {
    sort: tokenSort,
    scope: tokenScope,
    sortValue: sortValue as SortValue,
    docId,
    nav: tokenNav,
  }
}
