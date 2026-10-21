/**
 * The shard's Firestore emulator for the E2E acceptance specs
 * (`e2e/acceptance/`): read the numbers a screen must match, and put
 * `settings/runtime` into a state the seed does not ship (STOP) and back.
 *
 * It lives under `scripts/` because it is plain Node that is never bundled:
 * the Admin SDK may not be value-imported elsewhere without `server-only`, and
 * `server-only` throws outside a React Server bundle — a Playwright worker
 * included.
 *
 * SAFETY: it writes, so it stands behind `requireEmulatorTarget` (the gate
 * `structure:check`'s `cli-safety` accepts) and additionally refuses any
 * emulator host that is not loopback. `scripts/e2e-fast.ts` sets
 * `FIRESTORE_EMULATOR_HOST` per shard.
 *
 * The `_` prefix marks a shared, non-entry module: imported, never run.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import {
  RUNTIME_DOC_ID,
  SETTINGS_COLLECTION,
} from '../features/aisa/aisa.path.ts'
import { requireEmulatorTarget } from './_safety.ts'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

let db: Firestore | undefined

/** The emulator named by `FIRESTORE_EMULATOR_HOST`, through the Admin SDK. */
export function emulatorDb(): Firestore {
  if (db) return db
  const { firestore: host } = requireEmulatorTarget({
    need: ['firestore'],
    action: 'open Firestore for the E2E specs',
  })
  if (!LOOPBACK.has(host.replace(/:\d+$/u, ''))) {
    throw new Error(
      `Refusing to open Firestore: FIRESTORE_EMULATOR_HOST is ${host}, not a loopback emulator.`,
    )
  }
  const app =
    getApps()[0] ??
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-aisa' })
  db = getFirestore(app)
  return db
}

/**
 * Run `body` with `settings/runtime` patched, then put the document back
 * exactly as it was — the other tests on the shard read it too.
 */
export async function withRuntime(
  patch: Record<string, unknown>,
  body: () => Promise<void>,
): Promise<void> {
  const ref = emulatorDb().collection(SETTINGS_COLLECTION).doc(RUNTIME_DOC_ID)
  const before = (await ref.get()).data()
  await ref.set({ ...before, ...patch })
  try {
    await body()
  } finally {
    if (before) await ref.set(before)
    else await ref.delete()
  }
}
