import { apiFetch } from '@/lib/api/client'
import { unwrap } from '@/lib/api/envelope'

/**
 * Client-side session helpers: thin wrappers over the /api/auth/session route
 * handler. No Firebase, no state — a client component calls these after a
 * sign-in / sign-out and owns the router refresh.
 *
 * Built on `apiFetch` + `unwrap` rather than a bare `fetch`: the route answers
 * the envelope, so the failure already carries a `code` and a `cid`, and
 * re-deriving either here would be the second taxonomy `lib/api` exists to
 * prevent. The THROWING signature is kept deliberately — `unwrap` documents the
 * exception-based caller as legitimate, both call sites are `try/catch` already,
 * and what changes is the quality of the throw: an `ApiCallError` carrying a
 * quotable cid instead of a bare `Error('Failed to establish session')`.
 */

/**
 * Exchange a Firebase ID token for an httpOnly session cookie (POST). Throws
 * `ApiCallError` (with `code` + `cid`) if the server rejects the token.
 *
 * After it resolves, the caller MUST call `router.refresh()` so the client Router
 * Cache is dropped and server components re-render with the new session.
 */
export async function establishSession(idToken: string): Promise<void> {
  unwrap(
    await apiFetch<null>('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }),
  )
}

/**
 * Clear the session cookie (DELETE) — logout. Throws `ApiCallError` if the
 * request fails.
 *
 * After it resolves, the caller MUST call `router.refresh()` so the client Router
 * Cache is dropped and server components re-render as unauthenticated.
 */
export async function revokeSession(): Promise<void> {
  unwrap(await apiFetch<null>('/api/auth/session', { method: 'DELETE' }))
}
