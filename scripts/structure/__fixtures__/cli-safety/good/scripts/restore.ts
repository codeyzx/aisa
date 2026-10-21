// GOOD: reaches the Admin SDK transitively and mutates, but stands behind the
// project-id confirmation gate — the operator types the target project back on
// the controlling terminal before anything is written.
import { getDb } from './_admin.ts'
import { requireProjectIdConfirmation } from './_safety.ts'

export async function restore(projectId: string): Promise<void> {
  requireProjectIdConfirmation({ projectId })
  const db = getDb()
  await db.collection('assets').doc('one').set({ name: 'restored' })
}
