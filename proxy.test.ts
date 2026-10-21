import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { SESSION_COOKIE } from '@/lib/auth/constants'

import { config, proxy } from './proxy'

function request(url: string, opts?: { session?: boolean }): NextRequest {
  const headers = new Headers()
  if (opts?.session) headers.set('cookie', `${SESSION_COOKIE}=anything`)
  return new NextRequest(new URL(url, 'http://localhost'), { headers })
}

/**
 * The proxy is the OPTIMISTIC gate (cookie presence, never verification), so
 * these assert its two-lane behaviour, not authz. The load-bearing cases: a
 * protected page keeps where the reader was going, and an `/api/**` miss gets the
 * JSON envelope rather than a login redirect (a 307 saved by a `fetch` is login
 * HTML at 200 — the failure this lane exists to prevent).
 */
describe('proxy', () => {
  it('preserves the requested path and query in ?next on a cookie-less page', () => {
    const res = proxy(request('/assets?status=retired&sort=value:asc'))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.pathname).toBe('/login')
    // Round-trips through URL decoding — the reader lands back exactly here.
    expect(location.searchParams.get('next')).toBe(
      '/assets?status=retired&sort=value:asc',
    )
  })

  it('answers a cookie-less /api/** request with JSON, never a login redirect', async () => {
    const res = proxy(request('/api/assets'))
    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
    const body = await res.json()
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('lets a request carrying a session cookie through untouched', () => {
    const res = proxy(request('/assets', { session: true }))
    // NextResponse.next() carries no redirect Location.
    expect(res.headers.get('location')).toBeNull()
  })

  it('does not gate a public prefix', () => {
    const res = proxy(request('/login'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('does not gate a descendant of a public prefix', () => {
    // /api/auth/session is the real cookie-exchange route — public by descent.
    const res = proxy(request('/api/auth/session'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).not.toBe(401)
  })

  it('does not gate the exact health path', () => {
    const res = proxy(request('/api/health'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).not.toBe(401)
  })

  // Segment-aware matching: a lookalike SIBLING that merely shares a string
  // prefix must NOT inherit public access. A raw startsWith would leak all three.
  it('gates a page whose path only shares a prefix with /login', () => {
    const res = proxy(request('/login-extra'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login')
  })

  it('gates an /api path that only shares a prefix with /api/auth', async () => {
    const res = proxy(request('/api/authx'))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('gates /api/health-check, a sibling of the health probe', async () => {
    const res = proxy(request('/api/health-check'))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('answers a cookie-less DOTTED /api path with the envelope too', async () => {
    // A version-shaped segment is the realistic case. The function has always
    // handled this correctly — `startsWith('/api/')` does not care about dots —
    // which is exactly why the defect lived in the MATCHER instead, where no
    // test that calls `proxy()` could see it. See the config block below.
    const res = proxy(request('/api/export/assets/v1.2'))
    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })
})

/**
 * The matcher decides whether `proxy()` RUNS at all, so the lane assertions above
 * are worth exactly as much as this. The page pattern excludes any path
 * containing a dot (so static files are not gated), and that exclusion could not
 * tell `/logo.svg` from `/api/export/assets/v1.2` — so a dotted `/api` path
 * skipped the proxy entirely and a cookie-less request to it got Next's routing
 * answer instead of the `UNAUTHENTICATED` envelope this file guarantees.
 *
 * `matches` approximates Next's compilation for the only two entry forms in use:
 * a raw negative-lookahead regex, and the `:param*` path-to-regexp form.
 */
function matches(entry: string, pathname: string): boolean {
  const source = entry.includes(':path*')
    ? `^${entry.replace('/:path*', '(?:/.*)?')}$`
    : `^${entry}$`
  return new RegExp(source).test(pathname)
}

describe('proxy config.matcher', () => {
  const dotted = ['/api/export/assets/v1.2', '/api/foo.bar']

  it('excludes dotted paths from the general page pattern — the root cause', () => {
    // Documents WHY a dedicated /api entry is required. If this ever starts
    // passing, the page pattern changed and the entry below may be redundant.
    const pagePattern = config.matcher.find((entry) => entry.includes('(?!'))
    expect(pagePattern).toBeDefined()
    for (const pathname of dotted) {
      expect(matches(pagePattern as string, pathname)).toBe(false)
    }
  })

  it('still matches every dotted /api path through some entry', () => {
    // The invariant that must hold however the matcher is written: no /api path
    // may escape the proxy. Deleting the '/api/:path*' entry fails this.
    for (const pathname of dotted) {
      expect(config.matcher.some((entry) => matches(entry, pathname))).toBe(
        true,
      )
    }
  })

  it('keeps gating a page route that merely shares the /api prefix', () => {
    // Why the fix is a separate entry and not `(?!api|…)` in the lookahead:
    // that would also swallow /api-docs, a normal page, and silently stop
    // gating it.
    expect(config.matcher.some((entry) => matches(entry, '/api-docs'))).toBe(
      true,
    )
  })

  it('still lets static files past', () => {
    for (const pathname of ['/logo.svg', '/favicon.ico']) {
      expect(config.matcher.some((entry) => matches(entry, pathname))).toBe(
        false,
      )
    }
  })
})
