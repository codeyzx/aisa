import { readFileSync } from 'node:fs'

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { EMULATOR_HOST, requireEmulatorOrSkip } from '@/test/emulator'

/**
 * firestore.rules is deny-all: every client read and write must be rejected,
 * because all legitimate access goes through the Admin SDK (which bypasses
 * rules). This asserts the boundary actually denies rather than trusting the
 * file to say so.
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

function splitHostPort(value: string): [string, number] {
  const index = value.lastIndexOf(':')
  return [value.slice(0, index), Number(value.slice(index + 1))]
}

const reachable = await requireEmulatorOrSkip('firestore.rules tests')

describe.skipIf(!reachable)(
  'firestore.rules (deny-all + revocation-marker carve-out)',
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
    // it. Even an admin-claimed client has no direct Firestore access.
    it('denies a signed-in client carrying an admin role claim', async () => {
      const db = testEnv
        .authenticatedContext('uid-1', { role: 'admin' })
        .firestore()
      await assertFails(db.doc(DOC_PATH).get())
      await assertFails(db.doc(DOC_PATH).set({ value: 1 }))
    })
  },
)
