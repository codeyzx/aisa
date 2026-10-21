import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requireEmulatorOrSkip } from '@/test/emulator'

/**
 * The self-service password transition against REAL Firebase Auth and Firestore
 * emulators — `changeOwnPasswordAction` driven end to end.
 *
 * ── WHY THIS SUITE EXISTS AND A UNIT TEST CANNOT REPLACE IT ───────────────────
 * The freshness rule the action leans on is already exhaustively unit-tested in
 * `lib/auth/reauth.test.ts` without minting a token. What that CANNOT prove is
 * the thing this action is FOR: that a real reauthentication proof, verified with
 * `checkRevoked = true`, drives a transition that actually changes the credential
 * in Firebase, actually clears the `mustChangePassword` claim, actually advances
 * the revocation marker, and ends by redirecting to /login. Every one of those is
 * a claim about Firebase's behaviour and our Firestore marker, not about our
 * arithmetic — a fake would assert our belief and be green when the belief is
 * wrong. So the ID token here is a genuine one, minted by signing in against the
 * Auth emulator with the account's current password, exactly as the browser does.
 *
 * ── THE THREE MOCKS, AND WHY THEY ARE NOT THE SUBJECT ────────────────────────
 * `getSession`, `cookies`, and `redirect` all require a Next REQUEST context a
 * vitest process does not have. They are stubbed so the ACTION can run for real;
 * everything asserted on — the Auth password, the custom claims, the revocation
 * marker, the durable audit event — is genuine emulator state. The token gate
 * itself is NOT stubbed: `adminAuth().verifyIdToken(token, true)` runs against the
 * emulator, so the uid match, the claim presence, and the freshness bound are all
 * exercised against a real decoded token.
 *
 * ⚠️ SHARED EMULATOR STATE. Like `account-action.test.ts`, this suite creates
 * Firebase AUTH users and wipes the directory between tests. Integration runs are
 * `--no-file-parallelism`, so the two Auth-touching suites are sequential, never
 * interleaved; a parallel worker would corrupt both. It never leaves an admin
 * behind, so it cannot perturb the other suite's final-admin counting.
 */
const firestoreReachable = await requireEmulatorOrSkip(
  'self-service password transition integration tests',
)

/**
 * The AUTH half of the gate. Without `FIREBASE_AUTH_EMULATOR_HOST` the Admin SDK
 * reaches REAL Google Identity Platform — an ungated run is not merely useless,
 * it is dangerous. Throws in CI for the reason `requireEmulatorOrSkip` does: a
 * skipped suite is green, which would report this transition as tested while it
 * never ran. `firebase emulators:exec --only auth,firestore` exports it.
 */
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
if (!authEmulatorHost && process.env.CI) {
  throw new Error(
    'No Firebase Auth emulator (FIREBASE_AUTH_EMULATOR_HOST is unset), and skipping is not ' +
      'allowed in CI: the self-service password transition would report as tested while never ' +
      'running. Wrap the test command in `firebase emulators:exec --only auth,firestore`.',
  )
}
const reachable = firestoreReachable && Boolean(authEmulatorHost)

interface TestSession {
  uid: string
  email: string | null
  emailVerified: boolean
  role: 'admin' | 'user'
  impersonator?: { uid: string; email: string | null }
}

// `vi.hoisted` because `vi.mock` factories are hoisted above ordinary consts —
// these boxes are the one thing both a factory and the tests may touch.
const sessionBox = vi.hoisted(() => ({ current: null as TestSession | null }))
const cookieBox = vi.hoisted(() => ({ deleted: [] as unknown[] }))
const redirectBox = vi.hoisted(() => ({ calls: [] as string[] }))

vi.mock('@/lib/auth/session', () => ({
  getSession: () => Promise.resolve(sessionBox.current),
}))

/**
 * `redirect` signals by throwing in Next; the mock keeps that contract so the
 * action's own "never return on success" behaviour is exercised, and records the
 * destination so a test can prove it was /login rather than merely "something
 * threw". `NEXT_REDIRECT` is the shape callers recognise.
 */
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectBox.calls.push(url)
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      delete: (arg: unknown) => {
        cookieBox.deleted.push(arg)
      },
    }),
}))

