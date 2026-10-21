import 'server-only'

/**
 * Firebase Admin Firestore — on the shared adminApp(). This is the server-side
 * persistence handle the PostgreSQL fork replaces; auth stays on admin-auth, so
 * the fork boundary is visible by module path. `settings()` is applied in
 * admin-app before any handle is taken.
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import { adminApp } from './admin-app'

export function adminDb(): Firestore {
  return getFirestore(adminApp())
}
