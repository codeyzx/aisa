/**
 * The layering boundary, enforced on the resolved compiler graph.
 *
 * Ports the ast-grep rules `no-import-feature-or-app-from-shared` and
 * `no-import-app-from-feature` from string-matching to the real import graph, so
 * an alias (`@/features/x`) and a relative climb (`../features/x`) are the SAME
 * edge — both resolve to the same file and are classified by where that file
 * lives, not how the importer spelled it.
 *
 *   - shared (`lib/`, `components/`, `hooks/`) may NOT import feature or app.
 *   - feature (`features/`) may NOT import app.
 *
 * WHY: shared code is domain-agnostic by contract — swap the feature out and it
 * still builds; a feature reaching into `app/` inverts the delivery seam. Both
 * breaks typecheck, lint and build perfectly green and only surface in a fork.
 * Type-only edges still count: a `import type` from shared into a feature couples
 * the domain shape just as a value import does.
 */
import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'

type Tier = 'shared' | 'feature' | 'app' | 'other'

function tierOf(rel: string): Tier {
  if (
    rel.startsWith('lib/') ||
    rel.startsWith('components/') ||
    rel.startsWith('hooks/')
  ) {
    return 'shared'
  }
  if (rel.startsWith('features/')) return 'feature'
  if (rel.startsWith('app/')) return 'app'
  return 'other'
}

/** Tiers a given tier must never import. */
const FORBIDDEN: Record<Tier, Tier[]> = {
  shared: ['feature', 'app'],
  feature: ['app'],
  app: [],
  other: [],
}

export const check: Check = {
  id: 'import-direction',
  describe:
    'shared must not import feature/app; feature must not import app (ports the ast-grep layering rules)',
  run(program: StructureProgram) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const fromRel = program.rel(sf.fileName)
      const fromTier = tierOf(fromRel)
      const forbidden = FORBIDDEN[fromTier]
      if (forbidden.length === 0) continue

      for (const edge of program.importEdges(sf)) {
        if (!edge.resolved) continue
        const toRel = program.rel(edge.resolved)
        // Only edges that land back inside the tree can violate layering.
        if (toRel.startsWith('..')) continue
        const toTier = tierOf(toRel)
        if (forbidden.includes(toTier)) {
          violations.push({
            file: fromRel,
            contract: 'import-direction',
            detail: `${fromTier} code imports ${toTier} code ('${edge.spec}' → ${toRel})`,
          })
        }
      }
    }
    return violations
  },
}
