import 'server-only'

import * as z from 'zod'

import { once, requiredVar, validate } from '../env/validate'

/**
 * Where the Python `aisa-api` lives and the shared key it expects in
 * `X-AISA-Key`. Both are server-only: every dashboard write goes through a
 * server action that calls the API, so the browser never sees the key.
 * Registered in `lib/env/registry.ts`, so a deployment missing either refuses to
 * boot instead of failing on the first button press.
 */
const AisaApiSchema = z.object({
  AISA_API_URL: requiredVar('AISA_API_URL').pipe(
    z.url({ error: 'AISA_API_URL must be an absolute http(s) URL' }),
  ),
  AISA_API_KEY: requiredVar('AISA_API_KEY'),
})

export interface AisaApiConfig {
  baseUrl: string
  apiKey: string
}

export const getAisaApiConfig = once((): AisaApiConfig => {
  const env = validate(
    AisaApiSchema,
    {
      AISA_API_URL: process.env.AISA_API_URL,
      AISA_API_KEY: process.env.AISA_API_KEY,
    },
    'server aisa-api',
  )
  return {
    baseUrl: env.AISA_API_URL.replace(/\/+$/, ''),
    apiKey: env.AISA_API_KEY,
  }
})
