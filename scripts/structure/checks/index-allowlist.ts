/**
 * `index.ts` barrels erode legibility: an importer can no longer see where a
 * symbol actually lives, and a folder-as-module quietly grows into a grab-bag.
 * Wildcard barrels are banned outright (see `no-wildcard-barrel`); a small,
 * cohesive folder-as-module is allowed ONLY by this explicit allowlist, so every
 * `index.ts` in the tree is a deliberate, reviewed decision rather than a default.
 *
 * The two allowed today are each a single cohesive unit — the in-memory rate
 * limiter and the logger — with
 * named (never wildcard) exports that do not bridge the server/client boundary.
 * Adding an entry here is the review gate: justify the folder-as-module first.
 */
import type { Check, Violation } from '../types.ts'

const ALLOWED_INDEX = new Set(['lib/http/index.ts', 'lib/log/index.ts'])

function isIndex(rel: string): boolean {
  return rel.endsWith('/index.ts') || rel.endsWith('/index.tsx')
}

export const check: Check = {
  id: 'index-allowlist',
  describe:
    'every index.ts is on the explicit cohesive-module allowlist — no ad-hoc barrels',
  run(program) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!isIndex(rel)) continue
      if (ALLOWED_INDEX.has(rel)) continue
      violations.push({
        file: rel,
        contract: 'index-allowlist',
        detail:
          'index.ts is not on the cohesive-module allowlist — import the module directly, or add a justified entry to index-allowlist.ts',
      })
    }
    return violations
  },
}
