/**
 * A collection path reaches the typed accessor as a NAMED CONSTANT, never as an
 * inline string literal.
 *
 * `docs/reference/contracts/data.md` states the rule: the owning feature or
 * infrastructure module exports the dependency-free path constant, and the
 * accessor binds it — "never a second spelling of the path string". A call
 * spelled `typedCollection('widgets', WidgetSchema)` leaves the path with no
 * importable name, so the next reader who needs it (a repo, a seed script, a
 * migration) retypes it. Two spellings of one path typecheck on both sides, and
 * the drift is silent in the worst way Firestore fails: a wrong path reads an
 * EMPTY collection instead of throwing, so the symptom is "no results", not an
 * error.
 *
 * SCOPE IS THE WHOLE PROGRAM, with no path predicate. Every call in the tree —
 * feature and infrastructure alike
 * (`lib/audit/account-audit.repo.ts`, `lib/repos/counter.repo.ts`,
 * `lib/auth/revocation.ts`) — already passes a constant, so there is no tier
 * where an inline path is legitimate and nothing to carve out. Reading no file
 * outside the program root is also what lets this check mean something over the
 * generated entity tree in `check-templates.ts`, where a repo-relative
 * vocabulary would resolve to nothing and report a pass that inspected nothing.
 *
 * WHAT IT DELIBERATELY DOES NOT PROVE:
 *  - Not WHERE the constant lives, nor that it is dependency-free. It sees an
 *    identifier at the call site, not the module that declared it; the
 *    `<entity>.path.ts` convention is the contract's, and a human's to hold.
 *  - Not that two constants hold different strings — this is a check on
 *    spelling at the call site, not on values.
 *  - Not whether reaching for `rawCollection` was justified. That hatch stays
 *    open and stays audited by NAME (`rg rawCollection`); whether a call has any
 *    business bypassing the converter is `converter-bypass`'s subject. This one
 *    only says that whichever accessor it reaches, the PATH has one spelling.
 *  - Not an interpolated path. A template with substitutions can be a nested
 *    path assembled FROM constants, which is exactly the compliant shape; only a
 *    literal argument is flagged.
 *
 * The ast-grep rule `no-hardcoded-collection-path` is the neighbour, not the
 * duplicate: it matches `$DB.collection('literal')` — a path spelled straight at
 * the Firestore handle — and cannot see a literal handed to the typed accessor.
 */
import ts from 'typescript'

import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { calleeName, forEachNode } from '../ast.ts'

/**
 * The accessors whose FIRST argument is the collection path.
 *
 * `rawCollection` is here too, and its inclusion is the point rather than an
 * oversight: it is the sanctioned converter bypass for repair and delete, so it
 * addresses the SAME documents under the SAME path as the typed accessor beside
 * it. A literal there is the spelling most likely to drift, because it sits in
 * the code paths a reader visits least.
 */
const PATH_ACCESSORS = new Set([
  'typedCollection',
  'typedCollectionGroup',
  'rawCollection',
])

export const check: Check = {
  id: 'collection-path-constant',
  describe:
    'every typedCollection/typedCollectionGroup path is a named constant, not an inline literal (data.md: the feature owns its collection path)',
  run(program: StructureProgram) {
    const violations: Violation[] = []

    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)

      forEachNode(sf, (node) => {
        if (!ts.isCallExpression(node)) return
        const callee = calleeName(node)
        if (!callee || !PATH_ACCESSORS.has(callee)) return

        const pathArg = node.arguments[0]
        if (!pathArg || !ts.isStringLiteralLike(pathArg)) return

        violations.push({
          file: rel,
          contract: 'collection-path-constant',
          detail: `${callee}('${pathArg.text}', …) spells the collection path inline — export it as a path constant the owning module owns and pass that identifier, so the path has exactly one spelling`,
        })
      })
    }

    return violations
  },
}
