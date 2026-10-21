/**
 * The core: run every registered check over a program, then subtract tracked
 * exemptions (matched by check id + target file). Pure and side-effect-free so
 * both the CLI and the test drive the identical logic.
 */
import type { StructureProgram } from './program.ts'
import type { Violation } from './types.ts'
import { CHECKS } from './registry.ts'
import { EXEMPTIONS, type Exemption } from './exemptions.ts'

export interface CheckResult {
  id: string
  describe: string
  /** Violations left AFTER exemptions were subtracted. */
  violations: Violation[]
  /** Violations that an exemption silenced (kept for the report). */
  exempted: { violation: Violation; exemption: Exemption }[]
}

export interface RunReport {
  results: CheckResult[]
  /** Total un-exempted violations across all checks. */
  total: number
}

function exemptionFor(
  violation: Violation,
  exemptions: readonly Exemption[],
): Exemption | undefined {
  return exemptions.find(
    (exemption) =>
      exemption.check === violation.contract &&
      exemption.target === violation.file,
  )
}

export function runChecks(
  program: StructureProgram,
  exemptions: readonly Exemption[] = EXEMPTIONS,
): RunReport {
  const results: CheckResult[] = []
  let total = 0

  for (const check of CHECKS) {
    const raw = check.run(program)
    const violations: Violation[] = []
    const exempted: CheckResult['exempted'] = []
    for (const violation of raw) {
      const exemption = exemptionFor(violation, exemptions)
      if (exemption) exempted.push({ violation, exemption })
      else violations.push(violation)
    }
    total += violations.length
    results.push({
      id: check.id,
      describe: check.describe,
      violations,
      exempted,
    })
  }

  return { results, total }
}
