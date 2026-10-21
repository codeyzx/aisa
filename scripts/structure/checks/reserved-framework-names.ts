/**
 * Framework-reserved filenames belong only to real framework entry points. A
 * `page.tsx` or `route.ts` sitting in `lib/` or `components/` makes the router
 * inventory ambiguous to both humans and tools — is it a route or not? — so the
 * app-router names are allowed ONLY under `app/`, and `proxy.ts` (the Next 16
 * proxy) only at the repo root. A shared UI primitive uses a descriptive name
 * (`page-container.tsx`, `toolbar-layout.tsx`), never a reserved one.
 */
import type { Check, Violation } from '../types.ts'

/** App-router entry names — legitimate only under `app/`. */
const APP_ONLY = new Set([
  'page.tsx',
  'page.ts',
  'layout.tsx',
  'layout.ts',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'global-error.tsx',
  'default.tsx',
  'template.tsx',
  'route.ts',
  'route.tsx',
])

/** Reserved names legitimate only at a single fixed path. */
const FIXED_LOCATION = new Map<string, string>([['proxy.ts', 'proxy.ts']])

function basename(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1)
}

export const check: Check = {
  id: 'reserved-framework-names',
  describe:
    'framework-reserved filenames (page/layout/route/proxy/…) appear only at their framework location',
  run(program) {
    const violations: Violation[] = []
    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      const base = basename(rel)

      if (APP_ONLY.has(base) && !rel.startsWith('app/')) {
        violations.push({
          file: rel,
          contract: 'reserved-framework-names',
          detail: `'${base}' is an app-router entry name but lives outside app/ — rename to a descriptive name`,
        })
      }

      const fixed = FIXED_LOCATION.get(base)
      if (fixed !== undefined && rel !== fixed) {
        violations.push({
          file: rel,
          contract: 'reserved-framework-names',
          detail: `'${base}' is reserved for ${fixed} — rename this non-framework file`,
        })
      }
    }
    return violations
  },
}
