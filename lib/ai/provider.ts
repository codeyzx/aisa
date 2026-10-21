import 'server-only'

/**
 * Inference through the Vercel AI SDK.
 *
 * ONE provider, hardcoded. There is deliberately no registry, no
 * `INFERENCE_PROVIDER`, and no runtime stub. Do not go looking for a way to
 * re-add the seam — its offline half is a TEST concern, not production code, and
 * the offline double lives in `provider.test.ts` and nowhere else.
 *
 * `server-only` is load-bearing: this module reads `getAiConfig()`, which holds
 * the API key. A client import fails the BUILD rather than shipping a
 * credential to the browser — the same reason the S3 key stays out of the browser.
 *
 * This module's whole job is binding the credential and the model choice to a
 * handle. Everything else — tools, structured output, streaming, embeddings,
 * retries — the SDK already models generally, so callers use `generateText` and
 * friends directly. There is deliberately no `generate()` wrapper: it would be a
 * local variant of `generateText` that caps callers at the one signature we
 * happened to think of.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { type LanguageModel } from 'ai'

import { getAiConfig, isAiEnabled } from './config'
import { DEFAULT_MODEL } from './model'

/**
 * The configured model handle.
 *
 * GATED ON `isAiEnabled()` FIRST, before any credential is read and before the
 * provider is constructed. AI is off by default (`lib/ai/config.ts`), and "off"
 * has to mean the provider is never initialized — otherwise a disabled capability
 * would still demand an API key, and the toggle would only be cosmetic. Reaching
 * an AI surface with AI off is a PROGRAMMING error (a caller skipped the gate),
 * not a config error, so the message says exactly that rather than blaming env.
 *
 * The key is passed EXPLICITLY rather than letting `@ai-sdk/anthropic`'s default
 * provider read `process.env.ANTHROPIC_API_KEY` itself. That matters:
 * `lib/ai/config.ts` notes that its schema is "a validation-and-message layer,
 * not the transport", and if the two ever disagree the SDK wins silently.
 * Threading the validated value through here closes that gap — the schema IS the
 * transport, so the two cannot disagree.
 *
 * The credential requirement is BOOT, not first use: `lib/env/registry.ts` lists
 * AI as a capability whose config is validated at startup WHEN ENABLED, so an app
 * that ships AI on but never calls it still needs the key to boot. Deleting the
 * capability (`trash lib/ai/` plus its registry line) removes the requirement
 * entirely; leaving `AI_ENABLED` unset removes it without deleting the code.
 *
 * Called per request rather than memoized at module scope: a module-level handle
 * would read the env at import time, before the boot check's controlled trigger,
 * and could fail an import that has no AI configured.
 */
export function inferenceModel(): LanguageModel {
  if (!isAiEnabled()) {
    throw new Error(
      'inferenceModel() was called while AI is disabled — gate the call on isAiEnabled(). Set AI_ENABLED=true to turn inference on.',
    )
  }
  const anthropic = createAnthropic({ apiKey: getAiConfig().anthropicApiKey })
  return anthropic(DEFAULT_MODEL)
}
