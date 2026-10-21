import 'server-only'

import * as z from 'zod'

import { LOG_LEVELS } from '../log/levels'
import { once, requiredVar, validate } from './validate'

/**
 * PRIVATE (runtime) configuration that is NOT owned by a deletable capability:
 * the Firebase Admin credential, emulator hosts, the log level, and the build
 * stamp. A capability's own config lives WITH the capability (`lib/storage/
 * config.ts`, `lib/ai/config.ts`, `lib/auth/impersonation.config.ts`) so deleting
 * the directory deletes its config too; only `./registry` needs the one line
 * removed. See `docs/explanation/architecture.md`.
 *
 * `import 'server-only'` replaces the old browser-throwing Proxy, and is strictly
 * stronger: the Proxy threw at RUNTIME if a client component reached a secret,
 * whereas this fails the BUILD. Reading a secret in the browser is now impossible
 * to ship, not merely impossible to survive.
 *
 * Each group is its own memoized function so a missing Firebase Admin credential
 * cannot throw before the other groups are ever read — the boot check reports
 * every misconfigured group at once, never just the first.
 */

/**
 * WHICH DATABASE, not how to authenticate to it. Split from the credential
 * schema below and deliberately requires NOTHING: both hosts are optional, so
 * asking "am I pointed at an emulator?" is answerable without a service account.
 *
 * That independence is the whole point. `admin-app.ts` asks this FIRST, precisely
 * to decide whether a credential is needed at all — if the question itself
 * demanded one, the emulator path could never run without production secrets, and
 * `pnpm test:integration` could not run at all.
 */
const EmulatorSchema = z.object({
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
})

/**
 * The project id alone. Needed on BOTH paths — the emulator initialises with it
 * and no credential — so it is separated from the certificate it usually travels
 * with; requiring the cert to learn the project id is what broke the emulator.
 */
const FirebaseProjectSchema = z.object({
  FIREBASE_PROJECT_ID: requiredVar('FIREBASE_PROJECT_ID'),
})

/** The service-account certificate. Required only on the non-emulator path. */
const FirebaseAdminSchema = z.object({
  FIREBASE_PROJECT_ID: requiredVar('FIREBASE_PROJECT_ID'),
  FIREBASE_CLIENT_EMAIL: requiredVar('FIREBASE_CLIENT_EMAIL'),
  // env UIs store newlines as the literal `\n` sequence; normalize on parse so
  // the PEM the Admin SDK receives is a real multi-line key.
  FIREBASE_PRIVATE_KEY: requiredVar('FIREBASE_PRIVATE_KEY').transform((value) =>
    value.replace(/\\n/g, '\n'),
  ),
})

/**
 * Log threshold. An env key deliberately — the contrast with the rate-limit
 * budget (a module constant) is the point: a budget is a PRODUCT decision and
 * belongs where a test can reach it, while a log level is per-DEPLOYMENT config,
 * since the same build runs debug in staging and info in prod.
 *
 * The enum is load-bearing. A bare string coerced to a default on a typo is
 * config that lies: you set LOG_LEVEL=verbose, the app says info, and nothing
 * tells you. Rejected at the boundary instead.
 */
const LoggingSchema = z.object({
  // `.default` only fires on `undefined`, but a dotenv loader yields `''` for a
  // bare `LOG_LEVEL=`, so an empty string is normalized to undefined FIRST —
  // otherwise copying .env.example verbatim would fail the enum.
  LOG_LEVEL: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(LOG_LEVELS).optional(),
    )
    .transform((level) => level ?? 'info'),
})

/**
 * Build stamp, populated by the Containerfile at image build. `.default` is the
 * same load-bearing move as the optional Sentry DSN: requiring a commit SHA would
 * mean nobody could run `pnpm dev`. A stamp also validates nothing by nature — it
 * is whatever the build says — so `unknown` in dev is the honest answer.
 */
const BuildSchema = z.object({
  BUILD_SHA: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    )
    .transform((value) => value ?? 'unknown'),
  BUILT_AT: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    )
    .transform((value) => value ?? 'unknown'),
})

const loadFirebaseAdminEnv = once(() =>
  validate(
    FirebaseAdminSchema,
    {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    },
    'server Firebase Admin',
  ),
)

const loadEmulatorEnv = once(() =>
  validate(
    EmulatorSchema,
    {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    },
    'server emulator',
  ),
)

const loadFirebaseProjectEnv = once(() =>
  validate(
    FirebaseProjectSchema,
    { FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID },
    'server Firebase project',
  ),
)

/** Admin SDK service-account credential. Read on every authenticated request. */
export function getFirebaseAdminConfig(): {
  projectId: string
  clientEmail: string
  privateKey: string
} {
  const env = loadFirebaseAdminEnv()
  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
  }
}

/** The Firebase project id, with no credential required. */
export function getFirebaseProjectId(): string {
  return loadFirebaseProjectEnv().FIREBASE_PROJECT_ID
}

/** Server-side emulator hosts. Requires no credential — see `EmulatorSchema`. */
export function getServerEmulatorConfig(): {
  firestoreHost: string | undefined
  authHost: string | undefined
} {
  const env = loadEmulatorEnv()
  return {
    firestoreHost: env.FIRESTORE_EMULATOR_HOST,
    authHost: env.FIREBASE_AUTH_EMULATOR_HOST,
  }
}

/**
 * Whether this process talks to an emulator rather than a real project. Either
 * host is enough: the Admin SDK routes per-service, so one being set already
 * means this is not a plain production target.
 */
export function isEmulatorTarget(): boolean {
  const { firestoreHost, authHost } = getServerEmulatorConfig()
  return Boolean(firestoreHost || authHost)
}

/** Structured-log threshold. Defaults to `info`; a typo throws at boot. */
export const getLoggingConfig = once(() => {
  const env = validate(
    LoggingSchema,
    { LOG_LEVEL: process.env.LOG_LEVEL },
    'server logging',
  )
  return { level: env.LOG_LEVEL }
})

/** Build stamp for `/api/health`. `unknown` outside a container image is honest. */
export const getBuildInfo = once(() => {
  const env = validate(
    BuildSchema,
    { BUILD_SHA: process.env.BUILD_SHA, BUILT_AT: process.env.BUILT_AT },
    'server build stamp',
  )
  return { sha: env.BUILD_SHA, builtAt: env.BUILT_AT }
})
