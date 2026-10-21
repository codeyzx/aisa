/**
 * Firebase client Auth — initialized independently of Firestore, but on the
 * shared firebaseApp() so the two SDKs share one app. Lazy + cached; connects
 * the Auth emulator once, in the browser only (`typeof window`).
 */
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'

import { getClientEmulatorConfig } from '@/lib/env/client'
import { firebaseApp } from './client-app'

let cachedAuth: Auth | undefined

export function firebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth
  const auth = getAuth(firebaseApp())
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
