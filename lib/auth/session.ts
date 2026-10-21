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

import { adminAuth } from '@/lib/firebase/admin-auth'
import { SESSION_COOKIE } from './constants'
import { roleFromClaims } from './rbac'
import type { Session } from './session.contract'
import { isDefinitiveTokenRejection } from './token-rejection'

// The `Session` shape is pure and lives in `session.contract.ts` so a client
// component can name it without importing this server-only module.
export type { Session } from './session.contract'

/**
 * Verify the current session cookie and resolve a `Session`, or null if the cookie
 * is missing/invalid/expired/revoked or the account is disabled. Cached for the
 * render pass.
 *
 * THROWS when the auth provider cannot be reached. Null means "not signed in",
 * and only a definitive Firebase rejection may produce it — an outage that read
 * as null would sign every active user out. See `token-rejection.ts`.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    // checkRevoked = true: a revoked session or a disabled account is rejected
    // even while the cookie is unexpired. It costs one `accounts:lookup` per
    // render pass, which is what makes "disable the account" end a session.
    const decoded = await adminAuth().verifySessionCookie(token, true)
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      // Never trust the role claim blindly — fall back to the least-privileged role.
      role: roleFromClaims(decoded),
    }
  } catch (error) {
    // A DEFINITIVE rejection — expired, revoked, malformed, subject gone — is an
    // answer about the cookie: treat as unauthenticated.
    if (isDefinitiveTokenRejection(error)) return null
    // Anything else means we could not REACH the provider. Returning null here
    // would report an outage as "invalid credentials" and redirect a
    // validly-signed-in user to /login. Throw instead: the cookie is left intact
    // and the caller surfaces "temporarily unavailable".
    throw error
  }
})

/** getSession() or bounce to /login. Use in protected server entry points. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}
