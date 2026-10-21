/**
 * Every `app/(app)/**` page must resolve through an auth guard.
 *
 * Pages under the `(app)` group are the signed-in surface; each must gate on the
 * session before it renders. The guard helpers are the exported functions of
 * `lib/auth/guards.ts` (currently `requireCapability`) plus `requireSession`
 * (the bare-session guard in `lib/auth/session.ts`) — read off the tree, not
 * hard-coded, so a new guard is picked up automatically.
 *
 * SHALLOW BY DESIGN: "resolves through a guard" is proven by a page importing
 * AND calling a guard name. Indirect guarding — a page left bare because a
 * shared layout gates it — is NOT proven here and would report a false pass, so
 * do not read a green result as "every page is guarded somehow". Pages that
 * legitimately hold no guard — the parallel-route modal slots that render
 * `null` — are recorded as specific exemptions, never silenced by a broad glob.
 */
import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { callsAnyOf, exportedFunctionDeclarations } from '../ast.ts'

function guardNames(program: StructureProgram): Set<string> {
  const names = new Set<string>(['requireSession'])
  const guards = program.byRel('lib/auth/guards.ts')
  if (guards) {
    for (const fn of exportedFunctionDeclarations(guards)) {
      if (fn.name) names.add(fn.name.text)
    }
  }
  return names
}

export const check: Check = {
  id: 'route-guard-inventory',
  describe:
    'every app/(app)/** page imports and calls an auth guard (guarding via a shared layout is not proven)',
  run(program: StructureProgram) {
    const guards = guardNames(program)
    const violations: Violation[] = []

    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!rel.startsWith('app/(app)/')) continue
      if (!/(^|\/)page\.tsx?$/.test(rel)) continue

      const imported = new Set(
        program.importEdges(sf).flatMap((edge) => edge.names),
      )
      const importsGuard = [...guards].some((name) => imported.has(name))
      const callsGuard = callsAnyOf(sf, guards)

      if (!importsGuard || !callsGuard) {
        violations.push({
          file: rel,
          contract: 'route-guard-inventory',
          detail: `page does not import+call an auth guard (${[...guards].join(', ')})`,
        })
      }
    }
    return violations
  },
}
