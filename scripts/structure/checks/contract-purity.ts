/**
 * A `*.contract.ts` module is the pure, serializable shape shared across the RSC
 * boundary — the one kind of module a client component may import from a
 * server-backed concern. So it must be importable in a client bundle with no
 * server runtime pulled in behind it.
 *
 * A contract violates purity if it:
 *   (a) marks itself `import 'server-only'` (a contract is client-safe by
 *       definition — the mark is a contradiction);
 *   (b) VALUE-imports a server/node runtime module (firebase-admin, next server
 *       APIs, node builtins) — a type-only import is erased and allowed; or
 *   (c) VALUE-imports a local module that is itself `server-only`, which would
 *       drag that server module into every client that imports the contract.
 *
 * Type-only imports (`import type { Role } from './rbac'`) are erased at build,
 * so a contract may name types from anywhere.
 */
import type { Check, Violation } from '../types.ts'

const RUNTIME_DENY = (spec: string): boolean =>
  spec === 'firebase-admin' ||
  spec.startsWith('firebase-admin/') ||
  spec === 'next/headers' ||
  spec === 'next/cache' ||
  spec === 'next/navigation' ||
  spec === 'next/server' ||
  spec.startsWith('node:') ||
  spec === 'fs' ||
  spec === 'path' ||
  spec === 'crypto' ||
  spec === 'os' ||
  spec === 'child_process'

function isContract(rel: string): boolean {
  return rel.endsWith('.contract.ts') || rel.endsWith('.contract.tsx')
}

export const check: Check = {
  id: 'contract-purity',
  describe:
    'every *.contract.ts is client-safe — no server-only mark, no value import of a server/node runtime or a server-only module',
  run(program) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!isContract(rel)) continue

      if (program.hasServerOnly(sf)) {
        violations.push({
          file: rel,
          contract: 'contract-purity',
          detail: `a *.contract.ts must be client-safe — remove \`import 'server-only'\``,
        })
      }

      for (const edge of program.importEdges(sf)) {
        if (edge.isTypeOnly || edge.isSideEffect) continue
        if (RUNTIME_DENY(edge.spec)) {
          violations.push({
            file: rel,
            contract: 'contract-purity',
            detail: `value-imports server/node runtime '${edge.spec}' — a contract must stay pure and serializable`,
          })
          continue
        }
        // Transitive: a value import of a local server-only module would pull it
        // into the client bundle behind the contract.
        const target = edge.resolved
        if (!target) continue
        const targetSf = program.program.getSourceFile(target)
        if (targetSf && program.hasServerOnly(targetSf)) {
          violations.push({
            file: rel,
            contract: 'contract-purity',
            detail: `value-imports '${edge.spec}', which is server-only — a contract may only type-import a server module`,
          })
        }
      }
    }
    return violations
  },
}
