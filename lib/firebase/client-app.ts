/**
 * The shared Firebase Web SDK app. Both firebaseAuth() and firebaseDb() route
 * through this ONE get-or-init so they attach to the same FirebaseApp: the
 * Firestore Web SDK reads its auth token from the Auth component of that same
 * app, so splitting auth and firestore onto separate apps would silently break
 * authenticated realtime listeners (PERMISSION_DENIED on first read).
 *
 * Fully lazy: nothing runs at module load, so the SDK never initializes during
 * server prerender — where unset env would throw `auth/invalid-api-key`.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'

import { getFirebaseClientConfig } from '@/lib/env/client'

let cachedApp: FirebaseApp | undefined

export function firebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp
  cachedApp =
    getApps().length > 0 ? getApp() : initializeApp(getFirebaseClientConfig())
  return cachedApp
}
