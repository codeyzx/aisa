/**
 * No `server-only` module may be reachable from a `'use client'` entry.
 *
 * `import 'server-only'` throws if a module is ever pulled into a client bundle;
 * it marks code that touches admin credentials, secrets, or the Firestore admin
 * SDK. A client component that transitively imports such a module leaks it into
 * the browser graph. Next catches this at build — but only once the offending
 * path is actually rendered; this proves it statically over the whole graph.
 *
 * TRANSITIVITY is on the RUNTIME CLIENT-BUNDLE graph, and it respects two cuts:
 *   - `import type` edges are erased before bundling, so they are not followed.
 *   - a `'use server'` module is a server-action boundary — a client that imports
 *     it receives RPC stubs, and the action's OWN imports never reach the client
 *     bundle. We stop at such a module (it is legitimately server-only-adjacent);
 *     descending past it is the classic false positive.
 */
import type ts from 'typescript'

import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'

export const check: Check = {
  id: 'client-server-boundary',
  describe:
    'no `server-only` module is reachable from a `use client` entry via value imports',
  run(program: StructureProgram) {
    const files = program.sourceFiles()
    const byPath = new Map<string, ts.SourceFile>()
    for (const sf of files) byPath.set(sf.fileName, sf)

    const clientEntries = files.filter((sf) => program.hasUseClient(sf))

    const violations: Violation[] = []
    const seenViolation = new Set<string>()

    for (const entry of clientEntries) {
      // BFS the runtime graph from this client entry; report the first
      // server-only module reached and the entry that reaches it.
      const visited = new Set<string>([entry.fileName])
      const queue: string[] = [entry.fileName]
      while (queue.length > 0) {
        const currentPath = queue.shift() as string
        const current = byPath.get(currentPath)
        if (!current) continue
        for (const edge of program.importEdges(current)) {
          if (edge.isTypeOnly) continue
          const next = edge.resolved
          if (!next || !byPath.has(next) || visited.has(next)) continue
          visited.add(next)
          const nextSf = byPath.get(next) as ts.SourceFile
          // A `'use server'` module is an RPC boundary: the client gets stubs,
          // its imports are not client-bundled. Do not descend into it.
          if (program.hasUseServer(nextSf)) continue
          if (program.hasServerOnly(nextSf)) {
            const key = `${program.rel(next)}::${program.rel(entry.fileName)}`
            if (!seenViolation.has(key)) {
              seenViolation.add(key)
              violations.push({
                file: program.rel(next),
                contract: 'client-server-boundary',
                detail: `server-only module reachable from client entry '${program.rel(entry.fileName)}'`,
              })
            }
            // Do not descend past a server-only module — it must not be here at
            // all, and its own deps are not the finding.
            continue
          }
          queue.push(next)
        }
      }
    }
    return violations
  },
}
