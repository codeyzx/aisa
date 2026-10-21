import { beforeEach, describe, expect, it, vi } from 'vitest'

// The monitoring seam, mocked so the test can assert WHICH failures reach it.
const monitoring = vi.hoisted(() => ({ reportError: vi.fn() }))
vi.mock('@/lib/observability/report', () => monitoring)

import { CORRELATION_ID_HEADER } from './cid'
import { apiFail, apiFailFrom, apiFailFromDenial, apiOk } from './response'

function request(cid?: string): Request {
  return new Request('https://example.test/api/thing', {
    headers: cid ? { [CORRELATION_ID_HEADER]: cid } : {},
  })
}

beforeEach(() => {
  // Without this the spy accumulates across tests (vi.spyOn returns the SAME
  // spy on re-application), so `loggedRecord` would read the first test's line.
  vi.clearAllMocks()
  // apiFailFrom logs the raw error by design; keep it out of the test output and
  // let us assert on it. `lib/log`'s default sink is console.log for EVERY
  // level (a structured log is one stream; splitting it by level interleaves two
  // pipes and corrupts line order) — so this spies on log, not error.
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

/** The single JSON line `lib/log` emitted, parsed. */
function loggedRecord(): Record<string, unknown> {
  const mock = vi.mocked(console.log)
  expect(mock).toHaveBeenCalledTimes(1)
  return JSON.parse(mock.mock.calls[0][0] as string) as Record<string, unknown>
}

describe('apiOk', () => {
  it('answers 200 with a success envelope', async () => {
    const response = apiOk(request('trace-1'), { id: 'a' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      cid: 'trace-1',
      data: { id: 'a' },
    })
  })

  it('echoes the cid on the header as well as in the body', () => {
    // The header is what a proxy/CDN log can join on without parsing the body.
    const response = apiOk(request('trace-1'), null)
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe('trace-1')
  })

  it('accepts a non-200 success status', async () => {
    const response = apiOk(request('trace-1'), { id: 'a' }, 201)
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })
})

describe('apiFail', () => {
  it('derives the status from the code', async () => {
    // One code, one status, everywhere — never hand-picked at the call site.
    expect(apiFail(request(), 'UNAUTHENTICATED').status).toBe(401)
    expect(apiFail(request(), 'PERMISSION_DENIED').status).toBe(403)
    expect(apiFail(request(), 'NOT_FOUND').status).toBe(404)
    expect(apiFail(request(), 'ALREADY_EXISTS').status).toBe(409)

    const response = apiFail(request('trace-1'), 'INVALID_ARGUMENT')
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      cid: 'trace-1',
      error: { code: 'INVALID_ARGUMENT', message: 'Permintaan tidak valid' },
    })
  })

  it('carries caller-chosen details to the client', async () => {
    const response = apiFail(request('trace-1'), 'INVALID_ARGUMENT', {
      field: 'name',
    })
    await expect(response.json()).resolves.toMatchObject({
      error: { details: { field: 'name' } },
    })
  })
})

