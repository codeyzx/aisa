/**
 * Shared Admin SDK bootstrap for the snapshot CLI (`export.ts` / `restore.ts`).
 *
 * Mirrors `scripts/seed-emulator.ts`: these run as plain `node scripts/*.ts`
 * (Node 24 strips the types natively — no tsx, no build step, no dependency). It
 * deliberately does NOT import `lib/firebase/admin.ts`, which is `server-only`
 * and eager-validates the full server env, so it throws outside a React Server
 * bundle. This talks to the Admin SDK directly instead.
 *
 * The Admin SDK auto-routes to the emulator when `FIRESTORE_EMULATOR_HOST` is
 * set — the seed relies on exactly this, and so does the CLI. No emulator host
 * means real credentials and a real project.
 *
 * ONE WORLD: `projectId` is the single value both the SDK connection and the
 * restore project-guard read. If the SDK connected to one project while the
 * guard compared against another, the guard would be checking a different
 * database than the one being written to — the guard must see what the SDK sees.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import { loadEnvFiles } from '../env-files.ts'

// BEFORE anything below reads `process.env`. These CLIs are run by hand, and a
// hand-run command inherits whatever shell it was typed into — so without this
// the project id came from the exported environment alone. A checkout that
// configures `FIREBASE_PROJECT_ID` in `.env.local`, as this repo's own setup
// does, would export a snapshot of `demo-aisa` while its owner believed they
// had dumped the project every other tool here resolves. The migration runner
// resolves it this way; two CLIs in one repo must not disagree about which
// database they are pointed at.
loadEnvFiles()

/**
 * The project the SDK connects to, resolved exported-env → `.env.local` → `.env`.
 *
 * The `demo-aisa` fallback mirrors `seed-emulator.ts` and the id the emulator is
 * started with (`--project demo-aisa`), so a bare emulator round-trip still
 * works in a checkout with no env files at all. The restore guard compares a
 * snapshot's recorded project against THIS value, not raw `process.env`, so the
 * check always tracks the actual write target.
 */
export const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'

/** Set iff the SDK is pointed at an emulator. Used only for the run banner. */
export const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

/** A single Admin Firestore handle. Lazy so merely importing this connects nothing. */
export function getDb(): Firestore {
  const app = getApps()[0] ?? initializeApp({ projectId })
  return getFirestore(app)
}
