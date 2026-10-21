import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SESSION_COOKIE } from '@/lib/auth/constants'
import { getSession } from '@/lib/auth/session'

/**
 * `getSession()` against a faked Firebase Admin: the cookie jar and
 * `verifySessionCookie` are the two seams it reads. What is under test is the
 * mapping (claims → `Session`) and the fail-safe split between "the cookie is
 * bad" (null) and "the provider is unreachable" (throw).
 */
const cookieJar = vi.hoisted(() => ({ values: {} as Record<string, string> }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.values[name]
      return value === undefined ? undefined : { value }
    },
  }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const adminSdk = vi.hoisted(() => ({ verifySessionCookie: vi.fn() }))
vi.mock('@/lib/firebase/admin-auth', () => ({ adminAuth: () => adminSdk }))

function authError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieJar.values = { [SESSION_COOKIE]: 'session-cookie' }
  adminSdk.verifySessionCookie.mockResolvedValue({
    uid: 'manager-uid',
    email: 'manager@aisa.local',
    email_verified: true,
    role: 'admin',
  })
})

describe('getSession', () => {
  it('returns null with no cookie and never calls Firebase', async () => {
    cookieJar.values = {}
    expect(await getSession()).toBeNull()
    expect(adminSdk.verifySessionCookie).not.toHaveBeenCalled()
  })

  it('verifies with checkRevoked=true and maps the claims', async () => {
    expect(await getSession()).toEqual({
      uid: 'manager-uid',
      email: 'manager@aisa.local',
      emailVerified: true,
      role: 'admin',
    })
    expect(adminSdk.verifySessionCookie).toHaveBeenCalledWith(
      'session-cookie',
      true,
    )
  })

  it('reads a missing or unknown role claim as the least-privileged user', async () => {
    adminSdk.verifySessionCookie.mockResolvedValue({
      uid: 'u',
      role: 'superadmin',
    })
    expect(await getSession()).toMatchObject({ role: 'user', email: null })
  })

  for (const code of [
    'auth/session-cookie-expired',
    'auth/session-cookie-revoked',
    'auth/argument-error',
    'auth/user-disabled',
  ]) {
    it(`returns null for a definitive rejection (${code})`, async () => {
      adminSdk.verifySessionCookie.mockRejectedValue(authError(code))
      expect(await getSession()).toBeNull()
    })
  }

  it('THROWS when the provider is unreachable instead of signing the user out', async () => {
    adminSdk.verifySessionCookie.mockRejectedValue(
      authError('auth/internal-error'),
    )
    await expect(getSession()).rejects.toThrow('auth/internal-error')
  })
})
