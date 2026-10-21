/**
 * Capability inventory — call sites vs the declared capability set.
 *
 * BUILDER (the durable part): collects every capability STRING used at a call
 * site — `requireCapability('…')`, `runAction('…', …)`, `can(_, '…')`,
 * `roleCan(_, '…')`, and any `capability: '…'` option — and the DECLARED set
 * (`CAPABILITIES` in `lib/auth/rbac.ts`), read off the tree, never hard-coded.
 *
 * The declaration is mechanically complete in BOTH directions:
 *
 * - USED ⊆ DECLARED: every capability named at a call site is a member of the
 *   declared set. On the typed tree the `Capability` union already guarantees
 *   this; its teeth are for a fork that widens a call site past the declaration,
 *   or a plain-string RBAC that drops the type.
 * - DECLARED ⊆ USED: every declared capability is actually enforced at ≥1 call
 *   site, so a dead or demo capability cannot linger in the grant table naming an
 *   authority nothing checks. This is the "one complete source" the semantic
 *   capabilities depend on — declare a capability and it must be wired.
 */
import ts from 'typescript'

import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import {
  calleeName,
  exportedStringArray,
  forEachNode,
  propertyStringValues,
  stringArgs,
} from '../ast.ts'

/** Calls whose string arguments name a capability. */
const CAPABILITY_CALLEES = new Set([
  'requireCapability',
  'runAction',
  'can',
  'roleCan',
])

/** Collect every capability string literal used across the tree. */
function usedCapabilities(
  program: StructureProgram,
): { cap: string; file: string }[] {
  const used: { cap: string; file: string }[] = []
  for (const sf of program.sourceFiles()) {
    const file = program.rel(sf.fileName)
    forEachNode(sf, (node) => {
      if (ts.isCallExpression(node)) {
        const name = calleeName(node)
        if (name && CAPABILITY_CALLEES.has(name)) {
          for (const cap of stringArgs(node)) used.push({ cap, file })
        }
      }
    })
    for (const cap of propertyStringValues(sf, 'capability')) {
      used.push({ cap, file })
    }
  }
  return used
}

export const check: Check = {
  id: 'capability-completeness',
  describe:
    'the rbac CAPABILITIES declaration is complete both ways — every used capability is declared, and every declared capability is used',
  run(program: StructureProgram) {
    const rbac = program.byRel('lib/auth/rbac.ts')
    const declared = rbac
      ? exportedStringArray(rbac, 'CAPABILITIES')
      : undefined
    // No declaration source → the builder has nothing to check against.
    if (!declared) return []
    const declaredSet = new Set(declared)

    const violations: Violation[] = []
    const used = usedCapabilities(program)
    const usedSet = new Set(used.map((u) => u.cap))

    // USED ⊆ DECLARED: a call site names a capability the grant table lacks.
    for (const { cap, file } of used) {
      if (!declaredSet.has(cap)) {
        violations.push({
          file,
          contract: 'capability-completeness',
          detail: `capability '${cap}' is used but not declared in rbac CAPABILITIES`,
        })
      }
    }

    // DECLARED ⊆ USED: a declared capability nothing enforces — dead authority.
    if (rbac) {
      for (const cap of declared) {
        if (!usedSet.has(cap)) {
          violations.push({
            file: program.rel(rbac.fileName),
            contract: 'capability-completeness',
            detail: `capability '${cap}' is declared but never enforced at any call site — wire it or remove it`,
          })
        }
      }
    }
    return violations
  },
}
