import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requireEmulatorOrSkip } from '@/test/emulator'

/**
 * Account administration against REAL Firebase Auth and Firestore emulators.
 *
 * ── WHY NOTHING HERE CAN BE A UNIT TEST ──────────────────────────────────────
 * Every claim this suite makes is a claim about FIREBASE's behaviour, not about
 * our arithmetic: that `setCustomUserClaims` replaces rather than merges (so the
 * merge helper has something to prevent), that a created account really is
 * unverified, that `revokeRefreshTokens` produces a `tokensValidAfterTime` we can
 * reconcile a marker against, and that a role written as a custom claim reads
 * back as one. A fake would assert our belief about Firebase, and would be green
 * exactly when that belief is wrong.
 *
 * ── THE TWO MOCKS, AND WHY THEY ARE NOT THE SUBJECT ──────────────────────────
 * `getSession` and `revalidatePath` both require a Next REQUEST context, which a
 * vitest process does not have. They are stubbed so the ACTIONS can run for real;
 * everything the suite asserts on — Auth records, claims, the revocation marker,
 * the durable audit event — is genuine emulator state. The authorization gate
 * itself is NOT stubbed: `runAction` still calls `authorizeSession`, so the
 * capability check, the readiness check and the impersonation fail-closed all run
 * against the session these tests supply.
 *
 * ⚠️ SHARED EMULATOR STATE. This is the only suite that creates Firebase AUTH
 * users, and `countAdmins` reads the WHOLE directory, so the cleanup below wipes
 * it between tests — a leftover admin from a previous test would silently make a
 * final-admin refusal stop firing. It also means this file must stay the only
 * Auth-touching suite; a second one running in a parallel worker would corrupt
 * both. It shares `adminLocks/accountMutation` with `admin-lease.test.ts`, whose
 * leases are all struck at a fixed 2023 timestamp and therefore already expired
 * from this suite's point of view — bar one case that holds a live lease for the
 * length of a single transaction.
 */
const firestoreReachable = await requireEmulatorOrSkip(
  'account administration integration tests',
)

/**
 * The AUTH half of the emulator gate. `test/emulator.ts` probes Firestore only,
 * and `FIREBASE_AUTH_EMULATOR_HOST` is what routes the Admin SDK's Auth calls at
 * the emulator — without it `adminAuth()` would reach for REAL Google Identity
 * Platform with real credentials, so an ungated run is not merely useless, it is
 * dangerous. `firebase emulators:exec --only auth,firestore` exports it.
 *
 * Throws in CI for the same reason `requireEmulatorOrSkip` does: a skipped suite
 * is green, and green is exactly what a missing emulator must not produce there.
 */
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
if (!authEmulatorHost && process.env.CI) {
  throw new Error(
    'No Firebase Auth emulator (FIREBASE_AUTH_EMULATOR_HOST is unset), and skipping is not ' +
      'allowed in CI: account administration would report as tested while never running. ' +
      'Wrap the test command in `firebase emulators:exec --only auth,firestore`.',
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
// this box is the one thing both the factory and the tests may touch.
const sessionBox = vi.hoisted(() => ({
  current: null as TestSession | null,
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: () => Promise.resolve(sessionBox.current),
  requireSession: () => Promise.resolve(sessionBox.current),
}))

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))

const { adminAuth } = await import('@/lib/firebase/admin-auth')
const { rawCollection } = await import('@/lib/firebase/collections')
const { setAccountClaims } = await import('@/lib/auth/claims')
const { CLAIMS_LOCKS_COLLECTION } = await import('@/lib/auth/claims-lock')
const { ACCOUNT_AUDIT_COLLECTION } =
  await import('@/lib/audit/account-audit.path')
const { AUTH_SESSIONS_COLLECTION } =
  await import('@/lib/auth/revocation.contract')
const { TEMPORARY_PASSWORD_ALPHABET, TEMPORARY_PASSWORD_LENGTH } =
  await import('@/lib/auth/temporary-password')