describe('apiFailFrom', () => {
  it('normalises a Firebase throw into code + status', async () => {
    const error = Object.assign(new Error('permission denied on /private/x'), {
      code: 'permission-denied',
    })
    const response = apiFailFrom(request('trace-1'), error)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      cid: 'trace-1',
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Anda tidak memiliki izin',
      },
    })
  })

  it('answers 500 for an unrecognised throw', () => {
    expect(apiFailFrom(request(), new Error('boom')).status).toBe(500)
  })

  it('does not leak the thrown error to the client', async () => {
    const secret = 'projects/p/databases/(default)/documents/private/doc-1'
    const response = apiFailFrom(request('trace-1'), new Error(secret))
    await expect(response.text()).resolves.not.toContain(secret)
  })

  it('logs the raw error server-side through lib/log, keyed by cid', () => {
    // The seam: lib/log CONSUMES the envelope's cid via
    // child({ cid }) rather than minting one of its own (one system, not
    // two). This asserts the emitted line, not a spy's call count.
    apiFailFrom(request('trace-1'), new Error('boom'))

    const record = loggedRecord()
    expect(record).toMatchObject({
      level: 'error',
      msg: '[api] unhandled error',
      cid: 'trace-1',
      code: 'INTERNAL',
    })
    // The Error is serialized, not stringified to '{}' — an unserialized error
    // would log the absence of the thing being logged.
    expect(record.error).toMatchObject({ name: 'Error', message: 'boom' })
  })

  it('logs the cid that the client is handed back, so the two join', () => {
    // THIS is the item: a cid in the browser's response and the same cid in the
    // server log line. Asserted, never assumed.
    const response = apiFailFrom(request(), new Error('boom'))
    expect(loggedRecord().cid).toBe(response.headers.get(CORRELATION_ID_HEADER))
  })

  it('reports a cid even when the caller sent none', async () => {
    const response = apiFailFrom(request(), new Error('boom'))
    const body = (await response.json()) as { cid: string }
    expect(body.cid).toBeTruthy()
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(body.cid)
  })
})

describe('apiFailFromDenial', () => {
  it('maps the denial set onto the closed HTTP taxonomy', () => {
    expect(apiFailFromDenial(request(), 'unauthenticated').status).toBe(401)
    expect(apiFailFromDenial(request(), 'forbidden').status).toBe(403)
  })
})

describe('cache-control', () => {
  // Every envelope is per-request and most are per-session. The header lives in
  // the one private `jsonResponse` helper so no call site can forget it — these
  // read the real Response, one per public entry point, so removing it from the
  // helper reddens all four rather than a single snapshot.
  it('is no-store on a success envelope', () => {
    expect(
      apiOk(request('trace-1'), { id: 'a' }).headers.get('cache-control'),
    ).toBe('no-store')
  })

  it('is no-store on an expected failure', () => {
    expect(
      apiFail(request('trace-1'), 'NOT_FOUND').headers.get('cache-control'),
    ).toBe('no-store')
  })

  it('is no-store on an unexpected throw', () => {
    expect(
      apiFailFrom(request('trace-1'), new Error('boom')).headers.get(
        'cache-control',
      ),
    ).toBe('no-store')
  })

  it('is no-store on an authorization denial', () => {
    expect(
      apiFailFromDenial(request('trace-1'), 'unauthenticated').headers.get(
        'cache-control',
      ),
    ).toBe('no-store')
  })
})

/**
 * `apiFailFrom` CATCHES and returns an envelope, so the throw never
 * propagates and `onRequestError` never fires — an unexpected route failure was
 * visible only in the server log. Only INTERNAL is reported: everything else
 * reaching here was successfully classified by `normalizeError`, so it is a
 * known condition, and alerting on those would bury the real ones.
 */
describe('apiFailFrom — what reaches the monitoring seam', () => {
  it('reports an unclassifiable throw as INTERNAL, tagged with the cid', () => {
    const error = new Error('something nobody anticipated')

    apiFailFrom(request('cid-internal'), error)

    expect(monitoring.reportError).toHaveBeenCalledTimes(1)
    const [reported, context] = monitoring.reportError.mock.calls[0]
    expect(reported).toBe(error)
    expect(context).toStrictEqual({ cid: 'cid-internal', code: 'INTERNAL' })
  })

  it('does NOT report a classified provider condition', () => {
    // A Firestore not-found and an outage are known conditions with known
    // remedies. They belong in the log, not in an alert stream.
    for (const code of ['not-found', 'permission-denied', 'unavailable']) {
      apiFailFrom(request(), Object.assign(new Error(code), { code }))
    }

    expect(monitoring.reportError).not.toHaveBeenCalled()
  })

  it('does NOT report an expected denial or a plain apiFail', () => {
    apiFailFromDenial(request(), 'unauthenticated')
    apiFail(request(), 'INVALID_ARGUMENT')

    expect(monitoring.reportError).not.toHaveBeenCalled()
  })
})
