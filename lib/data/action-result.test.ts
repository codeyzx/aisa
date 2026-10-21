import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Session } from '@/lib/auth/session'
import { signedInAs } from '@/test/builders/session'

// `child` returns the same spy object, so an assertion on `logger.error` reads
// the line whether it was emitted directly or through a cid-bound child. The
// bindings themselves are asserted via `logger.child`.
const logger = vi.hoisted(() => {
  const instance = { error: vi.fn(), child: vi.fn(() => instance) }
  return instance
})
const session = vi.hoisted(() => ({ current: null as Session | null }))
const availability = vi.hoisted(() => ({ unavailable: [] as string[] }))

vi.mock('@/lib/auth/capability-availability', () => ({
  isCapabilityUnavailable: (capability: string) =>
    availability.unavailable.includes(capability),
}))

vi.mock('@/lib/log', () => ({ log: logger }))
// The monitoring seam, mocked so the test can assert WHICH failures reach it.
const monitoring = vi.hoisted(() => ({ reportError: vi.fn() }))
vi.mock('@/lib/observability/report', () => monitoring)
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => session.current),
}))

import { runAction } from './action-result'
import { ConflictError, NotFoundError } from './domain-error'

beforeEach(() => {
  vi.clearAllMocks()
  availability.unavailable = []
  session.current = signedInAs('admin', {
    uid: 'admin-uid',
    email: 'admin@aixel.test',
  })
})

describe('runAction', () => {
  it('logs an unexpected server error without returning its details', async () => {
    const error = new Error('database details')

    const result = await runAction('asset:write', async () => {
      throw error
    })

    // Opaque, and now quotable: the code and the canonical message are unchanged,
    // and the reference appended to them is the FIRST SEGMENT of the cid the
    // envelope carries — so what a user reads out is a literal prefix of what an
    // operator greps for.
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a failure envelope')
    expect(result.code).toBe('internal')
    expect(result.cid).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.error).toBe(
      `Terjadi kesalahan (ref: ${result.cid?.slice(0, 8)})`,
    )
    // The raw error is logged and NEVER placed in the envelope — the id is what
    // connects the two, exactly as `apiFailFrom` connects them over HTTP.
    expect(result.error).not.toContain('database details')
    expect(logger.child).toHaveBeenCalledWith({ cid: result.cid })
    expect(logger.error).toHaveBeenCalledWith('[action] unhandled error', {
      capability: 'asset:write',
      uid: 'admin-uid',
      error,
    })
  })

  it('gives a cid to `internal` alone — every other code explains itself', async () => {
    // A `not_found` names its own cause and its own remedy, so an id would be
    // noise on the screen and a second thing for a reader to ignore.
    const result = await runAction('asset:write', async () => {
      throw new NotFoundError('asset gone')
    })

    expect(result).toEqual({
      ok: false,
      error: 'Tidak ditemukan',
      code: 'not_found',
    })
    expect(result).not.toHaveProperty('cid')
  })

  it('refuses a capability the deployment has turned off, without running fn', async () => {
    // Hiding the UI is not a gate — a server action is a public POST endpoint, so
    // a disabled capability must be refused HERE. The admin below is granted
    // ai:invoke by role, so only the availability check can stop this.
    availability.unavailable = ['ai:invoke']
    const fn = vi.fn(async () => 'generated')

    const result = await runAction('ai:invoke', fn)

    expect(result).toEqual({
      ok: false,
      error: 'Anda tidak memiliki izin',
      code: 'forbidden',
    })
    expect(fn).not.toHaveBeenCalled()
  })

  it('maps a typed domain error to its code WITHOUT logging it as a bug', async () => {
    // The whole point of the domain-error type: an expected not-found must not
    // land in the unhandled-error log, where it would bury a real bug in noise.
    const result = await runAction('asset:write', async () => {
      throw new NotFoundError('asset not found')
    })

    expect(result).toEqual({
      ok: false,
      error: 'Tidak ditemukan',
      code: 'not_found',
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('maps a conflict to its code, and never leaks the thrown message', async () => {
    // The client gets the canonical message for `conflict`, never the server-side
    // string the repo threw (which may name a field or a key).
    const result = await runAction('asset:write', async () => {
      throw new ConflictError('asset attachment changed since it was read')
    })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'conflict' })
    expect(result).not.toMatchObject({
      error: 'asset attachment changed since it was read',
    })
    expect(logger.error).not.toHaveBeenCalled()
  })
})

/**
 * `runAction` CATCHES, so an unexpected failure never propagates and
 * `onRequestError` never fires for it. Before this the error reached the server
 * log and nothing else — the client got a polite `internal` and monitoring
 * never learned an incident had happened. Equally important is the negative
 * half: expected denials must NOT be reported, or real incidents drown in noise
 * until the alerts stop being read.
 */
describe('runAction — what reaches the monitoring seam', () => {
  it('reports an unexpected throw, tagged with the cid the envelope carries', async () => {
    const error = new Error('database details')

    const result = await runAction('asset:write', async () => {
      throw error
    })

    expect(monitoring.reportError).toHaveBeenCalledTimes(1)
    const [reported, context] = monitoring.reportError.mock.calls[0]
    expect(reported).toBe(error)
    expect(context).toStrictEqual({
      cid: result.ok ? undefined : result.cid,
      capability: 'asset:write',
    })
    // The uid goes to the LOG, never to the reporter — "which user" is
    // answerable from the log via the cid, and stays there.
    expect(context).not.toHaveProperty('uid')
  })

  it('does NOT report a typed domain failure — that is the system working', async () => {
    await runAction('asset:write', async () => {
      throw new NotFoundError('asset')
    })
    await runAction('asset:write', async () => {
      throw new ConflictError('asset')
    })

    expect(monitoring.reportError).not.toHaveBeenCalled()
  })

  it('does NOT report a validation failure', async () => {
    const { z } = await import('zod')
    await runAction('asset:write', async () => {
      z.object({ name: z.string() }).parse({ name: 1 })
    })

    expect(monitoring.reportError).not.toHaveBeenCalled()
  })

  it('does NOT report an authorization denial', async () => {
    session.current = null

    const result = await runAction('asset:write', async () => 'unreachable')

    expect(result.ok).toBe(false)
    expect(monitoring.reportError).not.toHaveBeenCalled()
  })
})