const {
  createAccountAction,
  disableAccountAction,
  enableAccountAction,
  resetAccountPasswordAction,
  signOutAccountSessionsAction,
  updateAccountNameAction,
  updateAccountRoleAction,
} = await import('@/lib/actions/account.action')

let seq = 0

/** A signed-in administrator who need not exist in the directory. */
function actingAs(uid: string, overrides: Partial<TestSession> = {}): void {
  sessionBox.current = {
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    role: 'admin',
    ...overrides,
  }
}

/** Create a real Auth account with a real role claim. Returns its uid. */
async function makeAccount(options: {
  role: 'admin' | 'user'
  disabled?: boolean
}): Promise<string> {
  seq += 1
  const record = await adminAuth().createUser({
    email: `acct-${Date.now()}-${seq}@example.test`,
    displayName: `Fixture ${seq}`,
    password: 'fixture-password-not-a-secret',
    disabled: options.disabled ?? false,
  })
  // Through the sanctioned writer, not `setCustomUserClaims` — so `rg` still
  // reports exactly one claims writer in the tree.
  await setAccountClaims(record.uid, { role: options.role })
  return record.uid
}

async function claimsOf(uid: string): Promise<Record<string, unknown>> {
  return (await adminAuth().getUser(uid)).customClaims ?? {}
}

async function readMarker(uid: string): Promise<number | undefined> {
  const snap = await rawCollection(AUTH_SESSIONS_COLLECTION).doc(uid).get()
  return snap.data()?.revokedAfterEpoch as number | undefined
}

/**
 * The raw documents this suite's accounts produced. Read RAW rather than through
 * the typed collection so a schema-violating event would still be found and
 * cleaned up rather than throwing on parse.
 */
async function auditDocsFor(uids: string[]) {
  const snap = await rawCollection(ACCOUNT_AUDIT_COLLECTION).get()
  return snap.docs.filter((doc) =>
    uids.includes(doc.data().targetUid as string),
  )
}

/**
 * Every durable audit event this suite's accounts produced.
 *
 * `id` is re-attached from the DOCUMENT KEY, which is where it lives:
 * `zodConverter.toFirestore` drops the synthetic `id` field on write because the
 * key already is it. A raw read therefore has no `id` of its own.
 */
