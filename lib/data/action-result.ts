import * as z from 'zod'

import { newCorrelationId } from '@/lib/api/cid'
import { authorizeSession } from '@/lib/auth/guards'
import { type Capability } from '@/lib/auth/rbac'
import { type Session } from '@/lib/auth/session'
import { log } from '@/lib/log'
import { reportError } from '@/lib/observability/report'

import { actionError, type ActionResult } from './action.contract'
import { DomainError } from './domain-error'

export type { ActionResult } from './action.contract'

/**
 * Discriminated result envelope returned by every server action. Actions never
 * throw across the RSC boundary — they resolve to `ok:false` with a stable,
 * user-safe `error` and a machine-readable `code`.
 */

/**
 * Run `fn` as an authenticated + authorized server action. Resolves the session,
 * enforces `capability`, then invokes `fn(session)` and wraps the outcome. Zod
 * validation failures collapse to a generic `invalid` code; any other throw is
 * logged server-side and returned as an opaque `internal` error so internals
 * never leak to the client. Page-level guards own redirects — this never
 * redirects, it returns the envelope.
 *
 * Boundary rule (server action vs route handler): docs/reference/contracts/http-api.md
 */
export async function runAction<T>(
  capability: Capability,
  fn: (session: Session) => Promise<T>,
): Promise<ActionResult<T>> {
  // A server action is a public POST endpoint, so hiding the UI is not a gate:
  // the same three questions every other boundary asks are asked here too, and
  // `authorizeSession`'s denial maps 1:1 onto the action error vocabulary.
  const auth = await authorizeSession(capability)
  if (!auth.ok) return actionError(auth.denial)
  const { session } = auth
  try {
    return { ok: true, data: await fn(session) }
  } catch (error) {
    if (error instanceof z.ZodError) return actionError('invalid')
    // A typed domain failure is EXPECTED and handled — return its code without
    // logging, so `not_found`/`conflict` never masquerade as an internal bug.
    if (error instanceof DomainError) return actionError(error.code)
    // The id is minted HERE, not by the caller, and it is the same id the
    // envelope carries back — the action-layer twin of what `apiFailFrom` does
    // with the cid the request already owns. `newCorrelationId` from lib/api/cid
    // rather than a local `randomUUID`: that module is stated to be the only
    // thing in this codebase allowed to mint a request identifier, and a second
    // scheme here would make "the id" mean two things.
    //
    // Only this branch gets one. A `not_found` or a `conflict` explains itself;
    // an `internal` is opaque BY DESIGN, so without an id the person reporting it
    // has nothing to quote and the operator is left grepping by timestamp.
    const cid = newCorrelationId()
    log.child({ cid }).error('[action] unhandled error', {
      capability,
      uid: session.uid,
      error,
    })
    // And into MONITORING, not only the log. This catch is why an unexpected
    // action failure was invisible to the error reporter: it never propagates,
    // so `onRequestError` never fires for it — the client got a polite
    // `internal` and nobody was paged. Reported ONLY here: the Zod, DomainError
    // and denial branches above are the system working, and reporting them
    // would bury real incidents until the alerts stop being read. The uid goes
    // to the log and NOT to the reporter; the cid joins the two.
    reportError(error, { cid, capability })
    return actionError('internal', cid)
  }
}
