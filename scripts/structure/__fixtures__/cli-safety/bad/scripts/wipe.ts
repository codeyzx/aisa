// BAD: reaches the Admin SDK TRANSITIVELY (through `./_admin.ts`) and mutates —
// `recursiveDelete` + `set` — while importing NEITHER gate. Exactly the shape the
// mutating-script safety manifest exists to catch: nothing stands between this
// and whatever database the env points at.
import { getDb } from './_admin.ts'

export async function wipe(collectionId: string): Promise<void> {
  const db = getDb()
  await db.recursiveDelete(db.collection(collectionId))
  await db.collection(collectionId).doc('marker').set({ wiped: true })
}
