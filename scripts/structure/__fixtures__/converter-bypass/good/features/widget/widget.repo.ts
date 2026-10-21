// GOOD: references come from the accessor layer, and the raw handle is used only
// for runTransaction — the correct way to make a multi-document write atomic.
// This is the case the check must stay silent on; flagging it would push forkers
// away from transactions entirely.
import { adminDb } from '../../lib/firebase/admin-db.ts'
import { typedCollection } from '../../lib/firebase/collections.ts'

export function listWidgets(): unknown {
  return typedCollection('widgets')
}

export function createWidget(): Promise<string> {
  return adminDb().runTransaction(async () => 'w1')
}
