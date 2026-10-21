/**
 * Firebase client Auth — initialized independently of Firestore, but on the
 * shared firebaseApp() so the two SDKs share one app. Lazy + cached; connects
 * the Auth emulator once, in the browser only (`typeof window`).
 */
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth'

import { getClientEmulatorConfig } from '@/lib/env/client'
import { firebaseApp } from './client-app'

let cachedAuth: Auth | undefined

/**
 * `getAuth` in a browser is `initializeAuth` with the same persistence list
 * PLUS a popup/redirect resolver, and that resolver loads Firebase's helper
 * iframe from the auth domain ahead of time — which the app's CSP `frame-src`
 * refuses, logging an error on every mobile page. Sign-in here is
 * `signInWithEmailAndPassword`, which needs no resolver, so it is left out. A
 * fork that adds `signInWithPopup` restores the resolver AND adds the auth
 * domain to `frame-src`.
 */
function browserAuth(): Auth {
  const app = firebaseApp()
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
    })
  } catch {
    // Already initialized for this app (a hot reload re-ran this module).
    return getAuth(app)
  }
}

export function firebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth
  const auth =
    typeof window === 'undefined' ? getAuth(firebaseApp()) : browserAuth()
  // `127.0.0.1:9099`. Only connect in the browser, once.
  const emulatorHost = getClientEmulatorConfig().authHost
  if (typeof window !== 'undefined' && emulatorHost) {
    connectAuthEmulator(auth, `http://${emulatorHost}`, {
      disableWarnings: true,
    })
  }
  cachedAuth = auth
  return auth
}
