import { describe, expect, it } from 'vitest'

import { isSameOrigin } from './origin'

/**
 * The URL passed to `Request` is DELIBERATELY unrelated to the headers under test.
 * The bug this suite failed to catch was a check that compared against
 * `new URL(request.url).origin`; a fixture where the URL and the Origin agree
 * cannot tell that apart from a correct implementation. Here the request URL is
 * always `http://0.0.0.0:3000` — what the standalone server actually reports
 * inside the container — so any implementation that reads it fails these tests.
 */
function request(
  origin: string | null,
  headers: Record<string, string> = {},
): Request {
  const all = new Headers(headers)
  if (origin) all.set('origin', origin)
  return new Request('http://0.0.0.0:3000/api/auth/session', { headers: all })
}

describe('isSameOrigin', () => {
  it('allows an absent Origin', () => {
    // sameSite=lax is the other half of this defence — see the route.
    expect(isSameOrigin(request(null, { host: 'app.example.test' }))).toBe(true)
  })

  it('allows an Origin matching the Host the browser addressed', () => {
    expect(
      isSameOrigin(
        request('https://app.example.test', { host: 'app.example.test' }),
      ),
    ).toBe(true)
  })

  it('allows an Origin matching X-Forwarded-Host behind a proxy', () => {
    // The proxy terminates TLS, so the browser says https and the app is dialled
    // over http on a different host entirely. This is the deployment shape
    // docs/reference/contracts/operations.md requires, and the old check rejected it
    // outright.
    expect(
      isSameOrigin(
        request('https://app.example.test', {
          host: 'app-container:3000',
          'x-forwarded-host': 'app.example.test',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe(true)
  })

  it('uses only the FIRST X-Forwarded-Host entry', () => {
    expect(
      isSameOrigin(
        request('https://app.example.test', {
          host: 'app-container:3000',
          'x-forwarded-host': 'app.example.test, inner-proxy.internal',
        }),
      ),
    ).toBe(true)
  })

  it('rejects a different host — the actual CSRF case', () => {
    expect(
      isSameOrigin(
        request('https://evil.example.test', { host: 'app.example.test' }),
      ),
    ).toBe(false)
  })

  it('rejects a different port', () => {
    expect(
      isSameOrigin(
        request('https://app.example.test:8443', { host: 'app.example.test' }),
      ),
    ).toBe(false)
  })

  it('ignores the scheme, because a TLS-terminating proxy legitimately differs', () => {
    expect(
      isSameOrigin(
        request('http://app.example.test', { host: 'app.example.test' }),
      ),
    ).toBe(true)
  })

  it('rejects a malformed Origin', () => {
    expect(
      isSameOrigin(request('not an origin', { host: 'app.example.test' })),
    ).toBe(false)
  })

  it('rejects when no host header is present at all', () => {
    // Nothing to compare against is not a reason to let a state change through.
    expect(isSameOrigin(request('https://app.example.test'))).toBe(false)
  })

  it('never trusts the request URL — the container regression', () => {
    // `http://0.0.0.0:3000` is the fixture's request URL. An implementation that
    // compared against it would return true here; the browser-addressed host is
    // what decides.
    expect(
      isSameOrigin(
        request('http://0.0.0.0:3000', { host: 'app.example.test' }),
      ),
    ).toBe(false)
  })
})
