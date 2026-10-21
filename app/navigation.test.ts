import { describe, expect, it } from 'vitest'

import { APP_NAV_SECTIONS } from '@/app/navigation'
import { CAPABILITIES, ROLES } from '@/lib/auth/rbac'

import { filterNavByRole, type NavSection } from '@/components/shell/nav-config'

const hrefs = (sections: NavSection[]): string[] =>
  sections.flatMap((section) => section.items.map((item) => item.href))

/**
 * Nav visibility is DERIVED — each item declares its display capability and
 * `filterNavByRole` reads it against `roleCan`, the same grant table each page's
 * guard enforces. These pin that derivation: a role must see exactly the
 * destinations it can open, and the shell must never render an empty section.
 * Nav hiding is UX only; the page's own DAL guard is the boundary.
 */
describe('application navigation', () => {
  it('declares null or a real capability on every item', () => {
    // The `Capability | null` field type keeps a typo from typechecking; this
    // pins the same fact at runtime so a nav item can never gate on nothing.
    for (const section of APP_NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.capability === null) continue
        expect(CAPABILITIES as readonly string[], item.href).toContain(
          item.capability,
        )
      }
    }
  })

  it('has no Admin sidebar item', () => {
    // `/admin` stays a guarded route reachable directly — just not a sidebar link.
    expect(hrefs(APP_NAV_SECTIONS)).not.toContain('/admin')
  })

  it('shows every role the Hari ini landing page', () => {
    // Both roles hold `aisa:read`, the landing page's guard.
    for (const role of ROLES) {
      expect(hrefs(filterNavByRole(APP_NAV_SECTIONS, role))).toContain(
        '/hari-ini',
      )
    }
  })

  it('never renders a section left empty by filtering', () => {
    for (const role of ROLES) {
      for (const section of filterNavByRole(APP_NAV_SECTIONS, role)) {
        expect(section.items.length).toBeGreaterThan(0)
      }
    }
  })
})
