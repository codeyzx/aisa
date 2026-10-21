import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SESSION_COOKIE } from '@/lib/auth/constants'
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_MS,
  mintTicket,
} from '@/lib/auth/impersonation'
import { can } from '@/lib/auth/rbac'
import { getSession } from '@/lib/auth/session'

/**
 * The impersonation OVERLAY inside `getSession()` — the highest-risk code in the
 * repo — had no session-level test. `resolveImpersonation` is not exported, so
 * every case below drives it the only honest way: through `getSession()`, reading
 * the EFFECTIVE session it returns. Each `it` names, in a comment, the exact
 * mutation in `resolveImpersonation` it would catch — a test that cannot fail is
 * worse than none.
 *
 * The mocks are the three seams `getSession()` reads:
 *  - `next/headers` — a real cookie jar keyed by name, so the test places values
 *    under the REAL constants rather than a hand-copied string.
 *  - `@/lib/firebase/admin` — `verifySessionCookie` (the admin's real cookie) and
 *    `getUser` (the impersonation target's live record).
 *  - `@/lib/auth/impersonation.config` — scoped to the one thing
 *    `impersonation.ts` reads, the HMAC secret THROUGH `getImpersonationConfig()`,
 *    exactly as `impersonation.test.ts` does. Both the test's `mintTicket` and
 *    `getSession`'s `verifyTicket` share this secret, so a ticket minted here
 *    verifies inside the overlay.
 *
 * Tickets are REAL: `mintTicket` produces a valid HMAC, an expired one (mint with
 * a past `now` so `exp <= Date.now()`), and — with one flipped signature byte — a
 * tampered one. `resolveImpersonation` runs unmocked.
 */
vi.mock('@/lib/auth/impersonation.config', () => ({
  getImpersonationConfig: () => ({ secret: 'x'.repeat(32) }),
}))

// A real cookie jar: `.get(name)` returns whatever value the test placed under
// that name, or undefined. Keyed by name so the test uses the real cookie
// constants instead of a duplicated literal.
const cookieJar = vi.hoisted(() => ({ values: {} as Record<string, string> }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.values[name]
      return value === undefined ? undefined : { value }
    },
  }),
}))

// getSession imports `redirect` (used only by requireSession); mock it so
// importing the module pulls no server-runtime requirement.
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const adminSdk = vi.hoisted(() => ({
  verifySessionCookie: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-auth', () => ({
  adminAuth: () => adminSdk,
}))

// The fourth seam: `getSession` consults the revocation marker on every request.
// Mocked at the module that owns the Firestore read, so the arithmetic under test
// (`isTokenRevoked`) stays REAL — only the storage is faked.
const revocation = vi.hoisted(() => ({ readRevocationMarker: vi.fn() }))

vi.mock('@/lib/auth/revocation', () => revocation)

const ADMIN_UID = 'admin-uid'
const ADMIN_EMAIL = 'admin@aixel.test'
const TARGET_UID = 'target-uid'
const TARGET_EMAIL = 'target@aixel.test'

/** When the admin's cookie was minted. Every marker below is placed relative to it. */
const ADMIN_AUTH_TIME = 1_700_000_000

/** The decoded session cookie for a real, signed-in admin. */
function decodedAdmin(uid = ADMIN_UID, email = ADMIN_EMAIL) {
  return {
    uid,
    email,
    email_verified: true,
    role: 'admin',
    auth_time: ADMIN_AUTH_TIME,
  }
}

/** A Firebase UserRecord for the impersonation target (non-admin by default). */
function userRecord(overrides: Record<string, unknown> = {}) {
  return {
    uid: TARGET_UID,
    email: TARGET_EMAIL,
    emailVerified: true,
    disabled: false,
    customClaims: { role: 'user' },
    ...overrides,
  }
}

/** An auth/user-not-found-shaped rejection, as getUser throws for a deleted uid. */
function authError(code: string): Error {
  const err = new Error(code) as Error & { code: string }
  err.code = code
  return err
}

beforeEach(() => {
  vi.clearAllMocks()
  // A real admin session cookie is always present: the overlay is only ever
  // resolved AFTER the real cookie has verified, so every case starts here.
  cookieJar.values = { [SESSION_COOKIE]: 'valid-session-cookie' }
  adminSdk.verifySessionCookie.mockResolvedValue(decodedAdmin())
  adminSdk.getUser.mockResolvedValue(userRecord())
  // No marker: the normal state of an account that has never been revoked.
  revocation.readRevocationMarker.mockResolvedValue({ kind: 'absent' })
})

