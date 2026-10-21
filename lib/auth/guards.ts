import 'server-only'

/**
 * THE authorization gate. Every protected server entry point — page, server
 * action, form action, route handler — asks the same two questions in the same
 * order, and they are asked exactly once, here:
 *
 *   1. is there a verified session?
 *   2. does its role hold the capability, and has the deployment enabled it?
 *
 * `authorizeSession` answers them and REPORTS; it never redirects and never
 * throws, because the four boundaries answer a refusal differently — a page
 * redirects, a form action redirects elsewhere, a server action returns an
 * envelope, and a download route must answer a status code (a 307 to /login
 * saved as `assets.csv` is a login page with a spreadsheet's name, not a
 * refusal). The guards below are the page-shaped answers; the other boundaries
 * map the same denial into their own vocabulary.
 *
 * Before this existed the checks were hand-written at six call sites, which is
 * how a new rule gets applied at four of them.
 *
 * Next 16's `forbidden()` is still experimental (needs the `authInterrupts`
 * next.config flag), so we redirect to a plain /403 route instead of throwing it.
 */
import { redirect } from 'next/navigation'

import { isCapabilityUnavailable } from './capability-availability'
import { can, type Capability } from './rbac'
import { getSession, requireSession, type Session } from './session'

/**
 * Why a request was refused. Two cases, kept apart because the REMEDY differs:
 * sign in, or nothing you can do. Collapsing them would make a boundary answer
 * "no permission" to someone who only needs to sign in.
 */
export type SessionDenial = 'unauthenticated' | 'forbidden'

export type Authorization =
  | { ok: true; session: Session }
  | { ok: false; denial: SessionDenial }

/**
 * Resolve and authorize the acting session for `capability`, without deciding
 * how to refuse.
 *
 * A capability the DEPLOYMENT has turned off is refused before the role is
 * consulted: it must not be reachable by anyone, not even an admin whose role
 * nominally grants it, or the request proceeds and fails later, deep inside the
 * feature, on a credential the deployment deliberately never configured.
 */
export async function authorizeSession(
  capability: Capability,
): Promise<Authorization> {
  const session = await getSession()
  if (!session) return { ok: false, denial: 'unauthenticated' }
  if (isCapabilityUnavailable(capability)) {
    return { ok: false, denial: 'forbidden' }
  }
  if (!can(session, capability)) return { ok: false, denial: 'forbidden' }
  return { ok: true, session }
}

/**
 * Require a signed-in session — the default guard for every protected page that
 * has no capability of its own. "Ready" used to also mean "owes no password
 * change"; this app has no such state, so today it is exactly
 * `requireSession`. It stays the one sanctioned wrapper so `ready-session-boundary`
 * in `structure:check` keeps the raw DAL reachable from one place.
 */
export async function requireReadySession(): Promise<Session> {
  return requireSession()
}

/** Require a READY session whose role grants `capability`, else redirect. */
export async function requireCapability(
  capability: Capability,
): Promise<Session> {
  const result = await authorizeSession(capability)
  if (result.ok) return result.session
  redirect(pathForDenial(result.denial))
}

/**
 * Where a page-shaped boundary sends each denial. Exported so the FORM boundary
 * (`runFormAction`) redirects identically.
 */
export function pathForDenial(denial: SessionDenial): string {
  switch (denial) {
    case 'unauthenticated': {
      return '/login'
    }
    case 'forbidden': {
      return '/403'
    }
  }
}
