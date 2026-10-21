/**
 * The sidebar's open/closed persistence contract, in the ONE module both ends
 * can import.
 *
 * `components/shell/shell-frame.tsx` is `'use client'`, so a Server Component
 * cannot read a plain constant out of it — every export of a client module becomes a
 * client reference, and reading one on the server is not a string. Yet the
 * server is exactly who has to answer "was it closed last time?", because the
 * answer must be baked into the FIRST HTML: restoring it in a client effect
 * would render the sidebar open and then snap it shut in front of the reader.
 *
 * So the contract lives here, in a directive-free module: the client writes the
 * cookie (`ShellFrame`), the server layout reads it back and hands the
 * result down as `sidebarOpen`. Neither side spells the cookie name itself —
 * a name spelled twice is persistence that silently stops persisting the day
 * one of the two is renamed.
 */

export const SIDEBAR_COOKIE_NAME = 'sidebar_state'

/** A week — long enough that "it remembered me" is the normal experience. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

/** What a visitor with no cookie yet gets. */
export const SIDEBAR_DEFAULT_OPEN = true

/**
 * Parse the persisted state. The cookie holds a stringified boolean because
 * that is what `ShellFrame` writes; anything else — a missing cookie, a
 * hand-edited value, a stale format from an older release — falls back to the
 * default rather than guessing. Closed is the state a reader had to ASK for, so
 * only the exact `'false'` produces it.
 */
export function sidebarOpenFromCookie(value: string | undefined): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return SIDEBAR_DEFAULT_OPEN
}
