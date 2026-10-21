/**
 * Seed the local emulators: the sign-in accounts (`scripts/_seed-users.ts`) into
 * the Auth emulator and fake AISA data (`scripts/_seed-aisa.ts`) into Firestore.
 *
 * Run with `pnpm seed` while `pnpm emulators` is running. Node 24 strips the
 * types natively, so this needs no build step and no extra dependency.
 *
 * It deliberately does NOT import `lib/firebase/admin-app.ts`: that module is
 * `server-only` (it throws outside a React Server bundle) and it validates the
 * full server env. A seed script talks to the Admin SDK directly instead.
 *
 * SAFETY: this script REFUSES to run unless both emulator hosts are set. A seed
 * script that can reach production is a loaded gun.
 * That fence is `requireEmulatorTarget` from `scripts/_safety.ts` — one of the
 * two gates `structure:check`'s `cli-safety` accepts. It is why this script may
 * mutate without a project-id confirmation: it cannot reach a real database.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import { requireEmulatorTarget } from './_safety.ts'
import { seedAisa } from './_seed-aisa.ts'
import { SEEDED_PASSWORD, upsertSeedUsers } from './_seed-users.ts'

const { auth: authHost, firestore: firestoreHost } = requireEmulatorTarget({
  need: ['auth', 'firestore'],
  action: 'seed',
})

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'

// No credential: the Admin SDK auto-routes to the emulator once the host is set.
const app = initializeApp({ projectId })

console.log(`Seeding emulators (project: ${projectId})`)
console.log(`  auth:      ${authHost}`)
console.log(`  firestore: ${firestoreHost}\n`)

console.log('Users:')
for (const { email, role } of await upsertSeedUsers(getAuth(app))) {
  console.log(`  ${email} (${role}) — password: ${SEEDED_PASSWORD}`)
}

// Fixed ids, so a re-run overwrites the seed documents instead of duplicating them.
const summary = await seedAisa(getFirestore(app))
console.log(
  `AISA: ${summary.proposals} proposals, ${summary.jobs} jobs, ` +
    `${summary.history} history rows, ${summary.dailyStats} days of stats`,
)

console.log('Done. Sign in at http://localhost:3000/login')
