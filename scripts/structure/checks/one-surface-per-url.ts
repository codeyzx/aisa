/**
 * One URL, one surface: no parallel-route slots and no intercepting routes.
 *
 * Both features exist to show a route as something OTHER than its own page —
 * typically a modal over whatever the reader was already looking at. The
 * starter used them for `/admin`, `/assets/new`, and `/assets/[id]/edit`, and
 * removed them on a finding that generalises to any modal route:
 *
 *   A DIALOG CANNOT BE SERVER-RENDERED. Base UI's portal resolves its container
 *   in a layout effect, so `renderToStaticMarkup` of a `defaultOpen` dialog
 *   returns the empty string — not a degraded form, nothing at all.
 *
 * So an intercepted route can never answer a JavaScript-off request, which is
 * why the pattern always ships WITH a full-page fallback behind it. That
 * fallback is the real cost: every guard, every `returnTo` validation, every
 * `generateMetadata` decision then exists twice, in two files, and the two
 * surfaces are free to drift. The class of bug this check prevents is not "the
 * modal looked wrong" — it is "the modal and the page answered differently",
 * which by construction nobody sees until it matters.
 *
 * WHAT IS FLAGGED, and only this: a path segment under `app/` that is a
 * parallel slot (`@modal`) or an interception marker (`(.)`, `(..)`,
 * `(..)(..)`, `(...)`). Ordinary route GROUPS — `(app)`, `(examples)` — are
 * untouched: they organise files without changing a URL, which is the opposite
 * of what this check is about.
 *
 * A dialog is still perfectly fine — open it from CLIENT STATE, not from a
 * route. `ConfirmDialog` is the shape to copy. What may not come back is a URL
 * whose rendered surface depends on how the reader arrived at it.
 */
import type { Check, Violation } from '../types.ts'

/** Only route files can express this topology. */
const APP_DIR = 'app/'

/** `(.)`, `(..)`, `(...)`, and the stacked `(..)(..)` — Next's interception markers. */
const INTERCEPTION = /^\((?:\.{1,3})\)/

function offendingSegment(rel: string): string | undefined {
  // The basename is a filename, never a route segment — `page.tsx` cannot be a
  // slot, and a leading `@` in a filename is not this topology.
  const segments = rel.split('/').slice(0, -1)
  return segments.find(
    (segment) => segment.startsWith('@') || INTERCEPTION.test(segment),
  )
}

export const check: Check = {
  id: 'one-surface-per-url',
  describe:
    'no parallel-route slot or intercepting route — a URL renders the same surface however it is reached',
  run(program) {
    const violations: Violation[] = []

    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!rel.startsWith(APP_DIR)) continue

      const segment = offendingSegment(rel)
      if (segment === undefined) continue

      const kind = segment.startsWith('@')
        ? `parallel-route slot '${segment}'`
        : `intercepting route '${segment}'`

      violations.push({
        file: rel,
        contract: 'one-surface-per-url',
        detail:
          `lives under a ${kind}, so this URL renders one surface on a soft ` +
          'navigation and another on a direct load — and the intercepted one ' +
          'cannot render at all without JavaScript. Make it a plain page, and ' +
          'open any dialog from client state instead',
      })
    }

    return violations
  },
}
