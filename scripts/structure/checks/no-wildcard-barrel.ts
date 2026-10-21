/**
 * `export * from '…'` (a wildcard barrel) is banned tree-wide.
 *
 * A wildcard re-export hides what a module publishes: a reader can no longer see
 * a file's surface without opening every barrel it fans out to, and a renamed or
 * deleted symbol re-appears silently through the star. Named re-exports keep the
 * public surface legible and greppable. `export * as ns from` is a namespaced
 * re-export with an explicit binding and is NOT flagged.
 */
import type { Check, Violation } from '../types.ts'

export const check: Check = {
  id: 'no-wildcard-barrel',
  describe: 'no `export * from` wildcard barrels — re-export by name',
  run(program) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      for (const { spec } of program.wildcardExports(sf)) {
        violations.push({
          file: program.rel(sf.fileName),
          contract: 'no-wildcard-barrel',
          detail: `export * from '${spec}' — re-export the symbols by name instead`,
        })
      }
    }
    return violations
  },
}
