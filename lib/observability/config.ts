import * as z from 'zod'

import { once, validate } from '../env/validate'

/**
 * Error-monitoring configuration — owned BY the capability, beside the code that
 * uses it, like every other capability config. Deleting
 * error monitoring is `trash lib/observability/` + `trash instrumentation-client.ts`
 * plus one call in `lib/env/client.ts` — no orphan schema left behind.
 *
 * NOT `import 'server-only'`, and that is the one structural difference from the
 * other capability configs: every value here is `NEXT_PUBLIC_*` and this module is
 * read by `instrumentation-client.ts`, i.e. in the browser. A DSN is public by
 * construction (it ships in every client bundle), so there is nothing here that a
 * `server-only` guard would be protecting.
 *
 * OPTIONAL is load-bearing, not politeness. The env layer fails fast with no
 * bypass flag, so "optional" has to be true in the SCHEMA — a required-but-blank
 * DSN would mean nobody can build this starter without a Sentry account. Unset
 * DSN => `Sentry.init` is never called => every capture is a no-op, no network
 * request is made, and no UI depends on it.
 */
const ObservabilitySchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  /**
   * The RELEASE stamp, and the browser-side twin of the server-only `BUILD_SHA`
   * that `/api/health` reports. Two keys for one fact is deliberate and cannot be
   * collapsed: `BUILD_SHA` is read from `process.env` at RUN time by the
   * container, while a release tag has to be INLINED INTO THE CLIENT BUNDLE at
   * BUILD time — a `NEXT_PUBLIC_*` is the only thing that can be. They are not
   * two things to keep in sync by hand: the Containerfile derives both from the
   * single `--build-arg BUILD_SHA`.
   *
   * Defaults to `unknown` for the same reason `BUILD_SHA` does — there is no
   * build to stamp under `pnpm dev`, and `unknown` is the honest answer rather
   * than a placeholder that looks like a version.
   */
  NEXT_PUBLIC_BUILD_SHA: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    )
    .transform((value) => value ?? 'unknown'),
})

export interface ObservabilityConfig {
  /** Undefined means error monitoring stays off — the SDK is never initialized. */
  dsn: string | undefined
  /** Release stamp attached to every event. `unknown` outside a stamped build. */
  release: string
  /** Deployment environment tag attached to every event. */
  environment: string
}

/**
 * Error-monitoring config, identical in both runtimes so a client event and a
 * server event about the same deploy carry the SAME `release` and `environment`.
 *
 * `environment` is NOT its own env key. It is `NODE_ENV`, which Next inlines into
 * the client bundle and sets in the container — so it needs no plumbing and
 * cannot drift from what actually shipped. The staging-vs-production split that a
 * dedicated key would buy is already available a better way here: a DSN names a
 * PROJECT, so pointing staging at its own project separates the streams at the
 * destination instead of by a tag every deploy has to remember to set.
 */
export const getObservabilityConfig = once((): ObservabilityConfig => {
  const env = validate(
    ObservabilitySchema,
    {
      // Spelled out as static literals, never a `process.env[name]` lookup:
      // Next only inlines `NEXT_PUBLIC_*` reads it can see literally.
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
      NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA,
    },
    'client observability',
  )
  return {
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    release: env.NEXT_PUBLIC_BUILD_SHA,
    environment: process.env.NODE_ENV,
  }
})