describe('getSession — the impersonation overlay', () => {
  it('with no impersonation cookie, returns the real admin session and no impersonator', async () => {
    // Catches an overlay that fabricates an `impersonator` without a ticket — the
    // negative baseline: `impersonator` must be ABSENT on an ordinary session.
    // (Verified: fabricating one for a missing cookie flips this test.)
    const session = await getSession()

    expect(session).toMatchObject({
      uid: ADMIN_UID,
      email: ADMIN_EMAIL,
      role: 'admin',
    })
    expect(session?.impersonator).toBeUndefined()
  })

  it('with a valid ticket for a non-admin target, the effective session IS the target and carries the impersonator', async () => {
    // Catches: not overlaying the target at all (returning null/real), losing the
    // `impersonator` field, or reading role from the ticket instead of the live
    // record. This is the one case where the overlay must actually apply.
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)

    const session = await getSession()

    expect(session).toMatchObject({
      uid: TARGET_UID,
      email: TARGET_EMAIL,
      role: 'user',
      impersonator: { uid: ADMIN_UID, email: ADMIN_EMAIL },
    })
  })

  it('with an expired ticket, falls back to the real admin session', async () => {
    // Catches an overlay that stops honoring ticket expiry — verifyTicket returns
    // null once exp <= now, and an expired ticket must not apply. (Verified: making
    // the same ticket un-expired flips this test to overlaying the target.)
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(
      ADMIN_UID,
      TARGET_UID,
      Date.now() - IMPERSONATION_TTL_MS - 1000,
    )

    const session = await getSession()

    expect(session?.uid).toBe(ADMIN_UID)
    expect(session?.role).toBe('admin')
    expect(session?.impersonator).toBeUndefined()
  })

  it('with a tampered ticket (one flipped signature byte), falls back to the real admin session', async () => {
    // Catches an overlay that stops rejecting a forged HMAC — a tampered ticket
    // must not apply. (Verified: an un-tampered ticket flips this test to
    // overlaying the target.)
    const raw = mintTicket(ADMIN_UID, TARGET_UID)
    const separator = raw.lastIndexOf('.')
    const signature = raw.slice(separator + 1)
    const flipped = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1)
    cookieJar.values[IMPERSONATION_COOKIE] =
      `${raw.slice(0, separator)}.${flipped}`

    const session = await getSession()

    expect(session?.uid).toBe(ADMIN_UID)
    expect(session?.impersonator).toBeUndefined()
  })

  it('with a ticket minted for a DIFFERENT admin, refuses and stays the current admin', async () => {
    // Catches: passing anything but `real.uid` as expectedActorUid to verifyTicket
    // (e.g. a constant, or the target uid). The ticket must bind to the verified
    // session's uid — this is the stolen-ticket replay guard at the session layer.
    adminSdk.verifySessionCookie.mockResolvedValue(
      decodedAdmin('admin-B', 'adminB@aixel.test'),
    )
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket('admin-A', TARGET_UID)

    const session = await getSession()

    expect(session?.uid).toBe('admin-B')
    expect(session?.impersonator).toBeUndefined()
  })

  it('when the target has been deleted (auth/user-not-found), the admin keeps their OWN session', async () => {
    // A DEFINITIVE not-found is the one getUser failure that ends the overlay
    // safely: the target is gone, so the admin resumes their own session. This
    // must NOT sign the admin out (folding into getSession's catch would), and it
    // must NOT block (that is reserved for an OUTAGE — the next test). The code is
    // exactly 'auth/user-not-found'; anything else is treated as unverifiable.
    adminSdk.getUser.mockRejectedValue(authError('auth/user-not-found'))
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)

    const session = await getSession()

    expect(session?.uid).toBe(ADMIN_UID)
    expect(session?.role).toBe('admin')
    expect(session?.impersonator).toBeUndefined()
    expect(session?.impersonationUnavailable).toBeUndefined()
  })

  it('when the directory is UNREACHABLE, blocks with a de-authorized bannered session — never the unbannered admin', async () => {
    // THE SAFETY INVARIANT. An outage during an active overlay must not degrade to
    // an apparently ordinary admin: getUser throwing anything that is not a
    // definitive not-found is an inability to VERIFY identity, so the effective
    // session is BLOCKED — no authority, still attributable to the admin, and the
    // cookie preserved. Falling back to `real` here is the exact vulnerability.
    adminSdk.getUser.mockRejectedValue(authError('unavailable'))
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)

    const session = await getSession()

    // Not the real admin: the intended target rides in `uid`, the block is set.
    expect(session?.impersonationUnavailable).toBe(true)
    expect(session?.uid).toBe(TARGET_UID)
    // Still attributable to the human behind the overlay.
    expect(session?.impersonator?.uid).toBe(ADMIN_UID)
    // And it holds NO authority — the admin console it could open moments ago is
    // now closed to it, because identity could not be established.
    expect(can(session, 'admin:access')).toBe(false)
    expect(can(session, 'asset:read')).toBe(false)
  })

  it('with a target that is now disabled, refuses the overlay and stays the admin', async () => {
    // Catches: dropping the `!base` half of the guard — sessionFromUserRecord
    // returns null for a disabled account, and a disabled target must not overlay.
    adminSdk.getUser.mockResolvedValue(userRecord({ disabled: true }))
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)

    const session = await getSession()

    expect(session?.uid).toBe(ADMIN_UID)
    expect(session?.impersonator).toBeUndefined()
  })

  it('with a target who can open /admin, refuses the overlay (re-checked at resolution)', async () => {
    // Catches: dropping the `can(base, 'admin:access')` re-check — an admin target
    // must never be impersonatable, even with a validly signed ticket. Enforced
    // per request off the target's LIVE role, not only at the mint.
    adminSdk.getUser.mockResolvedValue(
      userRecord({
        uid: 'admin-target',
        email: 'admintarget@aixel.test',
        customClaims: { role: 'admin' },
      }),
    )
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(
      ADMIN_UID,
      'admin-target',
    )

    const session = await getSession()

    expect(session?.uid).toBe(ADMIN_UID)
    expect(session?.impersonator).toBeUndefined()
  })
})

