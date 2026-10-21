import { Package } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import {
  filterNavByAvailability,
  filterNavByRole,
  type NavSection,
} from './nav-config'

// A real LucideIcon — `icon` is required on NavItem, and the filters never read
// it, so any concrete icon keeps the fixtures honest to the type.
const icon = Package

/**
 * The two nav filters answer DIFFERENT questions and must compose: `byRole` is
 * "may this person", `byAvailability` is "does this deployment ship it". A
 * capability turned off by config must disappear for EVERY role, including an
 * admin whose role grants it — which is the case a role-only filter cannot cover.
 */
const SECTIONS: NavSection[] = [
  {
    title: 'Main',
    items: [
      { title: 'Home', href: '/dashboard', icon, capability: null },
      {
        title: 'Accounts',
        href: '/admin/accounts',
        icon,
        capability: 'aisa:respond',
      },
    ],
  },
  {
    title: 'Audit only',
    items: [
      {
        title: 'Audit',
        href: '/admin/audit',
        icon,
        capability: 'aisa:configure',
      },
    ],
  },
]

describe('filterNavByAvailability', () => {
  it('drops an item whose capability the deployment has turned off', () => {
    const result = filterNavByAvailability(SECTIONS, ['aisa:configure'])

    expect(result.flatMap((s) => s.items.map((i) => i.href))).toEqual([
      '/dashboard',
      '/admin/accounts',
    ])
  })

  it('drops a section left empty, rather than rendering a headed void', () => {
    const result = filterNavByAvailability(SECTIONS, ['aisa:configure'])

    expect(result.map((section) => section.title)).toEqual(['Main'])
  })

  it('never filters a null-capability item — that is not a capability question', () => {
    // Catches a filter that treats `null` as "no capability granted" and hides
    // the one entry every signed-in session must keep.
    const result = filterNavByAvailability(SECTIONS, [
      'aisa:configure',
      'aisa:respond',
    ])

    expect(result).toEqual([{ title: 'Main', items: [SECTIONS[0].items[0]] }])
  })

  it('changes nothing when every capability is available', () => {
    expect(filterNavByAvailability(SECTIONS, [])).toEqual(SECTIONS)
  })

  it('hides a turned-off capability even from an admin who is granted it', () => {
    // The composition that matters. `admin` holds `admin:audit:read`, so the role filter
    // alone keeps the audit entry — only the availability filter removes it.
    expect(
      filterNavByRole(SECTIONS, 'admin').flatMap((s) =>
        s.items.map((i) => i.href),
      ),
    ).toContain('/admin/audit')

    const composed = filterNavByAvailability(
      filterNavByRole(SECTIONS, 'admin'),
      ['aisa:configure'],
    )

    expect(composed.flatMap((s) => s.items.map((i) => i.href))).not.toContain(
      '/admin/audit',
    )
  })
})
