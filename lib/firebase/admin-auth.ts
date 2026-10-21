import 'server-only'

/**
 * Firebase Admin Auth — on the shared adminApp(). Verifies session cookies and
 * resolves user records. This is the authentication capability that stays put:
 * the later persistence fork replaces admin-db, never this module.
 */
import { getAuth, type Auth } from 'firebase-admin/auth'

import { adminApp } from './admin-app'

export function adminAuth(): Auth {
  return getAuth(adminApp())
}
