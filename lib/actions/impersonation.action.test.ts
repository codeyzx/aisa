import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IMPERSONATION_COOKIE } from '@/lib/auth/impersonation'

/**
 * The one property that matters for the stop action, proven at the boundary: an
 * explicit stop CLEARS the overlay cookie unconditionally — including from a
 * fallback session that carries no impersonator (an absent, expired, tampered, or
 * WRONG-ACTOR ticket). A stop that returned without clearing would leave a ticket
 * that resumes the moment its real actor's session returns to the browser.
 *
 * A pure unit test, not an emulator one: everything here is control flow around a
 * cookie delete and a redirect, so the Firebase-touching seams (audit, durable
 * audit) are stubbed to no-ops and the assertion is entirely about which cookie
 * was deleted and where the action redirected.
 */

/** Records every cookie delete and lets `redirect` signal by throwing, as Next does. */
const box = vi.hoisted(() => ({
  session: null as { uid: string; impersonator?: { uid: string } } | null,
  deleted: [] as string[],
}))

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`)
    this.name = 'RedirectSignal'
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to)
  },
}))

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      delete: (name: string) => {
        box.deleted.push(name)
      },
      set: () => undefined,
      get: () => undefined,
    }),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: () => Promise.resolve(box.session),
}))

// The audit seams reach Firestore/stdout; the stop action's contract is that they
// are best-effort and never block the clear, so stubbing them proves nothing away.
vi.mock('@/lib/data/audit', () => ({ audit: () => undefined }))
vi.mock('@/lib/audit/account-audit.repo', () => ({
  startAccountAudit: () => Promise.resolve('audit-id'),
  settleAccountAudit: () => Promise.resolve(),
}))

const { stopImpersonationFormAction } = await import('./impersonation.action')

/** Run the action and return the redirect target it signalled. */
async function runStop(): Promise<string> {
  try {
    await stopImpersonationFormAction()
  } catch (error) {
    if (error instanceof RedirectSignal) return error.to
    throw error
  }
  throw new Error('the stop action returned without redirecting')
}

beforeEach(() => {
  box.session = null
  box.deleted = []
})

describe('stopImpersonationFormAction', () => {
  it('clears the overlay cookie when a real impersonation is stopped', async () => {
    box.session = { uid: 'target-uid', impersonator: { uid: 'admin-uid' } }
    const to = await runStop()
    expect(box.deleted).toContain(IMPERSONATION_COOKIE)
    expect(to).toBe('/admin')
  })

  it('STILL clears the cookie from a fallback session with no impersonator', async () => {
    // The regression this covers: a wrong-actor / expired / tampered ticket resolves to a
    // session with no impersonator. The old early `redirect('/dashboard')` returned
    // before the clear, leaving a ticket that could resume for its real actor.
    box.session = { uid: 'some-admin' }
    const to = await runStop()
    expect(box.deleted).toContain(IMPERSONATION_COOKIE)
    expect(to).toBe('/dashboard')
  })

  it('redirects an unauthenticated caller to /login without touching cookies', async () => {
    box.session = null
    const to = await runStop()
    expect(to).toBe('/login')
    expect(box.deleted).toEqual([])
  })
})