const { adminAuth } = await import('@/lib/firebase/admin-auth')
const { rawCollection } = await import('@/lib/firebase/collections')
const { setAccountClaims } = await import('@/lib/auth/claims')
const { CLAIMS_LOCKS_COLLECTION } = await import('@/lib/auth/claims-lock')
const { ACCOUNT_AUDIT_COLLECTION } =
  await import('@/lib/audit/account-audit.path')
const { AUTH_SESSIONS_COLLECTION } =
  await import('@/lib/auth/revocation.contract')
const { SESSION_COOKIE } = await import('@/lib/auth/constants')
const { IMPERSONATION_COOKIE } = await import('@/lib/auth/impersonation')
const { changeOwnPasswordAction } =
  await import('@/lib/actions/password.action')

let seq = 0
const CURRENT_PASSWORD = 'fixture-password-not-a-secret'
const NEW_PASSWORD = 'a-brand-new-permanent-password'

interface Account {
  uid: string
  email: string
}

/**
 * Create a real Auth account with a real role claim. `mustChange` sets the
 * `mustChangePassword` custom claim BEFORE any token is minted, so a token signed
 * afterwards carries it — which is exactly how the browser presents the proof.
 */
async function makeAccount(options: {
  role: 'admin' | 'user'
  mustChange?: boolean
  disabled?: boolean
}): Promise<Account> {
  seq += 1
  const email = `pwchange-${Date.now()}-${seq}@example.test`
  const record = await adminAuth().createUser({
    email,
    displayName: `Fixture ${seq}`,
    password: CURRENT_PASSWORD,
    disabled: options.disabled ?? false,
  })
  // Through the sanctioned writer, not `setCustomUserClaims`, so `rg` still
  // reports exactly one claims writer in the tree.
  await setAccountClaims(record.uid, {
    role: options.role,
    ...(options.mustChange ? { mustChangePassword: true } : {}),
  })
  return { uid: record.uid, email }
}

/**
 * Mint a genuine Firebase ID token the way the browser does: sign in against the
 * Auth emulator's REST surface with the account's current password. The emulator
 * ignores the API key, and embeds the account's custom claims (including
 * `mustChangePassword`) in the returned token — which is the whole point of
 * minting it AFTER the claim is set.
 */
async function mintIdToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  if (!res.ok) {
    throw new Error(
      `emulator sign-in failed: ${res.status} ${await res.text()}`,
    )
  }
  const data = (await res.json()) as { idToken?: string }
  if (!data.idToken) throw new Error('emulator sign-in returned no idToken')
  return data.idToken
}

