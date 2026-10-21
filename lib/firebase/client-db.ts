/**
 * Firebase client Firestore — initialized independently of Auth, but on the
 * shared firebaseApp(). The Web SDK reads its auth token from that same app's
 * Auth component, so a surface needing authenticated reads must also ensure Auth
 * is initialized (see lib/firebase/use-firestore-query.ts). Lazy + cached;
 * connects the Firestore emulator once, in the browser only.
 */
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'

import { getClientEmulatorConfig } from '@/lib/env/client'
import { firebaseApp } from './client-app'

let cachedDb: Firestore | undefined

export function firebaseDb(): Firestore {
  if (cachedDb) return cachedDb
  const db = getFirestore(firebaseApp())
  // `127.0.0.1:8080`. Only connect in the browser, once.
  const emulatorHost = getClientEmulatorConfig().firestoreHost
  if (typeof window !== 'undefined' && emulatorHost) {
    const [host, port] = emulatorHost.split(':')
    connectFirestoreEmulator(db, host, Number(port))
  }
  cachedDb = db
  return db
}
