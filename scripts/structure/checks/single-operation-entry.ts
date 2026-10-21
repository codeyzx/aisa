/**
 * No operation is exposed through BOTH a form and a programmatic action entry.
 *
 * `docs/reference/contracts/data.md` states the rule: an operation has ONE entry. The two entry KINDS are distinguished by name
 * — `<verb><Entity>FormAction` (form: FormData in, redirect out) and
 * `<verb><Entity>Action` (programmatic: typed args in, `ActionResult` out). They
 * share one internal write; exposing the SAME operation through both kinds forks
 * that write behind two RPC entry points that can drift apart, and each is
 * independently browser-reachable. Nothing else catches it — both typecheck.
 *
 * The operation identity is the name with its kind suffix stripped: a `FormAction`
 * and a plain `Action` that reduce to the same base are the same operation twice.
 * Grouped PER FILE, matching the convention that an entity's entries live in one
 * `*.action.ts`. Names ending in neither suffix are another check's concern (see
 * `action-wrapper-shape`), so they are ignored here.
 *
 * `_template.*` files are outside the tsconfig program (like every check here), so
 * `check-templates.ts` runs this check over a generated entity instead.
 */
import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { exportedFunctionDeclarations } from '../ast.ts'

function isActionFile(rel: string): boolean {
  if (rel.endsWith('.action.ts')) return true
  if (rel.startsWith('app/') && /(^|\/)_actions\.ts$/.test(rel)) return true
  return false
}

type Kind = 'form' | 'programmatic'

/** The operation identity and entry kind of an action export, or null if neither. */
function classify(name: string): { base: string; kind: Kind } | null {
  if (name.endsWith('FormAction')) {
    return { base: name.slice(0, -'FormAction'.length), kind: 'form' }
  }
  // `FormAction` is tested first: it also ends with `Action`.
  if (name.endsWith('Action')) {
    return { base: name.slice(0, -'Action'.length), kind: 'programmatic' }
  }
  return null
}

export const check: Check = {
  id: 'single-operation-entry',
  describe:
    'no operation is exposed through both a form and a programmatic action entry (data-layer.md: one entry per operation)',
  run(program: StructureProgram) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!isActionFile(rel)) continue

      // base -> the entry name seen for each kind, within this file.
      const byBase = new Map<string, Partial<Record<Kind, string>>>()
      for (const fn of exportedFunctionDeclarations(sf)) {
        if (!fn.name) continue
        const entry = classify(fn.name.text)
        if (!entry) continue
        const kinds = byBase.get(entry.base) ?? {}
        kinds[entry.kind] = fn.name.text
        byBase.set(entry.base, kinds)
      }

      for (const [base, kinds] of byBase) {
        if (kinds.form && kinds.programmatic) {
          violations.push({
            file: rel,
            contract: 'single-operation-entry',
            detail: `operation '${base}' is exposed through both a form and a programmatic entry (${kinds.form} + ${kinds.programmatic}) — expose it once, behind one internal write`,
          })
        }
      }
    }
    return violations
  },
}