describe('getSession — what reaches the browser', () => {
  // A `Session` is handed to the 'use client' topbar, so every field on it is
  // serialized into the RSC payload and readable in page source. This pins the
  // whole key set rather than asserting one field's absence: the failure mode is
  // not "someone re-adds `claims`", it is "someone spreads the decoded token, or
  // adds a field without noticing where it ends up". Widening this list must be
  // a deliberate edit with an argument, which is exactly the point.
  const CLIENT_VISIBLE_KEYS = ['uid', 'email', 'emailVerified', 'role']

  it('carries only the four named identity fields, never the decoded token', async () => {
    // The decoded cookie is DELIBERATELY fatter than the session: a real Firebase
    // token also carries auth_time, iat, exp, aud, iss, sub, and firebase.identities.
    // `claims: decoded` used to copy all of it onto the session, with no reader
    // anywhere. Catches any reintroduction, by spread or by name.
    adminSdk.verifySessionCookie.mockResolvedValue({
      ...decodedAdmin(),
      auth_time: 1_700_000_000,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
      sub: ADMIN_UID,
      firebase: {
        identities: { email: [ADMIN_EMAIL] },
        sign_in_provider: 'password',
      },
    })

    const session = await getSession()

    expect(Object.keys(session ?? {}).toSorted()).toEqual(
      CLIENT_VISIBLE_KEYS.toSorted(),
    )
  })

  it('adds only impersonator and impersonationUnavailable while impersonating', async () => {
    // The overlay's two extra fields are both safe to show — a banner names the
    // real actor — but they must be the ONLY additions. Catches an overlay that
    // merges the target's raw UserRecord (customClaims, providerData, metadata)
    // onto the session instead of projecting named fields.
    adminSdk.getUser.mockResolvedValue(
      userRecord({
        customClaims: { role: 'user', internalNote: 'do-not-ship' },
      }),
    )
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)

    const session = await getSession()

    expect(Object.keys(session ?? {}).toSorted()).toEqual(
      [...CLIENT_VISIBLE_KEYS, 'impersonator'].toSorted(),
    )
    expect(JSON.stringify(session)).not.toContain('do-not-ship')
  })
})

/**
 * The revocation half of the boundary. `isTokenRevoked` is real here — only the
 * Firestore read is mocked — so these drive the actual comparison the Rules and
 * the client watcher answer to, not a restatement of it.
 */
