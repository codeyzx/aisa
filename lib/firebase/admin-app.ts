import 'server-only'

/**
 * The shared Firebase Admin app and its one-time Firestore settings. adminDb()
 * routes through adminApp(), and so does adminAuth() unless Auth impersonates a
 * dedicated account (`admin-auth.ts`), so credentials and the app handle are
 * created once (cached on `globalThis` so dev HMR reuses one instance).
 *
 * The `settings()` call lives HERE, not in admin-db: it must run before the first
 * Firestore handle is taken, so tying it to app init keeps that ordering no matter
 * which getter is called first. Fully lazy — importing this opens no connection.
 */
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import {
  getFirebaseAdminConfig,
  getFirebaseProjectId,
  isEmulatorTarget,
} from '@/lib/env/server'

const globalForAdmin = globalThis as typeof globalThis & {
  firebaseAdminApp?: App
}

/**
 * A real project: the service-account key when one is configured, else
 * Application Default Credentials (on Cloud Run, the runtime service account).
 * `projectId` is passed explicitly either way so ADC never has to guess it.
 */
function initRealProjectApp(): App {
  const { projectId, serviceAccount } = getFirebaseAdminConfig()
  return initializeApp({
    projectId,
    credential: serviceAccount
      ? cert({ projectId, ...serviceAccount })
      : applicationDefault(),
  })
}

function initAdminApp(): App {
  // Reuse the DEFAULT app from a prior HMR reload. Not `getApps()[0]`: the
  // impersonating Auth app (`admin-auth.ts`) is a second, named app, and
  // reusing it here would run Firestore as the impersonated account.
  const existing = getApps().find((app) => app.name === '[DEFAULT]')
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
    : initRealProjectApp()

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
