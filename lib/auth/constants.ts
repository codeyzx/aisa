/**
 * Pure auth constants — edge-safe, no server-only imports. Shared by the server
 * DAL (session/guards) and the edge proxy so both agree on the cookie name and
 * public route surface.
 */

/** Name of the httpOnly Firebase session cookie. */
export const SESSION_COOKIE = 'session'

/**
 * Session cookie lifetime. 5 days (Fork B: logout is clear-only — no refresh-token
 * revocation — so the window is deliberately short to bound a stolen cookie).
 */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000

/**
 * Route prefixes reachable without a session (login page, the auth API, and the
 * liveness probe).
 *
 * `/api/health` is here rather than carved out of `proxy.ts`'s matcher because
 * this constant already owns "the public route surface" — a second spelling in
 * the regex would fork one concept across two files. Without the entry the
 * matcher catches every dot-less path and a cookie-less prober gets 307 ->
 * /login, i.e. a health endpoint that is not a health endpoint.
 */
export const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/health'] as const

/**
 * Where a session carrying `mustChangePassword` is sent instead of the page it
 * asked for. Deliberately NOT public: it needs a verified session to know WHOSE
 * password is being replaced, so the proxy still bounces a cookie-less visitor
 * to /login before it is ever reached.
 *
 * It lives here rather than in `guards.ts` because both the guard that redirects
 * TO it and the page that must not redirect AWAY from it need to name it, and
 * they sit on opposite sides of the server-only line.
 */
export const PASSWORD_CHANGE_PATH = '/password/change'

/**
 * Is `pathname` on the public route surface? Matching is SEGMENT-AWARE: a prefix
 * matches its EXACT path or a DESCENDANT under it (`/api/health` and
 * `/api/health/*`), never a lookalike sibling. A raw `startsWith` would open
 * `/login-extra`, `/api/authx`, and `/api/health-check` — paths that share a
 * prefix but are different routes — to unauthenticated access. Anything added
 * under a public prefix is public by default, so put a sub-route there only if it
 * is also safe to serve unauthenticated.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
