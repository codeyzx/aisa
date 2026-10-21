/**
 * Generic sidebar navigation contract and role filter. Application composition
 * owns concrete sections in `app/navigation.ts`; the shell renders the sections
 * it receives.
 *
 * An item declares its OWN display capability (`capability`) — the one the
 * matching page guards on, or `null` for "any signed-in session". Visibility is
 * DERIVED from that capability against the RBAC grant table (`roleCan`), the SAME
 * `ROLE_CAPABILITIES` each page's guard enforces, so the nav filter and the page
 * boundary can never disagree about who a role can reach.
 *
 * Nav hiding is UX, never a security boundary: hiding a link the reader could
 * still reach by typing its URL is not a leak — the page's own DAL guard
 * (`requireCapability` / `requireSession`) is the only thing that authorizes.
 * Never treat a missing nav item as a permission check.
 */
import { type LucideIcon } from 'lucide-react'

import { roleCan, type Capability, type Role } from '@/lib/auth/rbac'

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  /**
   * The capability the destination page guards on, or `null` for "any signed-in
   * session". Read directly by `filterNavByRole` against `roleCan` — the same
   * grant table the page's own guard enforces.
   */
  capability: Capability | null
}

export interface NavSection {
  /** Optional group heading; omitted sections render label-less. */
  title?: string
  items: NavItem[]
}

/**
 * Keep the items whose capability passes `keep`, then drop any section left
 * empty. A `null`-capability item is never filtered — it means "any signed-in
 * session", which is not a capability question.
 *
 * Shared by BOTH filters below so the drop-empty-section rule is stated once: two
 * copies would drift the day one of them learned about nested sections.
 */
function filterNav(
  sections: NavSection[],
  keep: (capability: Capability) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.capability === null || keep(item.capability),
      ),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * Keep only the items the ROLE may see. Reads `item.capability` + `roleCan`, the
 * same policy each page's guard enforces.
 */
export function filterNavByRole(
  sections: NavSection[],
  role: Role,
): NavSection[] {
  return filterNav(sections, (capability) => roleCan(role, capability))
}

/**
 * Drop items for capabilities this DEPLOYMENT has turned off — a different
 * question from what the role grants (see `lib/auth/capability-availability.ts`).
 * Takes the unavailable list as DATA rather than reading config, so this module
 * stays client-reachable; the server layout supplies it.
 *
 * Advertising a turned-off capability is worse than hiding it: the link would
 * lead to a page whose guard now redirects to /403, which reads as "you lack
 * permission" when the truth is "this deployment does not ship it".
 */
export function filterNavByAvailability(
  sections: NavSection[],
  unavailable: readonly Capability[],
): NavSection[] {
  return filterNav(sections, (capability) => !unavailable.includes(capability))
}
