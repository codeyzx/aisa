import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'

import { EMULATOR_HOST, requireEmulatorOrSkip } from '@/test/emulator'

/**
 * firestore.rules is deny-all with exactly TWO carve-outs: every client read and
 * write must be rejected, because all legitimate access goes through the Admin
 * SDK (which bypasses rules) — except a signed-in READ of `assets`, which
 * `/realtime`'s Web SDK listener depends on, and a signed-in read of a client's
 * OWN revocation marker, which is how a browser learns its session is over. This
 * asserts the boundary actually denies rather than trusting the file to say so.
 *
 * The revocation block is the reason this suite matters more than it used to.
 * Rules cannot import `revocation.contract.ts`, so the comparison there is a
 * HAND-KEPT implementation of that contract — these tests are the only thing
 * that can catch the two drifting apart.
 *
 * BOTH halves are asserted on purpose. A suite that only proved the allow would
 * pass just as happily against `allow read, write: if true` — the deny cases are
 * what make the carve-out a carve-out rather than an opening.
 *
 * Requires the Firestore emulator (`pnpm emulators`). Without one the suite
 * skips loudly rather than passing vacuously — a rules test that "passes" with
 * no emulator is worse than no test. The skip-vs-fail gate (loud skip locally, a
 * FAILURE in CI, keyed on `CI`) is the shared `requireEmulatorOrSkip`; its full
 * rationale lives in `test/emulator.ts`.
 */
const [host, port] = splitHostPort(EMULATOR_HOST)

// A project id distinct from the app's own: rules and data are namespaced per
// project in the emulator, so this never overwrites a running dev project.
const PROJECT_ID = 'demo-rules-test'

const DOC_PATH = 'examples/any-doc'

/** The one carved-out collection. Anything else must still deny. */
const ASSET_DOC_PATH = 'assets/any-asset'

/** The reader under test, and a neighbour whose marker must never affect it. */
const SELF_UID = 'uid-self'
const OTHER_UID = 'uid-other'

/**
 * A fixed `auth_time` for the token under test. Every marker below is placed
 * relative to it, so no case depends on the wall clock — a revocation test that
 * reads `Date.now()` passes or fails on when it happens to run.
 */
const STALE_AUTH_TIME = 1_700_000_000

function splitHostPort(value: string): [string, number] {
  const index = value.lastIndexOf(':')
  return [value.slice(0, index), Number(value.slice(index + 1))]
}

const reachable = await requireEmulatorOrSkip('firestore.rules tests')

