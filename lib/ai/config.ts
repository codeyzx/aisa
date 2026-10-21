import 'server-only'

import * as z from 'zod'

import { once, requiredVar, validate } from '../env/validate'

/**
 * Inference configuration — owned BY the capability, so `trash lib/ai/` takes it
 * along and only one line in `lib/env/registry.ts` remains.
 *
 * AI IS OFF BY DEFAULT. `AI_ENABLED` must be explicitly turned on, and that
 * explicitness is the whole design: it lets a misconfiguration be CAUGHT. With
 * "a key being present means on", a forgotten or typo'd key silently disables
 * inference and nothing can tell the difference between "off on purpose" and
 * "broken". Because intent is stated separately from the credential:
 *
 *   - unset / false -> off. No key is read, the provider is never initialized,
 *     and the AI surface is hidden. A fresh clone runs with no Anthropic account.
 *   - true + key    -> on.
 *   - true, no key  -> the boot check REFUSES to serve, naming the missing key.
 *
 * The flag is a strict enum, not a truthiness check: `AI_ENABLED=yes` is rejected
 * at the boundary rather than silently read as off, for the same reason LOG_LEVEL
 * is an enum — config that lies is worse than config that fails.
 */
const AiEnabledSchema = z.object({
  AI_ENABLED: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .enum(['true', 'false', '1', '0'], {
          error:
            'AI_ENABLED must be one of true, false, 1, 0 (unset means disabled)',
        })
        .optional(),
    )
    .transform((value) => value === 'true' || value === '1'),
})

// One provider, hardcoded — there is no provider seam and no offline stub, so
// there is no INFERENCE_PROVIDER to select. @ai-sdk/anthropic's default provider
// reads ANTHROPIC_API_KEY itself; this schema is a validation-and-message layer
// that buys a named failure at the boundary instead of the SDK's own.
const AiCredentialSchema = z.object({
  ANTHROPIC_API_KEY: requiredVar('ANTHROPIC_API_KEY'),
})

/** Whether inference is turned on. Everything AI-shaped checks this first. */
export const isAiEnabled = once((): boolean => {
  const env = validate(
    AiEnabledSchema,
    { AI_ENABLED: process.env.AI_ENABLED },
    'server AI',
  )
  return env.AI_ENABLED
})

/**
 * Inference credentials. Only meaningful while `isAiEnabled()` — calling it while
 * AI is off is a programming error (the caller skipped the gate), not a config
 * error, so it throws a message that says exactly that rather than blaming env.
 */
export const getAiConfig = once((): { anthropicApiKey: string } => {
  if (!isAiEnabled()) {
    throw new Error(
      'getAiConfig() was called while AI is disabled — gate the call on isAiEnabled(). Set AI_ENABLED=true to turn inference on.',
    )
  }
  const env = validate(
    AiCredentialSchema,
    { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    'server AI',
  )
  return { anthropicApiKey: env.ANTHROPIC_API_KEY }
})
