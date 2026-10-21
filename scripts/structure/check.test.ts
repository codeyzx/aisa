/**
 * Proof that every check has teeth: for each registered check, a purpose-built
 * BAD fixture must produce ≥1 violation and a GOOD fixture must produce 0. Plus
 * the regression guard — the REAL repo tree must be clean after exemptions.
 *
 * Each fixture is driven through a SEPARATE mini `ts.Program` rooted at its own
 * directory (`buildStructureProgram(dir)`), never the repo program, so a check
 * classifies paths/tiers relative to that fixture root.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildStructureProgram } from './program.ts'
import { runChecks } from './run.ts'
import { CHECKS } from './registry.ts'

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
)

function violationsFor(checkId: string, variant: 'bad' | 'good'): number {
  const check = CHECKS.find((candidate) => candidate.id === checkId)
  if (!check) throw new Error(`no registered check '${checkId}'`)
  const program = buildStructureProgram(path.join(FIXTURES, checkId, variant))
  return check.run(program).length
}

describe('structure checks bite on their fixtures', () => {
  // Every registered check must have a fixture pair — this fails loudly if a new
  // check is added without one, rather than silently skipping it.
  for (const check of CHECKS) {
    describe(check.id, () => {
      it('flags the bad fixture (≥1 violation)', () => {
        expect(violationsFor(check.id, 'bad')).toBeGreaterThan(0)
      })
      it('passes the good fixture (0 violations)', () => {
        expect(violationsFor(check.id, 'good')).toBe(0)
      })
    })
  }
})

describe('regression guard', () => {
  /**
   * 30s, not vitest's 5s default. This case builds a TypeScript program over the
   * WHOLE repo and runs every check across it, so its runtime grows with the
   * tree — it crossed 5s the moment the admin account surfaces landed and began
   * failing intermittently, on load, with a timeout rather than a violation.
   *
   * A timeout here is the worst possible signal: it says "structure regressed"
   * while proving nothing about structure. The budget is deliberately far above
   * the ~5s measured, because the number that matters is "did any check fail",
   * and a wall-clock assertion smuggled into this test would answer a different
   * question badly.
   */
  it(
    'the real repo tree has zero un-exempted violations',
    { timeout: 30_000 },
    () => {
      const report = runChecks(buildStructureProgram())
      // Name the offenders if this ever fails, so the diff is self-describing.
      const offenders = report.results.flatMap((result) =>
        result.violations.map((v) => `${v.contract}: ${v.file} — ${v.detail}`),
      )
      expect(offenders).toEqual([])
      expect(report.total).toBe(0)
    },
  )
})