async function auditEventsFor(uids: string[]) {
  return (await auditDocsFor(uids)).map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

async function directoryUids(): Promise<string[]> {
  return (await adminAuth().listUsers(1000)).users.map((user) => user.uid)
}

beforeEach(() => {
  sessionBox.current = null
})

afterEach(async () => {
  const uids = await directoryUids()
  if (uids.length > 0) await adminAuth().deleteUsers(uids)
  await Promise.all(
    uids.map((uid) =>
      rawCollection(AUTH_SESSIONS_COLLECTION).doc(uid).delete(),
    ),
  )
  // Delete only THIS suite's events — `account-audit.test.ts` writes its own to
  // the same collection.
  const docs = await auditDocsFor(uids)
  await Promise.all(docs.map((doc) => doc.ref.delete()))
  // Per-uid claims locks are deleted on release, but a timed-out one could
  // linger; clear this suite's so a stale lock never blocks a later test.
  await Promise.all(
    uids.map((uid) => rawCollection(CLAIMS_LOCKS_COLLECTION).doc(uid).delete()),
  )
})

describe.runIf(reachable)('account administration actions', () => {
  describe('authorization', () => {
    it('refuses an unauthenticated caller', async () => {
      sessionBox.current = null
      expect(await enableAccountAction({ uid: 'nobody' })).toMatchObject({
        ok: false,
        code: 'unauthenticated',
      })
    })

    it('refuses a signed-in NON-admin', async () => {
      actingAs('helper-1', { role: 'user' })
      expect(await enableAccountAction({ uid: 'nobody' })).toMatchObject({
        ok: false,
        code: 'forbidden',
      })
    })

    it('REFUSES AN IMPERSONATED SESSION even when it looks like an admin', async () => {
      // The refusal exists because an overlay makes the acting identity the
      // TARGET: the mutation would be attributed to the person being
      // impersonated, and account administration is the one family where "who
      // really did this" cannot be allowed to blur.
      const target = await makeAccount({ role: 'user' })
      actingAs('overlaid-admin', {
        impersonator: { uid: 'real-admin', email: 'real@example.test' },
      })
      expect(
        await updateAccountNameAction({ uid: target, displayName: 'Nope' }),
      ).toMatchObject({ ok: false, code: 'forbidden' })
      // and nothing changed
      expect((await adminAuth().getUser(target)).displayName).not.toBe('Nope')
    })

    it('reports a missing target as not_found, never as a crash', async () => {
      actingAs('admin-1')
      expect(
        await updateAccountNameAction({ uid: 'no-such-uid', displayName: 'X' }),
      ).toMatchObject({ ok: false, code: 'not_found' })
    })

    it('rejects malformed input at the Zod boundary', async () => {
      actingAs('admin-1')
      expect(
        await updateAccountNameAction({ uid: '', displayName: '' }),
      ).toMatchObject({ ok: false, code: 'invalid' })
    })
  })

  describe('create', () => {
    it('mints a temporary password, sets the claims, and does NOT verify the email', async () => {
      actingAs('admin-1')
      const result = await createAccountAction({
        email: `created-${Date.now()}@example.test`,
        displayName: 'Baru',
        role: 'user',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.data.temporaryPassword).toHaveLength(
        TEMPORARY_PASSWORD_LENGTH,
      )
      for (const character of result.data.temporaryPassword) {
        expect(TEMPORARY_PASSWORD_ALPHABET).toContain(character)
      }

      const record = await adminAuth().getUser(result.data.uid)
      // An admin typing an address into a form is not proof the person at that
      // address asked for the account. A `true` here would hand a verified
      // identity to whoever owns a mistyped domain.
      expect(record.emailVerified).toBe(false)
      expect(record.disabled).toBe(false)
      expect(record.customClaims).toMatchObject({
        role: 'user',
        mustChangePassword: true,
      })
    })

    it('records a settled audit event that CANNOT contain the password', async () => {
      actingAs('admin-1')
      const result = await createAccountAction({
        email: `created-${Date.now()}@example.test`,
        displayName: 'Baru',
        role: 'admin',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const [event] = await auditEventsFor([result.data.uid])
      expect(event).toMatchObject({
        action: 'user.create',
        result: 'succeeded',
        actorUid: 'admin-1',
        targetUid: result.data.uid,
        after: { role: 'admin', displayName: 'Baru', disabled: false },
      })
      // The structural guarantee, asserted rather than assumed: the whole stored
      // document, serialized, contains no trace of the credential.
      expect(JSON.stringify(event)).not.toContain(result.data.temporaryPassword)
    })

    it('reports a duplicate email as a conflict, not an internal error', async () => {
      actingAs('admin-1')
      const email = `dupe-${Date.now()}@example.test`
      await createAccountAction({ email, displayName: 'Satu', role: 'user' })
      expect(
        await createAccountAction({ email, displayName: 'Dua', role: 'user' }),
      ).toMatchObject({ ok: false, code: 'conflict' })
    })

    it('does not revoke — a brand-new account has no sessions to end', async () => {
      actingAs('admin-1')
      const result = await createAccountAction({
        email: `created-${Date.now()}@example.test`,
        displayName: 'Baru',
        role: 'user',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(await readMarker(result.data.uid)).toBeUndefined()
    })
  })

  describe('claims preservation — the invariant the whole module exists for', () => {
    it('a ROLE update PRESERVES mustChangePassword', async () => {
      // The bug this catches: `setCustomUserClaims(uid, { role })` REPLACES the
      // bag, so a role change would silently clear the mandatory password
      // change and make a temporary password permanent.
      actingAs('admin-1')
      const created = await createAccountAction({
        email: `promote-${Date.now()}@example.test`,
        displayName: 'Naik',
        role: 'user',
      })
      expect(created.ok).toBe(true)
      if (!created.ok) return

      const result = await updateAccountRoleAction({
        uid: created.data.uid,
        role: 'admin',
      })
      expect(result.ok).toBe(true)
      expect(await claimsOf(created.data.uid)).toEqual({
        role: 'admin',
        mustChangePassword: true,
      })
    })

    it('an ADMIN PASSWORD RESET PRESERVES the role', async () => {
      // The mirror bug, and the nastier one: a dropped role resolves to `user`,
      // so resetting an administrator's password would silently demote them.
      const target = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin' }) // so the target is not the last one
      actingAs('admin-1')

      const result = await resetAccountPasswordAction({
        uid: target,
        reason: 'Pengguna kehilangan akses',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.data.temporaryPassword).toHaveLength(
        TEMPORARY_PASSWORD_LENGTH,
      )
      expect(await claimsOf(target)).toEqual({
        role: 'admin',
        mustChangePassword: true,
      })
    })

    it('a reset requires a reason and never records the password', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')
      expect(
        await resetAccountPasswordAction({ uid: target, reason: '  ' }),
      ).toMatchObject({ ok: false, code: 'invalid' })

      const result = await resetAccountPasswordAction({
        uid: target,
        reason: 'Lupa kata sandi',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const [event] = await auditEventsFor([target])
      expect(event).toMatchObject({
        action: 'user.password.reset',
        result: 'succeeded',
        reason: 'Lupa kata sandi',
      })
      expect(JSON.stringify(event)).not.toContain(result.data.temporaryPassword)
    })
  })

  describe('enable and disable', () => {
    it('disables an account and advances its revocation marker', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')

      const result = await disableAccountAction({ uid: target })
      expect(result.ok).toBe(true)
      expect((await adminAuth().getUser(target)).disabled).toBe(true)
      // Without the marker the target's already-minted session cookie keeps
      // working — and its direct Firestore listeners keep streaming — until it
      // expires, up to five days after being disabled.
      expect(await readMarker(target)).toBeGreaterThan(0)
    })

    it('re-enables an account without touching the marker', async () => {
      const target = await makeAccount({ role: 'user', disabled: true })
      actingAs('admin-1')

      const result = await enableAccountAction({ uid: target })
      expect(result.ok).toBe(true)
      expect((await adminAuth().getUser(target)).disabled).toBe(false)
      // Enabling adds authority; there is no session to end, and the marker
      // from the earlier disable must not be disturbed.
      expect(await readMarker(target)).toBeUndefined()
    })

    it('records disabling an ALREADY disabled account as a success', async () => {
      const target = await makeAccount({ role: 'user', disabled: true })
      actingAs('admin-1')
      expect(await disableAccountAction({ uid: target })).toMatchObject({
        ok: true,
      })
      const [event] = await auditEventsFor([target])
      expect(event).toMatchObject({
        action: 'user.disable',
        result: 'succeeded',
      })
    })
  })

  describe('revocation — which operations must end the target’s sessions', () => {
    it('a ROLE change advances the marker', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')
      expect(
        await updateAccountRoleAction({ uid: target, role: 'admin' }),
      ).toMatchObject({ ok: true })
      expect(await readMarker(target)).toBeGreaterThan(0)
    })

    it('an explicit SIGN OUT advances the marker without changing the account', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')
      expect(await signOutAccountSessionsAction({ uid: target })).toMatchObject(
        {
          ok: true,
        },
      )
      expect(await readMarker(target)).toBeGreaterThan(0)
      const record = await adminAuth().getUser(target)
      expect(record.disabled).toBe(false)
      expect(record.customClaims).toEqual({ role: 'user' })
    })

    it('an ADMIN RESET advances the marker', async () => {
      // Established by driving the flow, not inferred from this test: setting
      // `mustChangePassword` does NOT affect an already-minted session cookie,
      // so without this the target keeps working on the OLD password's session.
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')
      expect(
        await resetAccountPasswordAction({ uid: target, reason: 'reset' }),
      ).toMatchObject({ ok: true })
      expect(await readMarker(target)).toBeGreaterThan(0)
    })

    it('a DISPLAY NAME change does NOT — a name grants nothing', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')
      const result = await updateAccountNameAction({
        uid: target,
        displayName: 'Nama Baru',
      })
      expect(result.ok).toBe(true)
      expect((await adminAuth().getUser(target)).displayName).toBe('Nama Baru')
      // Signing every session out to fix a typo would be a self-inflicted outage.
      expect(await readMarker(target)).toBeUndefined()
    })

    it('reconciles the marker with Firebase’s own cutoff, never below it', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-1')
      await signOutAccountSessionsAction({ uid: target })

      const marker = await readMarker(target)
      const record = await adminAuth().getUser(target)
      const firebaseCutoff =
        Math.floor(Date.parse(record.tokensValidAfterTime ?? '') / 1000) + 1
      // The marker must be at least Firebase's own decision: a lower one would
      // let a token Firebase already rejects pass our Rules and server checks.
      expect(marker).toBeGreaterThanOrEqual(firebaseCutoff)
    })
  })

  describe('lockout protection', () => {
    it('REFUSES self-demotion', async () => {
      const self = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin' }) // another admin exists, so this is
      // purely the self rule and not the final-admin rule
      actingAs(self)

      expect(
        await updateAccountRoleAction({ uid: self, role: 'user' }),
      ).toMatchObject({ ok: false, code: 'admin_lockout' })
      expect(await claimsOf(self)).toMatchObject({ role: 'admin' })
    })

    it('REFUSES self-disable', async () => {
      const self = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin' })
      actingAs(self)

      expect(await disableAccountAction({ uid: self })).toMatchObject({
        ok: false,
        code: 'admin_lockout',
      })
      expect((await adminAuth().getUser(self)).disabled).toBe(false)
    })

    it('REFUSES demoting the FINAL administrator', async () => {
      const only = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'user' })
      actingAs('admin-operator') // a different administrator, so the self rule
      // cannot be what produces the refusal

      expect(
        await updateAccountRoleAction({ uid: only, role: 'user' }),
      ).toMatchObject({ ok: false, code: 'admin_lockout' })
      expect(await claimsOf(only)).toMatchObject({ role: 'admin' })
    })

    it('REFUSES disabling the FINAL administrator', async () => {
      const only = await makeAccount({ role: 'admin' })
      actingAs('admin-operator')

      expect(await disableAccountAction({ uid: only })).toMatchObject({
        ok: false,
        code: 'admin_lockout',
      })
      expect((await adminAuth().getUser(only)).disabled).toBe(false)
    })

    it('ALLOWS demoting an administrator while another ENABLED one remains', async () => {
      const target = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin' })
      actingAs('admin-operator')

      expect(
        await updateAccountRoleAction({ uid: target, role: 'user' }),
      ).toMatchObject({ ok: true })
      expect(await claimsOf(target)).toMatchObject({ role: 'user' })
    })

    it('does NOT count a DISABLED administrator as one who remains', async () => {
      // A disabled admin cannot sign in, so counting them would let the last
      // USABLE administrator be demoted while the count still read 2.
      const target = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin', disabled: true })
      actingAs('admin-operator')

      expect(
        await updateAccountRoleAction({ uid: target, role: 'user' }),
      ).toMatchObject({ ok: false, code: 'admin_lockout' })
    })

    it('allows PROMOTION freely — it can only add administrators', async () => {
      const target = await makeAccount({ role: 'user' })
      actingAs('admin-operator')
      expect(
        await updateAccountRoleAction({ uid: target, role: 'admin' }),
      ).toMatchObject({ ok: true })
    })

    it('REFUSES resetting your OWN password from the admin surface', async () => {
      // The admin surface administers OTHER accounts. A self reset would hand the
      // actor a temporary credential and revoke their live session mid-operation
      // — refused at the boundary, not merely hidden. A personal reset flow is
      // separate product work.
      const self = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin' }) // not the final-admin rule
      actingAs(self)

      expect(
        await resetAccountPasswordAction({ uid: self, reason: 'apa saja' }),
      ).toMatchObject({ ok: false, code: 'forbidden' })
      // and the account is untouched: still mint-able only by a real reset later
      expect(await claimsOf(self)).toEqual({ role: 'admin' })
      expect(await readMarker(self)).toBeUndefined()
    })

    it('REFUSES signing out your OWN sessions from the admin surface', async () => {
      const self = await makeAccount({ role: 'admin' })
      actingAs(self)

      expect(await signOutAccountSessionsAction({ uid: self })).toMatchObject({
        ok: false,
        code: 'forbidden',
      })
      // the actor's own session was never revoked
      expect(await readMarker(self)).toBeUndefined()
    })

    it('still allows resetting ANOTHER admin’s password', async () => {
      // The refusal is self-only: administering others is the surface's whole job.
      const target = await makeAccount({ role: 'admin' })
      await makeAccount({ role: 'admin' })
      actingAs('admin-operator')

      expect(
        await resetAccountPasswordAction({ uid: target, reason: 'lupa sandi' }),
      ).toMatchObject({ ok: true })
    })

    it('a refused mutation leaves its audit event FAILED, not started or succeeded', async () => {
      const only = await makeAccount({ role: 'admin' })
      actingAs('admin-operator')
      await disableAccountAction({ uid: only })
      // The refusal happens BEFORE the audit event is opened — there is nothing
      // to record about a mutation that never began, and an event written for
      // every rejected click would bury the ones that mattered.
      expect(await auditEventsFor([only])).toEqual([])
    })
  })

  describe('claims write serialization', () => {
    it('two concurrent claim writes on one account do not clobber each other', async () => {
      // The race the per-uid claims lease closes: without it, both writes read the
      // SAME base bag and the second REPLACES the first — a demotion undone by a
      // concurrent password reset, an admin silently restored. Under the lease the
      // whole read-merge-write is exclusive per uid, so whichever runs second reads
      // the first's result and BOTH patches survive. Whichever serial order the two
      // take, the final bag is the same {role:user, mustChangePassword:true}.
      //
      // Looped to defeat scheduling luck: an UNLOCKED writer loses a claim on
      // essentially every iteration (both reads land before either write), so this
      // is a real regression guard, not a green-by-timing accident. The generous
      // timeout is because each write now carries the lease's Firestore round
      // trips and one of each pair briefly waits on the other.
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const uid = await makeAccount({ role: 'admin' })

        await Promise.all([
          setAccountClaims(uid, { role: 'user' }), // a "demotion"
          setAccountClaims(uid, { mustChangePassword: true }), // a concurrent "reset"
        ])

        expect(await claimsOf(uid)).toEqual({
          role: 'user',
          mustChangePassword: true,
        })

        await adminAuth().deleteUser(uid)
        await rawCollection(CLAIMS_LOCKS_COLLECTION).doc(uid).delete()
      }
    }, 30_000)

    it('the lock is released after each write — a later write on the same uid is not blocked', async () => {
      // Proves the lease does not leak: a serial second write acquires immediately
      // rather than waiting out the TTL of the first.
      const uid = await makeAccount({ role: 'user' })
      await setAccountClaims(uid, { role: 'admin' })
      await setAccountClaims(uid, { mustChangePassword: true })
      expect(await claimsOf(uid)).toEqual({
        role: 'admin',
        mustChangePassword: true,
      })
      // The lock document was cleaned up on release, not left to expire.
      const lock = await rawCollection(CLAIMS_LOCKS_COLLECTION).doc(uid).get()
      expect(lock.exists).toBe(false)
    })
  })
})
