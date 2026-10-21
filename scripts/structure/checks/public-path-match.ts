/**
 * Every navigation destination must resolve to a real route.
 *
 * The sidebar declares `href` targets in `app/navigation.ts`. A link to a path
 * with no `page.tsx` is a dead nav item — it typechecks, renders, and 404s only
 * when clicked. This maps each declared href to the App Router URL of an actual
 * `page.tsx` and flags any href with no match.
 *
 * URL derivation strips the segments the router ignores: route groups `(group)`,
 * parallel slots `@slot`, and interception markers `(.)`, `(..)`, `(...)`.
 * Dynamic segments (`[id]`) are kept verbatim — a literal nav href never targets
 * one, so it simply won't match, which is the correct outcome.
 */
import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { propertyStringValues } from '../ast.ts'

/** Files that may declare concrete nav hrefs, by rel path. */
const NAV_SOURCES = ['app/navigation.ts', 'components/shell/nav-config.ts']

/** App Router URL for a `page.tsx`, or undefined if it is not a routable page. */
function routeUrl(pageRel: string): string | undefined {
  const dir = pageRel.replace(/\/page\.tsx?$/, '')
  if (!dir.startsWith('app')) return undefined
  const segments = dir
    .split('/')
    .slice(1) // drop leading `app`
    .filter((segment) => {
      if (segment.startsWith('(') && segment.endsWith(')')) return false // route group / interception
      if (segment.startsWith('@')) return false // parallel slot
      return segment.length > 0
    })
  return '/' + segments.join('/')
}

export const check: Check = {
  id: 'public-path-match',
  describe: 'every declared nav href resolves to a real `page.tsx` route',
  run(program: StructureProgram) {
    // Actual routable URLs in the tree.
    const routes = new Set<string>()
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (/(^|\/)page\.tsx?$/.test(rel)) {
        const url = routeUrl(rel)
        if (url) routes.add(url)
      }
    }

    // Declared hrefs across the nav sources.
    const violations: Violation[] = []
    for (const navRel of NAV_SOURCES) {
      const sf = program.byRel(navRel)
      if (!sf) continue
      const hrefs = propertyStringValues(sf, 'href')
      for (const href of hrefs) {
        // Only internal app paths are route-checked; external/anchor links pass.
        if (!href.startsWith('/')) continue
        if (!routes.has(href)) {
          violations.push({
            file: navRel,
            contract: 'public-path-match',
            detail: `nav href '${href}' has no matching page.tsx route`,
          })
        }
      }
    }
    return violations
  },
}
