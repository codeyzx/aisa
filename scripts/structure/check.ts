/**
 * `structure:check` — the architecture gate.
 *
 * Loads the TypeScript program ONCE from `tsconfig.json`, runs every registered
 * check over the real import/export graph, subtracts tracked exemptions, prints
 * a grouped report, and exits non-zero on any un-exempted violation. `--json`
 * emits the same result as machine-readable output.
 *
 * WHY A COMPILER, NOT A LINTER: these contracts are about the resolved module
 * graph — an aliased and a relative import are the same edge; a `'use client'`
 * entry's transitive reach is a graph walk. A regex over source text cannot see
 * any of that. Run with `node scripts/structure/check.ts`.
 */
import { buildStructureProgram } from './program.ts'
import { runChecks } from './run.ts'

const asJson = process.argv.includes('--json')

const program = buildStructureProgram()
const report = runChecks(program)

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: report.total === 0,
        total: report.total,
        results: report.results.map((result) => ({
          id: result.id,
          describe: result.describe,
          violations: result.violations,
          exempted: result.exempted.map((entry) => ({
            file: entry.violation.file,
            detail: entry.violation.detail,
            owner: entry.exemption.owner,
            removePhase: entry.exemption.removePhase,
          })),
        })),
      },
      null,
      2,
    ),
  )
  process.exit(report.total === 0 ? 0 : 1)
}

let exemptedCount = 0
for (const result of report.results) {
  exemptedCount += result.exempted.length
  const status = result.violations.length === 0 ? 'OK  ' : 'FAIL'
  console.log(`\n[${status}] ${result.id} — ${result.describe}`)

  for (const violation of result.violations) {
    console.log(`   ✗ ${violation.file}`)
    console.log(`       ${violation.detail}`)
  }
  for (const { violation, exemption } of result.exempted) {
    console.log(
      `   • exempt ${violation.file} (${exemption.owner}, remove in ${exemption.removePhase})`,
    )
  }
}

console.log(
  `\nstructure:check — ${report.total} violation(s), ${exemptedCount} exempted across ${report.results.length} checks.`,
)

if (report.total > 0) {
  console.error(
    '\nFAILED — the tree broke an architecture contract above. Fix the file, or ' +
      '(only if the violation is legitimate and phase-owned) record a specific ' +
      'exemption in scripts/structure/exemptions.ts.',
  )
  process.exit(1)
}

console.log(
  'OK — every architecture contract holds (or is a tracked exemption).',
)
