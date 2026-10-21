import * as z from 'zod'

import { getObservabilityConfig } from '../observability/config'
import { once, requiredVar, validate } from './validate'

/**
 * PUBLIC (build-time) configuration — the `NEXT_PUBLIC_*` half.
 *
 * This half is separate from `./server` for a load-bearing reason, not tidiness.
 * `NEXT_PUBLIC_*` values are INLINED into the client bundle by `next build`, so
 * they must exist at BUILD time and a missing one has to fail the build — it
 * cannot be fixed afterwards. Server secrets are read per request instead, so
 * requiring them at build would force credentials into the image builder for no
 * benefit. `validateClientEnv()` is the explicit, callable build-time gate that
 * `next.config.ts` invokes; nothing relies on an import side effect any more.
 *
 * Safe to import from client OR server code — every value here ships to the
 * browser by definition.
 */

const FirebaseClientSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: requiredVar('NEXT_PUBLIC_FIREBASE_API_KEY'),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: requiredVar(
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  ),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: requiredVar(
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  ),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: requiredVar(
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  ),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: requiredVar(
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  ),
  NEXT_PUBLIC_FIREBASE_APP_ID: requiredVar('NEXT_PUBLIC_FIREBASE_APP_ID'),
})

const ClientEmulatorSchema = z.object({
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
})

/**
 * `NEXT_PUBLIC_*` must be referenced as STATIC LITERALS so Next inlines them into
 * the client bundle; a dynamic `process.env[name]` lookup would not be. Every
 * read below is therefore spelled out rather than looped.
 */
function readFirebaseClientEnv() {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
}

/** Public Firebase web config, shaped exactly as `initializeApp` wants it. */
export const getFirebaseClientConfig = once(() => {
  const env = validate(
    FirebaseClientSchema,
    readFirebaseClientEnv(),
    'client Firebase',
  )
  return {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
})

/** Client-side emulator hosts. Both unset in a normal (non-emulator) run. */
export const getClientEmulatorConfig = once(() => {
  const env = validate(
    ClientEmulatorSchema,
    {
      NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST:
        process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    },
    'client emulator',
  )
  return {
    firestoreHost: env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
    authHost: env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  }
})

/**
 * The explicit BUILD-TIME gate, called by `next.config.ts`. Forces every public
 * group to parse now, so a missing `NEXT_PUBLIC_*` fails `next build` rather than
 * shipping a bundle with `undefined` inlined into it.
 *
 * This is the PUBLIC-side counterpart of `lib/env/registry.ts`: a capability that
 * owns its own public config is listed HERE rather than declaring its schema in
 * this file, so `trash lib/observability/` removes one line instead of leaving an
 * orphan schema behind.
 */
export function validateClientEnv(): void {
  getFirebaseClientConfig()
  getClientEmulatorConfig()
  getObservabilityConfig()
}
