/**
 * A module that reaches for a privileged server runtime — the Firebase Admin SDK
 * or `next/headers` (cookies/headers) — must mark itself `import 'server-only'`
 * DIRECTLY, not lean on a transitive marker or the `'use server'` directive.
 *
 * The mark is a build-time tripwire: if such a module is ever pulled into a
 * client bundle, `server-only` throws at compile. The Phase-1 client/server
 * boundary check proves no server module is REACHABLE from a client entry today;
 * this check proves each privileged module is independently self-defending, so a
 * future refactor cannot quietly drag admin credentials to the browser.
 *
 * Only VALUE imports count. `import type { UserRecord } from 'firebase-admin/auth'`
 * is erased at build and pulls nothing, so a type-only importer is not required
 * to carry the mark. Framework route/page/layout entries under `app/` are
 * exempt — Next guarantees they never ship to the client — and `scripts/**` are
 * standalone Node CLIs that are never bundled at all.
 */
import type { Check, Violation } from '../types.ts'

const PRIVILEGED = (spec: string): boolean =>
  spec === 'firebase-admin' ||
  spec.startsWith('firebase-admin/') ||
  spec === 'next/headers'

const FRAMEWORK_ENTRY = new Set([
  'page.tsx',
  'page.ts',
  'layout.tsx',
  'layout.ts',
  'route.ts',
  'route.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'global-error.tsx',
  'default.tsx',
  'template.tsx',
])

function isExempt(rel: string): boolean {
  // Standalone Node CLIs — never part of any bundle.
  if (rel.startsWith('scripts/')) return true
  // Framework entry points under the app router — server-guaranteed by Next.
  const base = rel.slice(rel.lastIndexOf('/') + 1)
  if (rel.startsWith('app/') && FRAMEWORK_ENTRY.has(base)) return true
  return false
}

export const check: Check = {
  id: 'direct-server-only',
  describe:
    'every module that value-imports firebase-admin or next/headers marks itself server-only directly',
  run(program) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (isExempt(rel)) continue

      const privileged = program
        .importEdges(sf)
        .find((edge) => !edge.isTypeOnly && PRIVILEGED(edge.spec))
      if (!privileged) continue

      if (!program.hasServerOnly(sf)) {
        violations.push({
          file: rel,
          contract: 'direct-server-only',
          detail: `value-imports '${privileged.spec}' but does not \`import 'server-only'\` directly — add the mark so it fails the build if ever pulled client-side`,
        })
      }
    }
    return violations
  },
}
