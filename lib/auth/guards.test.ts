/**
 * The page-level guards. `redirect()` is mocked to THROW, exactly as Next's real
 * one does — a guard that computes a redirect but keeps going would still return
 * a session to the page, and a non-throwing mock would let that bug pass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authorizeSession,
  requireCapability,
  requireReadySession,
} from '@/lib/auth/guards'
import type { Session } from '@/lib/auth/session.contract'

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT ${to}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to)
  },
}))

const sessionMock = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => sessionMock)

const availability = vi.hoisted(() => ({ isCapabilityUnavailable: vi.fn() }))
vi.mock('@/lib/auth/capability-availability', () => availability)

function session(overrides: Partial<Session> = {}): Session {
  return {
    uid: 'uid-1',
    email: null,
    emailVerified: false,
    role: 'admin',
    ...overrides,
  }
}

/** Run `fn` and report where it redirected, or null if it returned normally. */
async function redirectedTo(
  fn: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (error) {
    if (error instanceof RedirectError) return error.to
    throw error
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.requireSession.mockResolvedValue(session())
  sessionMock.getSession.mockResolvedValue(session())
  availability.isCapabilityUnavailable.mockReturnValue(false)
})

describe('requireReadySession', () => {
  it('returns an ordinary session unchanged', async () => {
    expect(await requireReadySession()).toMatchObject({ uid: 'uid-1' })
  })
})

describe('requireCapability', () => {
  it('returns the session when the role grants the capability', async () => {
    expect(await requireCapability('aisa:configure')).toMatchObject({
      uid: 'uid-1',
    })
  })

  it('redirects to /403 when the role does not grant it', async () => {
    sessionMock.getSession.mockResolvedValue(session({ role: 'user' }))
    expect(await redirectedTo(() => requireCapability('aisa:configure'))).toBe(
      '/403',
    )
  })

  it('redirects to /403 when the deployment has turned the capability off', async () => {
    availability.isCapabilityUnavailable.mockReturnValue(true)
    expect(await redirectedTo(() => requireCapability('aisa:configure'))).toBe(
      '/403',
    )
  })
})

/**
 * The shared gate. These are the cases the four boundaries inherit, so they are
 * asserted once here rather than four times in four vocabularies.
 */
describe('authorizeSession', () => {
  it('authorizes a session whose role grants the capability', async () => {
    const result = await authorizeSession('aisa:configure')
    expect(result).toMatchObject({ ok: true, session: { uid: 'uid-1' } })
  })

  it('denies an absent session as unauthenticated, not forbidden', async () => {
    // The remedy differs: sign in. A boundary told "forbidden" would send a
    // signed-out user looking for an administrator.
    sessionMock.getSession.mockResolvedValue(null)
    expect(await authorizeSession('aisa:configure')).toEqual({
      ok: false,
      denial: 'unauthenticated',
    })
  })

  it('denies a capability the deployment has turned off, even for an admin', async () => {
    availability.isCapabilityUnavailable.mockReturnValue(true)
    expect(await authorizeSession('aisa:configure')).toEqual({
      ok: false,
      denial: 'forbidden',
    })
  })

  it('denies a role that does not hold the capability', async () => {
    sessionMock.getSession.mockResolvedValue(session({ role: 'user' }))
    expect(await authorizeSession('aisa:configure')).toEqual({
      ok: false,
      denial: 'forbidden',
    })
  })
})
