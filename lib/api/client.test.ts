import { afterEach, describe, expect, it, vi } from 'vitest'

import { CORRELATION_ID_HEADER } from './cid'
import { apiFetch } from './client'
import { fail, ok } from './envelope'
import { toApiError } from './errors.contract'

function mockFetch(response: Response | Error) {
  const spy = vi.fn((_input: string | URL, _init?: RequestInit) =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

function sentHeaders(spy: ReturnType<typeof mockFetch>): Headers {
  const init = spy.mock.calls[0]?.[1]
  return init?.headers as Headers
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch — correlation id', () => {
  it('reuses a caller-supplied cid instead of minting a new one', async () => {
    // The hop case: a route handler calling another route forwards the cid it
    // was given. Overwriting it here would cut the trace at exactly the hop
    // worth tracing, and "one id, one system" would hold for browser
    // calls only.
    const spy = mockFetch(Response.json(ok('server-cid', { id: 'a' })))
    await apiFetch('/api/thing', {
      headers: { [CORRELATION_ID_HEADER]: 'inbound-cid' },
    })

    expect(sentHeaders(spy).get(CORRELATION_ID_HEADER)).toBe('inbound-cid')
  })

  it('sends a cid header on every call', async () => {
    const spy = mockFetch(Response.json(ok('server-cid', { id: 'a' })))
    await apiFetch('/api/thing')

    expect(sentHeaders(spy).get(CORRELATION_ID_HEADER)).toBeTruthy()
  })

  it('keeps caller headers while adding the cid', async () => {
    const spy = mockFetch(Response.json(ok('server-cid', null)))
    await apiFetch('/api/thing', {
      headers: { 'content-type': 'application/json' },
    })

    const headers = sentHeaders(spy)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get(CORRELATION_ID_HEADER)).toBeTruthy()
  })

  it('reports a cid even when the request never reached the server', async () => {
    // The cid is minted client-side, so a network failure still has an id — that
    // is the point of the envelope owning it (one system, not two).
    mockFetch(new TypeError('Failed to fetch'))
    const response = await apiFetch('/api/thing')

    expect(response.ok).toBe(false)
    expect(response.cid).toBeTruthy()
  })
})

describe('apiFetch — never throws', () => {
  it('returns the success envelope verbatim', async () => {
    mockFetch(Response.json(ok('server-cid', { id: 'a' })))
    await expect(apiFetch<{ id: string }>('/api/thing')).resolves.toEqual({
      ok: true,
      cid: 'server-cid',
      data: { id: 'a' },
    })
  })

  it('returns the failure envelope verbatim, code and all', async () => {
    // The server already chose the code; the client does not re-derive one from
    // the status line, which would be a second taxonomy for the same fact.
    mockFetch(
      Response.json(fail('server-cid', toApiError('NOT_FOUND')), {
        status: 404,
      }),
    )
    await expect(apiFetch('/api/thing')).resolves.toEqual({
      ok: false,
      cid: 'server-cid',
      error: { code: 'NOT_FOUND', message: 'Tidak ditemukan' },
    })
  })

  it('turns a network failure into a failure envelope', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    const response = await apiFetch('/api/thing')

    expect(response.ok).toBe(false)
    if (response.ok) expect.unreachable('network failure must not be a success')
    expect(response.error.code).toBe('UNAVAILABLE')
  })

  it('turns a non-JSON body into a failure envelope', async () => {
    // A proxy answering an HTML 502 must not blow up JSON.parse at the call site.
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    const response = await apiFetch('/api/thing')

    expect(response.ok).toBe(false)
    if (response.ok) expect.unreachable('HTML body must not be a success')
    expect(response.error.code).toBe('UNAVAILABLE')
    expect(response.error.details).toEqual({ status: 502 })
  })

  it('rejects valid JSON that is not our envelope', async () => {
    // Parses fine, but reading .data off it would hand back undefined as if the
    // call had succeeded.
    mockFetch(
      Response.json({ message: 'from some other service' }, { status: 200 }),
    )
    const response = await apiFetch('/api/thing')

    expect(response.ok).toBe(false)
    if (response.ok) expect.unreachable('foreign JSON must not be a success')
    expect(response.error.code).toBe('UNAVAILABLE')
  })

  it('turns a failure envelope with an empty error into a clean UNAVAILABLE', async () => {
    // A malformed failure — `error:{}` with no code or message — must not reach
    // the caller as an ApiCallError with an undefined code. isApiResponse rejects
    // it, so apiFetch answers a well-formed UNAVAILABLE with a real code to act
    // on, keeping "the client always gets a code" true.
    mockFetch(
      Response.json(
        { ok: false, cid: 'server-cid', error: {} },
        { status: 500 },
      ),
    )
    const response = await apiFetch('/api/thing')

    expect(response.ok).toBe(false)
    if (response.ok)
      expect.unreachable('a malformed failure must not be a success')
    expect(response.error.code).toBe('UNAVAILABLE')
    expect(response.error.message.length).toBeGreaterThan(0)
  })
})
