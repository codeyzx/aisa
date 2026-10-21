/**
 * The weaker session boundaries are reachable from ONE place each.
 *
 * `getSession()` answers "who is acting". `requireSession()` adds "or go to
 * /login". Neither asks whether the session is READY — an account holding
 * `mustChangePassword` passes both, because it really did sign in. The gate that
 * asks is `authorizeSession` / `requireReadySession` in `lib/auth/guards.ts`,
 * and the whole point of centralising it is defeated the moment a new entry
 * point reaches past it to the raw DAL.
 *
 * So: importing `getSession` or `requireSession` anywhere outside their own
 * module and that one wrapper is a violation. The entry points that legitimately
 * must NOT redirect — the password screen the ready guard redirects TO, the
 * password transition action, the public login page — are recorded as named
 * exemptions with a reason, exactly like every other tracked debt. A silent
 * fourth one cannot appear.
 *
 * SHALLOW BY DESIGN, same as `route-guard-inventory`: this proves the raw
 * boundary is not IMPORTED, which is what makes a bypass require an edit
 * somewhere a reviewer will see. It does not prove the exempted files then use
 * it correctly — their own tests do that.
 */
import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'

/** The two exports that resolve a session without asking whether it is ready. */
const WEAK_BOUNDARIES = new Set(['getSession', 'requireSession'])

/**
 * The modules allowed to name them: the DAL that DEFINES them, and the guard
 * module that wraps them into the ready boundary. Everything else answers to an
 * exemption.
 */
const OWNERS = new Set(['lib/auth/session.ts', 'lib/auth/guards.ts'])

/** A test may drive any boundary directly — that is what a test is for. */
function isTest(rel: string): boolean {
  return /\.test\.tsx?$/.test(rel)
}

export const check: Check = {
  id: 'ready-session-boundary',
  describe:
    'only the session DAL and lib/auth/guards.ts import getSession/requireSession — every other entry point goes through the ready-session gate',
  run(program: StructureProgram) {
    const violations: Violation[] = []

    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (OWNERS.has(rel) || isTest(rel)) continue

      const named = program
        .importEdges(sf)
        .flatMap((edge) => edge.names)
        .filter((name) => WEAK_BOUNDARIES.has(name))

      if (named.length > 0) {
        violations.push({
          file: rel,
          contract: 'ready-session-boundary',
          detail: `imports ${[...new Set(named)].toSorted().join(', ')} — use requireReadySession/requireCapability (pages) or authorizeSession (actions, route handlers), or record an exemption saying why this boundary must not redirect`,
        })
      }
    }
    return violations
  },
}
