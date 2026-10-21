import 'server-only'

/**
 * The shared Firebase Admin app and its one-time Firestore settings. adminAuth()
 * and adminDb() both route through adminApp() so credentials and the app handle
 * are created once (cached on `globalThis` so dev HMR reuses one instance).
 *
 * The `settings()` call lives HERE, not in admin-db: it must run before the first
 * Firestore handle is taken, so tying it to app init keeps that ordering no matter
 * which getter is called first. Fully lazy — importing this opens no connection.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import {
  getFirebaseAdminConfig,
  getFirebaseProjectId,
  isEmulatorTarget,
} from '@/lib/env/server'

const globalForAdmin = globalThis as typeof globalThis & {
  firebaseAdminApp?: App
}

function initAdminApp(): App {
  // Reuse an app from a prior HMR reload or created elsewhere in the process.
  const existing = getApps()[0]
  if (existing) return existing

  // When an emulator host is set the Admin SDK auto-routes to it and needs no
  // real service-account credential, so initialize with the project id alone.
  // Otherwise authenticate with the service-account certificate.
  //
  // Both calls below are lazy for a reason: reading the emulator hosts must not
  // require a credential, and the emulator branch must never touch
  // `getFirebaseAdminConfig()` — otherwise running against the emulator would
  // still demand a production service account, which is what it exists to avoid.
  const app = isEmulatorTarget()
    ? initializeApp({ projectId: getFirebaseProjectId() })
    : initializeApp({ credential: cert(getFirebaseAdminConfig()) })

  // Apply Firestore settings exactly once, before any handle is taken on it.
  // `settings()` throws if Firestore was already used (possible across HMR
  // reloads that reuse an app), so the failure is safe to ignore.
  try {
    getFirestore(app).settings({ ignoreUndefinedProperties: true })
  } catch {
    // already configured on a previous reload
  }

  return app
}

export function adminApp(): App {
  return (globalForAdmin.firebaseAdminApp ??= initAdminApp())
}