describe.skipIf(!reachable)(
  'firestore.rules (deny-all + assets carve-out)',
  () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          host,
          port,
          rules: readFileSync('firestore.rules', 'utf8'),
        },
      })
    })

    afterAll(async () => {
      await testEnv?.cleanup()
    })

    // Markers are per-uid documents and several cases seed the SAME uid with
    // different cutoffs. Clearing between tests keeps each one independent.
    afterEach(async () => {
      await testEnv?.clearFirestore()
    })

    /** Plant a marker with rules bypassed — only the Admin SDK may write one. */
    async function seedMarker(uid: string, epoch: number): Promise<void> {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .doc(`authSessions/${uid}`)
          .set({ revokedAfterEpoch: epoch })
      })
    }

    it('denies an unauthenticated read', async () => {
      const db = testEnv.unauthenticatedContext().firestore()
      await assertFails(db.doc(DOC_PATH).get())
    })

    it('denies an unauthenticated write', async () => {
      const db = testEnv.unauthenticatedContext().firestore()
      await assertFails(db.doc(DOC_PATH).set({ value: 1 }))
    })

    it('denies an unauthenticated collection listing', async () => {
      const db = testEnv.unauthenticatedContext().firestore()
      await assertFails(db.collection('examples').get())
    })

    // The role claim is trusted server-side by can(); the rules must not honour
    // it. Even an admin-claimed client has no direct Firestore access — OUTSIDE
    // the `assets` carve-out, which the block below pins down.
    it('denies a signed-in client carrying an admin role claim', async () => {
      const db = testEnv
        .authenticatedContext('uid-1', { role: 'admin' })
        .firestore()
      await assertFails(db.doc(DOC_PATH).get())
      await assertFails(db.doc(DOC_PATH).set({ value: 1 }))
    })

    /**
     * The carve-out `/realtime` depends on. These are the only `assertSucceeds`
     * in this file, and they are read-only by construction.
     */
    describe('the assets carve-out', () => {
      it('ALLOWS a signed-in client to read an asset', async () => {
        const db = testEnv.authenticatedContext('uid-1').firestore()
        await assertSucceeds(db.doc(ASSET_DOC_PATH).get())
      })

      // The listener is a collection query, not a doc get — `read` covers both
      // `get` and `list`, but only a `list` assertion proves onSnapshot's actual
      // shape works. Without this, `/realtime` could still PERMISSION_DENIED on
      // its first paint with this suite green.
      it('ALLOWS a signed-in client to LIST the assets collection', async () => {
        const db = testEnv.authenticatedContext('uid-1').firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      // No role claim required: the rule is `request.auth != null`, and every
      // role in ROLE_CAPABILITIES holds `asset:read` today. See the drift
      // condition in firestore.rules.
      it('ALLOWS a signed-in client with no role claim at all', async () => {
        const db = testEnv.authenticatedContext('uid-no-claims').firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it('denies an UNAUTHENTICATED read of assets', async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(db.doc(ASSET_DOC_PATH).get())
        await assertFails(db.collection('assets').get())
      })

      // The carve-out is READ-only. A client that could write assets would bypass
      // `runAction` + `requireCapability` — the actual gate — entirely.
      it('denies a signed-in client WRITING an asset', async () => {
        const db = testEnv
          .authenticatedContext('uid-1', { role: 'admin' })
          .firestore()
        await assertFails(db.doc(ASSET_DOC_PATH).set({ name: 'nope' }))
        await assertFails(db.doc(ASSET_DOC_PATH).delete())
      })

      // The carve-out must not generalize. `assets` is a literal path segment, not
      // a wildcard, but a future edit could make it one by accident — this is the
      // assertion that would go red if it did.
      it('does NOT extend to a neighbouring collection', async () => {
        const db = testEnv.authenticatedContext('uid-1').firestore()
        await assertFails(db.collection('assets-archive').get())
        await assertFails(db.collection('orders').get())
      })
    })

    /**
     * The revocation marker. Its carve-out grants no application data — one
     * integer about the reader's own session — and exists so a browser can learn
     * that its session is over.
     */
    describe('the authSessions marker carve-out', () => {
      it('ALLOWS a signed-in client to read its OWN marker', async () => {
        await seedMarker(SELF_UID, 1000)
        const db = testEnv.authenticatedContext(SELF_UID).firestore()
        await assertSucceeds(db.doc(`authSessions/${SELF_UID}`).get())
      })

      it('ALLOWS reading an own marker that does not exist yet', async () => {
        // The normal state of an account never revoked. A client that could not
        // read the absent document could not start watching for its creation.
        const db = testEnv.authenticatedContext('uid-never-revoked').firestore()
        await assertSucceeds(db.doc('authSessions/uid-never-revoked').get())
      })

      it("ALLOWS the read even once the marker has REVOKED the reader's token", async () => {
        // The load-bearing case. Gating this read behind the revocation check
        // would hide the very document carrying the sign-out signal, and a
        // revoked browser would keep its stale session open, told nothing.
        await seedMarker(SELF_UID, STALE_AUTH_TIME + 1000)
        const db = testEnv
          .authenticatedContext(SELF_UID, { auth_time: STALE_AUTH_TIME })
          .firestore()
        await assertSucceeds(db.doc(`authSessions/${SELF_UID}`).get())
      })

      it("denies reading ANOTHER account's marker", async () => {
        await seedMarker(OTHER_UID, 1000)
        const db = testEnv.authenticatedContext(SELF_UID).firestore()
        await assertFails(db.doc(`authSessions/${OTHER_UID}`).get())
      })

      it('denies an unauthenticated read', async () => {
        await seedMarker(SELF_UID, 1000)
        const db = testEnv.unauthenticatedContext().firestore()
        await assertFails(db.doc(`authSessions/${SELF_UID}`).get())
      })

      it('denies LISTING the collection — a reader gets its own document only', async () => {
        const db = testEnv.authenticatedContext(SELF_UID).firestore()
        await assertFails(db.collection('authSessions').get())
      })

      it('denies every client WRITE, including to its own marker', async () => {
        // A client that could write its own marker could lower its cutoff and
        // un-revoke itself. The marker is Admin-SDK owned and monotonic.
        const db = testEnv.authenticatedContext(SELF_UID).firestore()
        await assertFails(
          db.doc(`authSessions/${SELF_UID}`).set({ revokedAfterEpoch: 0 }),
        )
        await assertFails(
          db.doc(`authSessions/${SELF_UID}`).update({ revokedAfterEpoch: 0 }),
        )
        await assertFails(db.doc(`authSessions/${SELF_UID}`).delete())
      })
    })

    /**
     * Revocation applied to the assets carve-out — the half that actually stops
     * a live listener. Rules cannot import `revocation.contract.ts`, so these
     * cases are the only thing that can catch the hand-kept comparison drifting
     * from the contract it implements.
     */
    describe('revocation on the assets carve-out', () => {
      it('ALLOWS a reader with no marker at all', async () => {
        const db = testEnv
          .authenticatedContext('uid-no-marker', { auth_time: STALE_AUTH_TIME })
          .firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it('denies a token minted BEFORE the cutoff', async () => {
        await seedMarker(SELF_UID, STALE_AUTH_TIME + 1)
        const db = testEnv
          .authenticatedContext(SELF_UID, { auth_time: STALE_AUTH_TIME })
          .firestore()
        await assertFails(db.collection('assets').get())
        await assertFails(db.doc(ASSET_DOC_PATH).get())
      })

      it('ALLOWS a token minted exactly AT the cutoff', async () => {
        // Equality allows. `revocationCutoff` is floor(now/1000) + 1, so a token
        // whose auth_time equals the cutoff was minted at least a second later —
        // a genuinely fresh login, not the one being revoked.
        await seedMarker(SELF_UID, STALE_AUTH_TIME)
        const db = testEnv
          .authenticatedContext(SELF_UID, { auth_time: STALE_AUTH_TIME })
          .firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it('ALLOWS a fresh login after the cutoff', async () => {
        await seedMarker(SELF_UID, STALE_AUTH_TIME)
        const db = testEnv
          .authenticatedContext(SELF_UID, { auth_time: STALE_AUTH_TIME + 5000 })
          .firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it("reads the READER's marker, not some other account's", async () => {
        // A revoked neighbour must not deny this reader, and — the direction
        // that matters — a clean neighbour must not rescue a revoked reader.
        await seedMarker(OTHER_UID, STALE_AUTH_TIME + 1)
        const db = testEnv
          .authenticatedContext(SELF_UID, { auth_time: STALE_AUTH_TIME })
          .firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it('denies when the marker holds a non-integer — a corrupt marker fails CLOSED', async () => {
        // Comparing an int to a string is an evaluation error, and an erroring
        // rule denies. Asserted rather than assumed: this is the behaviour the
        // server boundary's `unreadable` case mirrors.
        await testEnv.withSecurityRulesDisabled(async (context) => {
          await context
            .firestore()
            .doc(`authSessions/${SELF_UID}`)
            .set({ revokedAfterEpoch: 'not-a-number' })
        })
        const db = testEnv
          .authenticatedContext(SELF_UID, { auth_time: STALE_AUTH_TIME })
          .firestore()
        await assertFails(db.collection('assets').get())
      })
    })

    /**
     * The claim gate, mirroring `requireReadySession` on the server. Without it
     * an account holding a temporary password could still stream assets through
     * the Web SDK while every server surface refused it.
     */
    describe('mustChangePassword on the assets carve-out', () => {
      it('denies a reader whose claim is exactly true', async () => {
        const db = testEnv
          .authenticatedContext(SELF_UID, { mustChangePassword: true })
          .firestore()
        await assertFails(db.collection('assets').get())
        await assertFails(db.doc(ASSET_DOC_PATH).get())
      })

      it('ALLOWS a reader whose claim is absent', async () => {
        const db = testEnv.authenticatedContext(SELF_UID).firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it('ALLOWS a reader whose claim is explicitly false', async () => {
        const db = testEnv
          .authenticatedContext(SELF_UID, { mustChangePassword: false })
          .firestore()
        await assertSucceeds(db.collection('assets').get())
      })

      it('ALLOWS a reader whose claim is a truthy non-boolean', async () => {
        // Strict `!= true`, matching the TypeScript reader's `=== true`. A
        // malformed claim must not gate: a false positive locks a user out of an
        // app they are entitled to use, with no claim left to clear.
        const db = testEnv
          .authenticatedContext(SELF_UID, { mustChangePassword: 'true' })
          .firestore()
        await assertSucceeds(db.collection('assets').get())
      })
    })
  },
)
