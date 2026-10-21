/**
 * Every exported action wraps `runAction` / `runFormAction`.
 *
 * Ports the ast-grep rule `action-export-wraps-run-action` to the compiler.
 * Action files (`**\/*.action.ts`, `app/**\/_actions.ts`) are `'use server'`, so
 * every exported function is a browser-reachable RPC entry point, and the wrapper
 * is where the server-side capability check runs. An unwrapped export is an
 * unauthenticated one — and it typechecks, lints and builds green.
 *
 * Scope mirrors the rule: exported top-level actions in BOTH shapes a
 * `'use server'` file can present one — a `function` declaration AND a `const`
 * bound to an arrow / function expression (`export const NAME = async () => …`),
 * which is an equally callable RPC entry point and would otherwise skip the gate
 * while every static check stayed green. The sanctioned exception —
 * `changeOwnPasswordAction`, which cannot hold a capability gate and is gated by
 * a fresh reauthentication token instead — carries an inline ast-grep suppression
 * in source and is recorded as a specific exemption here. (Spelling that directive out in
 * this comment would make the scanner read IT as one, and then report it unused.)
 *
 * `_template.*` files are excluded from the tsconfig program, so (unlike ast-grep)
 * they are out of scope for THIS run. They are not unchecked: `check-templates.ts`
 * generates a real entity from them and runs this same check over that tree.
 */
import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { callsAnyOf, exportedActions } from '../ast.ts'

const WRAPPERS = new Set(['runAction', 'runFormAction'])

function isActionFile(rel: string): boolean {
  if (rel.endsWith('.action.ts')) return true
  if (rel.startsWith('app/') && /(^|\/)_actions\.ts$/.test(rel)) return true
  return false
}

export const check: Check = {
  id: 'action-wrapper-shape',
  describe:
    'every exported action wraps runAction/runFormAction (ports ast-grep action-export-wraps-run-action)',
  run(program: StructureProgram) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!isActionFile(rel)) continue

      for (const action of exportedActions(sf)) {
        if (!action.body || !callsAnyOf(action.body, WRAPPERS)) {
          violations.push({
            file: rel,
            contract: 'action-wrapper-shape',
            detail: `exported action '${action.name}' does not wrap runAction/runFormAction`,
          })
        }
      }
    }
    return violations
  },
}
