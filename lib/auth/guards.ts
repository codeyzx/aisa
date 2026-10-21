import 'server-only'

/**
 * THE authorization gate. Every protected server entry point — page, server
 * action, form action, route handler — asks the same three questions in the same
 * order, and they are asked exactly once, here:
 *
 *   1. is there a verified session?
 *   2. is this session READY (it does not owe a mandatory password change)?
 *   3. does its role hold the capability, and has the deployment enabled it?
 *
 * `authorizeSession` answers them and REPORTS; it never redirects and never
 * throws, because the four boundaries answer a refusal differently — a page
 * redirects, a form action redirects elsewhere, a server action returns an
 * envelope, and a download route must answer a status code (a 307 to /login
 * saved as `assets.csv` is a login page with a spreadsheet's name, not a
 * refusal). The guards below are the page-shaped answers; the other boundaries
 * map the same denial into their own vocabulary.
 *
 * Before this existed the triple was hand-written at six call sites, which is
 * how a new rule like `mustChangePassword` gets applied at four of them.
 *
 * Next 16's `forbidden()` is still experimental (needs the `authInterrupts`
 * next.config flag), so we redirect to a plain /403 route instead of throwing it.
 */
import { redirect } from 'next/navigation'

import { isCapabilityUnavailable } from './capability-availability'
import { PASSWORD_CHANGE_PATH } from './constants'
import { can, type Capability } from './rbac'
import { getSession, requireSession, type Session } from './session'

/**
 * Why a request was refused. Three cases, kept apart because the REMEDY differs:
 * sign in, change your password, or nothing you can do. Collapsing them would
 * make a boundary answer "no permission" to a user who only needs to sign in.
 */
export type SessionDenial =
  | 'unauthenticated'
  | 'password_change_required'
  | 'forbidden'

export type Authorization =
  | { ok: true; session: Session }
  | { ok: false; denial: SessionDenial }

/**
 * Resolve and authorize the acting session for `capability`, without deciding
 * how to refuse.
 *
 * Order is load-bearing. Readiness is checked BEFORE the capability, so an
 * account that owes a password change is told to change it rather than told it
 * lacks permission — an admin's role would satisfy the capability check and let
 * them straight through.
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
  if (session.mustChangePassword) {
    return { ok: false, denial: 'password_change_required' }
  }
  if (isCapabilityUnavailable(capability)) {
    return { ok: false, denial: 'forbidden' }
  }
  if (!can(session, capability)) return { ok: false, denial: 'forbidden' }
  return { ok: true, session }
}

/**
 * Require a session that is READY to do ordinary work — the default guard for
 * every protected page that has no capability of its own.
 *
 * "Ready" is one step stronger than "authenticated". An account holding
 * `mustChangePassword` has a VALID session (it signed in with a real temporary
 * password) but no business anywhere except replacing that password, so it is
 * sent to the password screen rather than shown the page it asked for.
 *
 * `requireSession` remains exported for the entry points that legitimately must
 * not redirect (logout, session refresh, the password-transition path itself,
 * public auth pages); `ready-session-boundary` in `structure:check` keeps that
 * list from growing quietly.
 */
export async function requireReadySession(): Promise<Session> {
  const session = await requireSession()
  if (session.mustChangePassword) redirect(PASSWORD_CHANGE_PATH)
  return session
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
 * (`runFormAction`) redirects identically — a form that bounced a
 * password-owing user to /403 would be telling them the wrong thing to do.
 */
export function pathForDenial(denial: SessionDenial): string {
  switch (denial) {
    case 'unauthenticated': {
      return '/login'
    }
    case 'password_change_required': {
      return PASSWORD_CHANGE_PATH
    }
    case 'forbidden': {
      return '/403'
    }
  }
}
