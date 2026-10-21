import 'server-only'

import * as z from 'zod'

import { once, requiredVar, validate } from '../env/validate'

/**
 * Storage (S3-compatible) configuration — owned BY the capability, living beside
 * the code that uses it. `trash lib/storage/` takes this schema with it; the only
 * remaining trace is one line in `lib/env/registry.ts`. That is the whole point
 * of colocating config: a deleted capability leaves no orphan schema behind.
 *
 * GENERIC on purpose: the default backend is self-hosted SeaweedFS, the managed
 * alternative is Cloudflare R2, and swapping between them is an env change only —
 * nothing in the code names a backend.
 */
const StorageSchema = z.object({
  S3_ENDPOINT: requiredVar('S3_ENDPOINT'),
  /**
   * Where the BROWSER reaches storage, when that is not where the SERVER does.
   *
   * A presigned URL is signed against a specific host, so the host baked into it
   * is whatever client minted it — there is no rewriting it afterwards without
   * breaking the signature. One endpoint therefore only works when the app and
   * the browser can both reach storage at the SAME address, which is true on the
   * host dev path by luck and false everywhere the two are on different
   * networks: Compose (`http://seaweedfs:8333` resolves only on the compose
   * network, never in the reader's browser) and any deployment where the app
   * talks to storage over a private hostname or VPC endpoint.
   *
   * Optional, and defaults to `S3_ENDPOINT`, so a single-address deployment
   * needs no new configuration and nothing about the R2/SeaweedFS swap changes.
   */
  S3_PUBLIC_ENDPOINT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  // Signature v4 requires a region even where the backend ignores it (SeaweedFS
  // accepts any); R2 mandates `auto`. Defaulted so only real secrets are required.
  S3_REGION: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    )
    .transform((value) => value ?? 'us-east-1'),
  S3_BUCKET: requiredVar('S3_BUCKET'),
  S3_ACCESS_KEY_ID: requiredVar('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: requiredVar('S3_SECRET_ACCESS_KEY'),
})

export interface StorageConfig {
  /** Where the SERVER reaches storage: copy, delete, server-side put. */
  endpoint: string
  /** Where the BROWSER reaches it. Equals `endpoint` unless configured apart. */
  publicEndpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/** Storage credentials. Validated once at boot via the capability registry. */
export const getStorageConfig = once((): StorageConfig => {
  const env = validate(
    StorageSchema,
    {
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT,
      S3_REGION: process.env.S3_REGION,
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    },
    'server S3 storage',
  )
  return {
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  }
})
