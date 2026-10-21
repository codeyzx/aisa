/**
 * The Firebase Web SDK app. The browser uses it for ONE thing: signing in with
 * email + password (`client-auth.ts`), so the password goes straight to Google
 * and never to this app's origin. Every Firestore read stays server-side.
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