describe('getSession — the revocation marker', () => {
  it('allows a session when no marker exists', async () => {
    // Every account predates its first revocation. If absence denied, shipping
    // this feature would sign out every existing user at once.
    expect(await getSession()).not.toBeNull()
  })

  it('allows a cookie minted after the cutoff', async () => {
    revocation.readRevocationMarker.mockResolvedValue({
      kind: 'value',
      epoch: ADMIN_AUTH_TIME - 1,
    })
    expect(await getSession()).not.toBeNull()
  })

  it('allows a cookie minted exactly AT the cutoff', async () => {
    // Equality allows, because `revocationCutoff` already pushed the cutoff past
    // the current second — so an equal auth_time can only be a newer login.
    revocation.readRevocationMarker.mockResolvedValue({
      kind: 'value',
      epoch: ADMIN_AUTH_TIME,
    })
    expect(await getSession()).not.toBeNull()
  })

  it('denies a cookie minted before the cutoff, even though Firebase verified it', async () => {
    // The whole point: verifySessionCookie SUCCEEDS above and the session is
    // still refused. Deleting the marker check flips this test and nothing else.
    revocation.readRevocationMarker.mockResolvedValue({
      kind: 'value',
      epoch: ADMIN_AUTH_TIME + 1,
    })
    expect(await getSession()).toBeNull()
  })

  it('denies when the marker cannot be read — corrupt or unreachable', async () => {
    revocation.readRevocationMarker.mockResolvedValue({
      kind: 'unreadable',
      error: new Error('firestore unavailable'),
    })
    expect(await getSession()).toBeNull()
  })

  it('reads the marker for the REAL uid, not the impersonation target', async () => {
    // The token being judged is the admin's. Checking the target's marker here
    // would let a revoked admin keep acting simply by starting an impersonation.
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)
    await getSession()
    expect(revocation.readRevocationMarker).toHaveBeenCalledWith(ADMIN_UID)
  })
})

describe('getSession — the mustChangePassword claim', () => {
  it('is absent on an ordinary session', async () => {
    expect(await getSession()).not.toHaveProperty('mustChangePassword')
  })

  it('is set when the claim is exactly true', async () => {
    adminSdk.verifySessionCookie.mockResolvedValue({
      ...decodedAdmin(),
      mustChangePassword: true,
    })
    expect((await getSession())?.mustChangePassword).toBe(true)
  })

  // A claim is untrusted input. Gating on a malformed value would lock a user out
  // of an app they are entitled to use, with no claim left to clear.
  for (const [label, value] of [
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['an empty object', {}],
    ['an array', ['yes']],
  ] as const) {
    it(`is absent when the claim is ${label}`, async () => {
      adminSdk.verifySessionCookie.mockResolvedValue({
        ...decodedAdmin(),
        mustChangePassword: value,
      })
      expect(await getSession()).not.toHaveProperty('mustChangePassword')
    })
  }

  it('does not follow the admin into an impersonated session', async () => {
    // The admin cannot produce the TARGET's reauthentication proof, so carrying
    // the claim across the overlay would trap them rather than gate anything.
    adminSdk.getUser.mockResolvedValue(
      userRecord({ customClaims: { role: 'user', mustChangePassword: true } }),
    )
    cookieJar.values[IMPERSONATION_COOKIE] = mintTicket(ADMIN_UID, TARGET_UID)
    const session = await getSession()
    expect(session?.impersonator?.uid).toBe(ADMIN_UID)
    expect(session).not.toHaveProperty('mustChangePassword')
  })
})

/**
 * The cookie-verification boundary itself. Before this, EVERY rejection
 * from `verifySessionCookie` returned null, so a Google-side outage was reported
 * as "not signed in" and `requireSession` redirected an actively-signed-in user
 * to /login. Null must mean a DEFINITIVE answer about the cookie and nothing
 * else; an outage throws, leaving the cookie intact so the session survives.
 */
describe('getSession — definitive rejection vs provider outage', () => {
  for (const code of [
    'auth/session-cookie-expired',
    'auth/session-cookie-revoked',
    'auth/invalid-session-cookie',
    'auth/user-disabled',
    'auth/argument-error',
  ]) {
    it(`returns null for a definitive rejection (${code})`, async () => {
      adminSdk.verifySessionCookie.mockRejectedValue(authError(code))
      await expect(getSession()).resolves.toBeNull()
    })
  }

  for (const code of [
    'auth/internal-error',
    'auth/network-request-failed',
    'auth/too-many-requests',
    'UNAVAILABLE',
  ]) {
    it(`THROWS rather than signing the user out on an outage (${code})`, async () => {
      // Catches a regression to `catch { return null }`: that would resolve null
      // here, and null is what sends a valid user to /login during an outage.
      adminSdk.verifySessionCookie.mockRejectedValue(authError(code))
      await expect(getSession()).rejects.toThrow(code)
    })
  }

  it('THROWS on a rejection carrying no recognisable code', async () => {
    // The fail-safe default: an unclassifiable failure is an outage, never a
    // verdict that the cookie is bad.
    adminSdk.verifySessionCookie.mockRejectedValue(new Error('socket hang up'))
    await expect(getSession()).rejects.toThrow('socket hang up')
  })
})
