/**
 * The page-level guards. `redirect()` is mocked to THROW, exactly as Next's real
 * one does — a guard that computes a redirect but keeps going would still return
 * a session to the page, and a non-throwing mock would let that bug pass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PASSWORD_CHANGE_PATH } from '@/lib/auth/constants'
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
    email: 'admin@aixel.test',
    emailVerified: true,
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

  it('redirects a session owing a password change', async () => {
    sessionMock.getSession.mockResolvedValue(
      session({ mustChangePassword: true }),
    )
    sessionMock.requireSession.mockResolvedValue(
      session({ mustChangePassword: true }),
    )
    expect(await redirectedTo(requireReadySession)).toBe(PASSWORD_CHANGE_PATH)
  })
})

describe('requireCapability', () => {
  it('returns the session when the role grants the capability', async () => {
    expect(await requireCapability('admin:access')).toMatchObject({
      uid: 'uid-1',
    })
  })

  it('redirects to /403 when the role does not grant it', async () => {
    sessionMock.getSession.mockResolvedValue(session({ role: 'user' }))
    expect(await redirectedTo(() => requireCapability('admin:access'))).toBe(
      '/403',
    )
  })

  it('redirects to /403 when the deployment has turned the capability off', async () => {
    availability.isCapabilityUnavailable.mockReturnValue(true)
    expect(await redirectedTo(() => requireCapability('ai:invoke'))).toBe(
      '/403',
    )
  })

  it('sends an admin owing a password change to the password screen, not the page', async () => {
    // The case that motivates layering the guards: an admin's role DOES grant
    // `admin:access`, so a capability check alone would let a session that owes a
    // password change straight into the admin surface.
    sessionMock.getSession.mockResolvedValue(
      session({ mustChangePassword: true }),
    )
    sessionMock.requireSession.mockResolvedValue(
      session({ mustChangePassword: true }),
    )
    expect(await redirectedTo(() => requireCapability('admin:access'))).toBe(
      PASSWORD_CHANGE_PATH,
    )
  })
})

/**
 * The shared gate. These are the cases the four boundaries inherit, so they are
 * asserted once here rather than four times in four vocabularies.
 */
describe('authorizeSession', () => {
  it('authorizes a ready session whose role grants the capability', async () => {
    const result = await authorizeSession('admin:access')
    expect(result).toMatchObject({ ok: true, session: { uid: 'uid-1' } })
  })

  it('denies an absent session as unauthenticated, not forbidden', async () => {
    // The remedy differs: sign in. A boundary told "forbidden" would send a
    // signed-out user looking for an administrator.
    sessionMock.getSession.mockResolvedValue(null)
    expect(await authorizeSession('admin:access')).toEqual({
      ok: false,
      denial: 'unauthenticated',
    })
  })

  it('denies a password-owing session BEFORE consulting the capability', async () => {
    // Order is the whole point: this session's admin role would satisfy
    // `admin:access`, so a capability-first gate would let it through.
    sessionMock.getSession.mockResolvedValue(
      session({ mustChangePassword: true }),
    )
    expect(await authorizeSession('admin:access')).toEqual({
      ok: false,
      denial: 'password_change_required',
    })
  })

  it('denies a capability the deployment has turned off, even for an admin', async () => {
    availability.isCapabilityUnavailable.mockReturnValue(true)
    expect(await authorizeSession('ai:invoke')).toEqual({
      ok: false,
      denial: 'forbidden',
    })
  })

  it('denies a role that does not hold the capability', async () => {
    sessionMock.getSession.mockResolvedValue(session({ role: 'user' }))
    expect(await authorizeSession('admin:access')).toEqual({
      ok: false,
      denial: 'forbidden',
    })
  })
})