/** Does `password` still sign this account in? Proves what the credential IS. */
async function canSignIn(email: string, password: string): Promise<boolean> {
  const res = await fetch(
    `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  return res.ok
}

async function claimsOf(uid: string): Promise<Record<string, unknown>> {
  return (await adminAuth().getUser(uid)).customClaims ?? {}
}

async function readMarker(uid: string): Promise<number | undefined> {
  const snap = await rawCollection(AUTH_SESSIONS_COLLECTION).doc(uid).get()
  return snap.data()?.revokedAfterEpoch as number | undefined
}

async function auditDocsFor(uids: string[]) {
  const snap = await rawCollection(ACCOUNT_AUDIT_COLLECTION).get()
  return snap.docs.filter((doc) =>
    uids.includes(doc.data().targetUid as string),
  )
}

async function directoryUids(): Promise<string[]> {
  return (await adminAuth().listUsers(1000)).users.map((user) => user.uid)
}

beforeEach(() => {
  sessionBox.current = null
  cookieBox.deleted = []
  redirectBox.calls = []
})

afterEach(async () => {
  const uids = await directoryUids()
  if (uids.length > 0) await adminAuth().deleteUsers(uids)
  await Promise.all(
    uids.map((uid) =>
      rawCollection(AUTH_SESSIONS_COLLECTION).doc(uid).delete(),
    ),
  )
  const docs = await auditDocsFor(uids)
  await Promise.all(docs.map((doc) => doc.ref.delete()))
  await Promise.all(
    uids.map((uid) => rawCollection(CLAIMS_LOCKS_COLLECTION).doc(uid).delete()),
  )
})

describe.runIf(reachable)('self-service password transition', () => {
  it('changes the credential, clears the claim, revokes, and redirects to /login', async () => {
    const account = await makeAccount({ role: 'user', mustChange: true })
    const idToken = await mintIdToken(account.email, CURRENT_PASSWORD)
    sessionBox.current = {
      uid: account.uid,
      email: account.email,
      emailVerified: true,
      role: 'user',
    }

    // Success NEVER returns — it redirects, and the mock makes redirect throw.
    await expect(
      changeOwnPasswordAction({ idToken, newPassword: NEW_PASSWORD }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')

    // The destination, proven rather than assumed from "it threw".
    expect(redirectBox.calls).toEqual(['/login'])

    // Both cookies cleared — the session that authenticated with the OLD password
    // must not survive its own replacement, and the impersonation ticket goes too.
    expect(cookieBox.deleted).toEqual([
      { name: SESSION_COOKIE, path: '/' },
      IMPERSONATION_COOKIE,
    ])

    // The claim is GONE — this is the one action that may clear it.
    expect(await claimsOf(account.uid)).not.toHaveProperty('mustChangePassword')

    // The credential really changed: the new password signs in, the old does not.
    expect(await canSignIn(account.email, NEW_PASSWORD)).toBe(true)
    expect(await canSignIn(account.email, CURRENT_PASSWORD)).toBe(false)

    // The revocation marker was advanced — every prior session is invalidated.
    expect(await readMarker(account.uid)).toBeGreaterThan(0)

    // A durable audit event settled as succeeded, carrying no password.
    const events = (await auditDocsFor([account.uid])).map((d) => d.data())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'user.password.change',
      actorUid: account.uid,
      targetUid: account.uid,
      result: 'succeeded',
    })
    expect(JSON.stringify(events[0])).not.toContain(NEW_PASSWORD)
  })

  it('refuses an unauthenticated caller before reading the proof', async () => {
    sessionBox.current = null
    expect(
      await changeOwnPasswordAction({
        idToken: 'x',
        newPassword: NEW_PASSWORD,
      }),
    ).toMatchObject({ ok: false, code: 'unauthenticated' })
  })

  it('refuses an impersonated session — the overlay may never set a password', async () => {
    sessionBox.current = {
      uid: 'overlaid-user',
      email: 'overlaid@example.test',
      emailVerified: true,
      role: 'user',
      impersonator: { uid: 'real-admin', email: 'real@example.test' },
    }
    expect(
      await changeOwnPasswordAction({
        idToken: 'x',
        newPassword: NEW_PASSWORD,
      }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('rejects a too-short new password at the Zod boundary', async () => {
    sessionBox.current = {
      uid: 'someone',
      email: 'someone@example.test',
      emailVerified: true,
      role: 'user',
    }
    expect(
      await changeOwnPasswordAction({ idToken: 'x', newPassword: 'short' }),
    ).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('refuses a proof whose uid is not this session', async () => {
    const account = await makeAccount({ role: 'user', mustChange: true })
    const idToken = await mintIdToken(account.email, CURRENT_PASSWORD)
    // A valid proof for `account`, presented under a DIFFERENT session.
    sessionBox.current = {
      uid: 'a-different-uid',
      email: 'different@example.test',
      emailVerified: true,
      role: 'user',
    }
    expect(
      await changeOwnPasswordAction({ idToken, newPassword: NEW_PASSWORD }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
    // And nothing was changed for the real account.
    expect(await claimsOf(account.uid)).toHaveProperty(
      'mustChangePassword',
      true,
    )
    expect(await canSignIn(account.email, CURRENT_PASSWORD)).toBe(true)
  })

  it('refuses an account that does not owe a password change', async () => {
    // No `mustChangePassword` claim: this action is the MANDATORY transition, not
    // a general password-setting endpoint.
    const account = await makeAccount({ role: 'user' })
    const idToken = await mintIdToken(account.email, CURRENT_PASSWORD)
    sessionBox.current = {
      uid: account.uid,
      email: account.email,
      emailVerified: true,
      role: 'user',
    }
    expect(
      await changeOwnPasswordAction({ idToken, newPassword: NEW_PASSWORD }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await canSignIn(account.email, CURRENT_PASSWORD)).toBe(true)
  })
})
