/**
 * Pure evaluation core for `docs:check`: run the checks over a context, subtract
 * the exemptions, and return a structured result. Importable by the CLI
 * (`check.ts`) and the test suite WITHOUT running the process or exiting.
 */
import { runAllChecks, type CheckContext, type Violation } from './checks.ts'
import type { Exemption } from './exemptions.ts'

export interface Report {
  ok: boolean
  violations: Violation[]
  exempted: { violation: Violation; exemption: Exemption }[]
  unusedExemptions: Exemption[]
}

function keyOf(x: { check: string; target: string }): string {
  return `${x.check} ${x.target}`
}

/** Evaluate a context against a set of exemptions. */
export function evaluate(ctx: CheckContext, exemptions: Exemption[]): Report {
  const all = runAllChecks(ctx)
  const exemptionByKey = new Map(exemptions.map((e) => [keyOf(e), e]))
  const usedKeys = new Set<string>()

  const violations: Violation[] = []
  const exempted: { violation: Violation; exemption: Exemption }[] = []
  for (const v of all) {
    const exemption = exemptionByKey.get(keyOf(v))
    if (exemption) {
      usedKeys.add(keyOf(exemption))
      exempted.push({ violation: v, exemption })
    } else {
      violations.push(v)
    }
  }

  const unusedExemptions = exemptions.filter((e) => !usedKeys.has(keyOf(e)))
  return { ok: violations.length === 0, violations, exempted, unusedExemptions }
}
