// A local Admin SDK bootstrap, mirroring `scripts/snapshot/_admin.ts`: the
// firebase-admin reach of its importers is TRANSITIVE, through this file.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

export function getDb(): Firestore {
  return getFirestore(initializeApp({ projectId: 'demo-fixture' }))
}
