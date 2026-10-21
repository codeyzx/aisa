import { describe, expect, it } from 'vitest'

import { SIDEBAR_DEFAULT_OPEN, sidebarOpenFromCookie } from './sidebar-cookie'

/**
 * The parser is the whole seam between a cookie the client writes and a
 * `defaultOpen` the server renders. It is asymmetric on purpose: "expanded" is
 * the state a visitor gets for free, so only the exact string a real write
 * produces may collapse the rail. Anything unrecognised — no cookie, a stale
 * format, a hand-edited value — must fall back rather than guess, because the
 * failure it prevents (a sidebar that vanishes for reasons nobody can trace) is
 * far worse than the one it accepts (a rail that opens when it could have
 * stayed shut).
 */
describe('sidebarOpenFromCookie', () => {
  it('reads back exactly what SidebarProvider writes', () => {
    // `document.cookie = ...${openState}` stringifies a boolean — these two
    // strings are the only values the app itself ever produces.
    expect(sidebarOpenFromCookie('true')).toBe(true)
    expect(sidebarOpenFromCookie('false')).toBe(false)
  })

  it('falls back to the default for a first-time visitor', () => {
    expect(sidebarOpenFromCookie(undefined)).toBe(SIDEBAR_DEFAULT_OPEN)
  })

  it('falls back rather than guessing at an unrecognised value', () => {
    // Not a truthiness check: `'0'`, `''` and `'FALSE'` are all things a
    // hand-rolled parser would silently collapse the sidebar on.
    for (const value of ['', '0', '1', 'FALSE', 'no', 'collapsed']) {
      expect(sidebarOpenFromCookie(value)).toBe(SIDEBAR_DEFAULT_OPEN)
    }
  })
})
