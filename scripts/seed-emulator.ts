/**
 * Seed the local Firebase emulators with sign-in-able users and example assets.
 *
 * Run with `pnpm seed` while `pnpm emulators` is running. Node 24 strips the
 * types natively, so this needs no build step and no extra dependency.
 *
 * THIS IS THE "RESET THE EXAMPLE DATA" TOOL, and it is destructive by design: it
 * CLEARS the assets collection before rewriting the same 30 fixtures, so running
 * it twice leaves 30 assets rather than 60. Anything you made through the UI goes
 * with them. The account half is the part that is only ever an upsert, and it
 * lives in `scripts/_seed-users.ts` so `scripts/setup-local.ts` can restore
 * accounts without running this clear.
 *
 * It deliberately does NOT import `lib/firebase/admin.ts`: that module is
 * `server-only` (it throws outside a React Server bundle) and it validates the
 * full server env. A seed script talks to the Admin SDK directly instead.
 *
 * SAFETY: this script REFUSES to run unless both emulator hosts are set. It
 * deletes data, and a seed script that can reach production is a loaded gun.
 * That fence is `requireEmulatorTarget` from `scripts/_safety.ts` — one of the
 * two gates `structure:check`'s `cli-safety` accepts. It is why this script may
 * mutate without a project-id confirmation: it cannot reach a real database.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import { ASSETS_COLLECTION } from '../features/asset/asset.path.ts'
import { COUNTERS_COLLECTION } from '../lib/data/counters.ts'
import { toSearchPrefixes } from '../lib/data/search-prefix.ts'
import { requireEmulatorTarget } from './_safety.ts'
import { SEEDED_PASSWORD, upsertSeedUsers } from './_seed-users.ts'

// The fence returns the hosts it just proved are set, so the banner below reads
// them as plain strings rather than re-narrowing what this already guaranteed.
const { auth: authHost, firestore: firestoreHost } = requireEmulatorTarget({
  need: ['auth', 'firestore'],
  action: 'seed',
})

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'

// No credential: the Admin SDK auto-routes to the emulators once the hosts are
// set, and the emulators do not verify tokens against a real service account.
const app = initializeApp({ projectId })
const auth = getAuth(app)
const db = getFirestore(app)

/** 30 assets: more than the default page size of 25, so paging has a page 2. */
function buildAssets(): {
  name: string
  code: string
  value: number
  status: 'active' | 'retired'
}[] {
  return Array.from({ length: 30 }, (_, index) => ({
    name: `Aset Contoh ${String(index + 1).padStart(2, '0')}`,
    // AST-0001..AST-0030 — the codes the counter WOULD mint. The counter doc is
    // seeded to value=30 below (`assets.length`), so the next real create
    // continues at AST-0031 instead of colliding with a seeded code.
    code: `AST-${String(index + 1).padStart(4, '0')}`,
    // A spread of rupiah values so the table, export, and asset card have
    // something to format (Rp 500.000, Rp 1.000.000, …).
    value: (index + 1) * 500_000,
    // Every 5th asset is retired, so the status filter has both sides to show.
    status: index % 5 === 0 ? ('retired' as const) : ('active' as const),
  }))
}

async function seedAssets(): Promise<number> {
  // Clear first so re-running does not pile up duplicates.
  const existing = await db.collection(ASSETS_COLLECTION).get()
  if (!existing.empty) {
    const deletion = db.batch()
    existing.docs.forEach((doc) => deletion.delete(doc.ref))
    await deletion.commit()
  }

  const assets = buildAssets()
  const batch = db.batch()
  assets.forEach((asset, index) => {
    const ref = db.collection(ASSETS_COLLECTION).doc()
    // Stagger createdAt so the cursor's sort value is distinct and ordering is
    // stable + observable. Newest first in the UI = highest index here.
    const createdAt = new Date(Date.now() - (assets.length - index) * 60_000)
    batch.set(ref, {
      name: asset.name,
      code: asset.code,
      description: `Data contoh dari scripts/seed-emulator.ts`,
      value: asset.value,
      status: asset.status,
      // Mirror createAsset: derive the required search index through the same
      // shared normaliser rather than hand-writing prefix rules here.
      searchPrefixes: toSearchPrefixes([asset.code, asset.name]),
      createdAt,
      updatedAt: createdAt,
    })
  })
  await batch.commit()

  // Seed the counter document so the next real `createAsset` mints AST-0031,
  // not AST-0001 (which would collide with a seeded code). The shape is the
  // counter schema: { id, prefix, width, value } — lib/schemas/counter.schema.ts.
  await db
    .collection(COUNTERS_COLLECTION)
    .doc('asset')
    .set({ id: 'asset', prefix: 'AST-', width: 4, value: assets.length })

  return assets.length
}

console.log(`Seeding emulators (project: ${projectId})`)
console.log(`  auth:      ${authHost}`)
console.log(`  firestore: ${firestoreHost}\n`)

console.log('Users:')
// The account half lives in `_seed-users.ts` so `setup-local.ts` can restore
// accounts WITHOUT running the asset clear below. Same upsert either way.
for (const { email, role } of await upsertSeedUsers(auth)) {
  console.log(`  ${email} (${role}) — password: ${SEEDED_PASSWORD}`)
}

const count = await seedAssets()
console.log(`\nAssets: ${count} seeded (6 retired, 24 active).`)
console.log('Done. Sign in at http://localhost:3000/login')
