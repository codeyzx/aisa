/**
 * `docs:check` — the documentation ownership + drift gate.
 *
 * Runs every check in `checks.ts` over the real repo (`context.ts`), subtracts
 * the tracked, phase-owned exemptions (`exemptions.ts`), and exits non-zero on any
 * remaining violation, zero when clean. Problems are reported by their owning
 * doc/target in stable terms — never a source line — so the output is diff-stable.
 *
 * Usage:
 *   node scripts/docs/check.ts          human-readable grouped report
 *   node scripts/docs/check.ts --json   machine-readable result
 *
 * `exemptions.ts` is currently empty, so this runs the full rule set with no
 * excused gaps — proven by the fixtures in check.test.ts.
 */
import { realContext } from './context.ts'
import { evaluate, type Report } from './evaluate.ts'
import { exemptions } from './exemptions.ts'
import type { Violation } from './checks.ts'

function printHuman(report: Report): void {
  const { violations, exempted, unusedExemptions } = report

  if (exempted.length > 0) {
    console.log(`docs:check — ${exempted.length} known gap(s) exempted:`)
    const byPhase = new Map<string, number>()
    for (const { exemption } of exempted) {
      byPhase.set(
        exemption.removePhase,
        (byPhase.get(exemption.removePhase) ?? 0) + 1,
      )
    }
    for (const [phase, count] of [...byPhase].toSorted()) {
      console.log(`  • ${count} owned by ${phase} (to be removed then)`)
    }
    console.log('')
  }

  if (unusedExemptions.length > 0) {
    // Not fatal — a deferred exemption (e.g. generated-drift) legitimately matches
    // nothing yet — but surface it so stale entries do not accumulate silently.
    console.log(
      `docs:check — ${unusedExemptions.length} exemption(s) matched no violation ` +
        `(deferred or now-stale):`,
    )
    for (const e of unusedExemptions) {
      console.log(`  • ${e.check} :: ${e.target}`)
    }
    console.log('')
  }

  if (violations.length === 0) {
    console.log('docs:check — OK. No un-exempted documentation violations.')
    return
  }

  console.error(`docs:check — FAILED with ${violations.length} violation(s):\n`)
  const byCheck = new Map<string, Violation[]>()
  for (const v of violations) {
    const list = byCheck.get(v.check) ?? []
    list.push(v)
    byCheck.set(v.check, list)
  }
  for (const [check, list] of [...byCheck].toSorted()) {
    console.error(`[${check}]`)
    for (const v of list.toSorted((a, b) => a.target.localeCompare(b.target))) {
      console.error(`  ✗ ${v.target}\n      ${v.message}`)
    }
    console.error('')
  }
  console.error(
    'Fix the doc, or — if this is a known phase-owned gap — record a specific ' +
      'exemption in scripts/docs/exemptions.ts.',
  )
}

const report = evaluate(realContext, exemptions)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printHuman(report)
}

if (!report.ok) process.exit(1)
