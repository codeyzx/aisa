import 'server-only'

/**
 * The session DAL (Data Access Layer): the single server-authoritative "who is
 * acting" boundary. Reads the httpOnly session cookie, verifies it with Firebase
 * Admin (checkRevoked=true), and maps the decoded token to a `Session`. Wrapped in
 * React `cache()` so layout + page + leaf components share ONE verification per
 * render pass. proxy.ts does only an optimistic cookie-presence check; real
 * verification happens HERE.
 */
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { UserRecord } from 'firebase-admin/auth'

import { adminAuth } from '@/lib/firebase/admin-auth'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { log } from '@/lib/log'
import { SESSION_COOKIE } from './constants'
import { IMPERSONATION_COOKIE, verifyTicket } from './impersonation'
import { can, mustChangePasswordFromClaims, roleFromClaims } from './rbac'
import { readRevocationMarker } from './revocation'
import { isTokenRevoked } from './revocation.contract'
import type { Session } from './session.contract'
import { isDefinitiveTokenRejection } from './token-rejection'

// The `Session`/`Impersonator` shapes are pure and live in `session.contract.ts`
// so a client component can name them without importing this server-only module.
// Re-exported here so existing `@/lib/auth/session` type consumers are unchanged.
export type { Session, Impersonator } from './session.contract'

/**
 * Map a Firebase user record to a base `Session`, or `null` if the account is
 * DISABLED. Shared by the impersonation overlay below and the start action, so a
 * disabled target is refused at BOTH the mint and every request that resolves the
 * ticket — one rule, never two copies to keep in sync. Callers add `impersonator`.
 *
 * Deliberately does NOT carry the target's `mustChangePassword` — see that field's
 * docblock in `session.contract.ts`. The admin behind an overlay cannot produce the
 * target's reauthentication proof, so the claim would trap them on a screen they
 * cannot clear rather than gate anything.
 */
export function sessionFromUserRecord(user: UserRecord): Session | null {
  if (user.disabled) return null
  return {
    uid: user.uid,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    role: roleFromClaims(user.customClaims),
  }
}

/**
 * Verify the current session cookie and resolve a `Session`, or null if the cookie
 * is missing/invalid/expired/revoked. Cached for the render pass.
 *
 * THROWS when the auth provider cannot be reached. Null means "not signed in",
 * and only a definitive Firebase rejection may produce it — an outage that read
 * as null would sign every active user out. See `token-rejection.ts`.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  let real: Session
  let authTime: number
  try {
    // checkRevoked = true: a revoked/rotated session is rejected even if unexpired.
    const decoded = await adminAuth().verifySessionCookie(token, true)
    authTime = decoded.auth_time
    real = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      // Never trust the role claim blindly — fall back to the least-privileged role.
      role: roleFromClaims(decoded),
      ...(mustChangePasswordFromClaims(decoded) && {
        mustChangePassword: true as const,
      }),
    }
  } catch (error) {
    // A DEFINITIVE rejection — expired, revoked, malformed, subject gone — is an
    // answer about the cookie: treat as unauthenticated.
    if (isDefinitiveTokenRejection(error)) return null
    // Anything else means we could not REACH the provider. Returning null here
    // would report a Google-side outage as "invalid credentials" and redirect a
    // validly-signed-in user to /login. Throw instead: the cookie is left intact
    // and the caller surfaces "temporarily unavailable", so the session survives
    // the outage. Same fail-safe rule as `account.repo.getAccount`.
    throw error
  }

  if (await isRevoked(real.uid, authTime)) return null

  // Impersonation is resolved HERE, and only after the real cookie has verified,
  // so this stays one boundary with a richer answer rather than a second boundary.
  // A `getEffectiveSession()` beside this function would leave runAction,
  // requireCapability and app/(app)/layout.tsx all still seeing the
  // admin — an impersonation that typechecks and enforces nothing.
  return (
    (await resolveImpersonation(jar.get(IMPERSONATION_COOKIE)?.value, real)) ??
    real
  )
})

/**
 * Whether the revocation marker kills a cookie minted at `authTime`.
 *
 * This runs IN ADDITION to Firebase's `checkRevoked=true`, not instead of it,
 * because the two cover different gaps. Firebase answers "were this account's
 * refresh tokens revoked"; the marker answers "did WE decide to end sessions" —
 * which is the state after a Firebase revocation call fails and leaves the
 * operation `revocation_pending`. Dropping either one lets a session the app
 * believes it ended keep working.
 *
 * An UNREADABLE marker — corrupt document, or Firestore unreachable — denies.
 * That looks like trading availability for security, but it costs no
 * availability that was not already gone: every protected surface in this app
 * reads Firestore, so a Firestore that cannot answer this query cannot serve the
 * page behind it either. Failing open, by contrast, would make "make Firestore
 * unreachable" a way to keep a revoked session alive.
 *
 * Denying resolves to a bounce to /login, and a fresh login mints a cookie whose
 * `auth_time` is past the cutoff — so this is self-healing, never a lockout.
 */
