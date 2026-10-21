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

  it('has no Admin sidebar item — impersonation moved to the user dropdown', () => {
    // The product decision: the Admin nav entry is gone, but `/admin` stays a
    // guarded route (its own direct/no-JS fallback) — just not a sidebar link.
    expect(hrefs(APP_NAV_SECTIONS)).not.toContain('/admin')
  })

  it('shows an admin every capability-gated destination', () => {
    const visible = hrefs(filterNavByRole(APP_NAV_SECTIONS, 'admin'))
    expect(visible).toEqual(
      expect.arrayContaining([
        '/dashboard',
        '/assets',
        '/ai',
        '/export',
        '/storage',
        '/realtime',
        '/state',
      ]),
    )
  })

  it('hides admin-only demos from a plain user, keeps the read-only ones', () => {
    // `user` holds asset:read + storage:read only, so the derivation must let
    // through exactly the read halves and refuse the write/export ones.
    const visible = hrefs(filterNavByRole(APP_NAV_SECTIONS, 'user'))
    expect(visible).toContain('/dashboard') // null capability — any session
    expect(visible).toContain('/assets') // asset:read
    expect(visible).toContain('/realtime') // asset:read
    expect(visible).toContain('/state') // asset:read
    expect(visible).not.toContain('/ai') // asset:write
    expect(visible).not.toContain('/export') // export:read (admin-only)
    expect(visible).not.toContain('/storage') // storage:write (admin-only)
  })

  it('never renders a section left empty by filtering', () => {
    for (const role of ROLES) {
      for (const section of filterNavByRole(APP_NAV_SECTIONS, role)) {
        expect(section.items.length).toBeGreaterThan(0)
      }
    }
  })
})
