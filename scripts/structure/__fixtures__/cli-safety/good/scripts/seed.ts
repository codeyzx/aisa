// GOOD: reaches the Admin SDK transitively and mutates, but stands behind the
// emulator fence — it cannot run at all unless the emulator hosts are set, so it
// provably cannot reach a real database. The OTHER legitimate gate.
import { getDb } from './_admin.ts'
import { requireEmulatorTarget } from './_safety.ts'

requireEmulatorTarget({ need: ['auth', 'firestore'] })

export async function seed(): Promise<void> {
  const db = getDb()
  const batch = db.batch()
  batch.set(db.collection('assets').doc('one'), { name: 'seeded' })
  await batch.commit()
}