async function isRevoked(uid: string, authTime: number): Promise<boolean> {
  const marker = await readRevocationMarker(uid)
  if (marker.kind === 'unreadable') {
    log.error('[auth] revocation marker unreadable — denying', {
      uid,
      error: marker.error,
    })
    return true
  }
  return isTokenRevoked(authTime, marker.kind === 'value' ? marker.epoch : null)
}

/** A Firebase Admin "user does not exist" — the ONE getUser failure that is a
 *  definitive answer (the target is gone) rather than an outage. */
function isUserNotFound(error: unknown): boolean {
  return firebaseErrorCode(error) === 'auth/user-not-found'
}

/**
 * The BLOCKING overlay state: an impersonation cookie is present but the target's
 * identity could not be verified. It carries NO authority (`can()` fails closed on
 * `impersonationUnavailable`), and `impersonator` stays set so the block is
 * attributable and bannered. `uid` is the intended target from the SIGNED ticket —
 * known even when the live record read failed.
 */
function blockedImpersonation(targetUid: string, real: Session): Session {
  return {
    uid: targetUid,
    email: null,
    emailVerified: false,
    role: 'user',
    impersonator: { uid: real.uid, email: real.email },
    impersonationUnavailable: true,
  }
}

/**
 * Overlay a valid impersonation ticket onto the verified session. Returns the
 * effective session, `null` for "no impersonation" (the admin resumes), or a
 * BLOCKED session when the target could not be verified.
 *
 * The failure modes are deliberately NOT collapsed: a malformed/expired ticket or
 * a definitively-gone target ends the overlay safely (the admin resumes), but an
 * OUTAGE must not — falling back to the real admin on an unreachable directory
 * would drop the banner and silently restore full admin authority while the
 * impersonation cookie is still present. A bad ticket must never cost the admin
 * their session; an outage must never hand back an unbannered admin.
 */
async function resolveImpersonation(
  raw: string | undefined,
  real: Session,
): Promise<Session | null> {
  if (!raw) return null

  // A malformed/expired/wrong-actor ticket means NO impersonation, never a lost
  // session. verifyTicket touches no network, so its failure is not an outage.
  let ticket
  try {
    ticket = verifyTicket(raw, real.uid)
  } catch {
    return null
  }
  if (!ticket) return null

  // The one network call, and its failure mode is load-bearing. Resolve the
  // target's LIVE record — the same source of truth verifySessionCookie reads —
  // so the role is read fresh (the ticket authorizes WHO, never WHAT).
  let record
  try {
    record = await adminAuth().getUser(ticket.targetUid)
  } catch (error) {
    // Only a definitive not-found ends the overlay (the admin resumes). Anything
    // else — an unreachable Admin SDK, a timeout, an unknown fault — is treated as
    // an OUTAGE and BLOCKED: fail safe, because unless we are SURE the target is
    // gone, we must not resume as an unbannered admin.
    if (isUserNotFound(error)) return null
    return blockedImpersonation(ticket.targetUid, real)
  }

  const base = sessionFromUserRecord(record)
  // Refuse the overlay if the target is now DISABLED (base === null) or can now
  // open /admin — BOTH re-checked HERE, per request, not only at the mint. A
  // definitive answer, so the overlay ends and the admin resumes.
  if (!base || can(base, 'admin:access')) return null

  return { ...base, impersonator: { uid: real.uid, email: real.email } }
}

/** getSession() or bounce to /login. Use in protected server entry points. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
