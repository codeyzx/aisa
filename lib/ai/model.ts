import { type RateLimitBudget } from '@/lib/http'

/**
 * The model choice, the deadline, and the spend budget — the load-bearing
 * constants of the AI path.
 *
 * Deliberately its OWN module, with no `server-only` and no credential-touching
 * import, exactly like `lib/storage/limits.ts`. The split is load-bearing and it
 * is not taste: `lib/ai/provider.ts` is `server-only` and reads the Anthropic
 * credential, so importing the provider to read a constant drags the credential
 * boundary into the test runner. A load-bearing constant must not live in a
 * module tests can only reach through scaffolding: put these in `provider.ts`
 * and a colocated test needs AI_ENABLED and a key before it can assert anything.
 *
 * Keep this file free of anything that is not a plain constant.
 */

/**
 * The default model.
 *
 * A module CONSTANT, not an env key — the settled rule for a load-bearing
 * number. There is no `INFERENCE_MODEL`: adding it would reopen the closed env
 * list for a knob no caller has asked for.
 *
 * `claude-haiku-4-5` is the cheapest tier — the bill-safe floor every downstream
 * project's first call runs on, so a fork does not wake up to a surprise invoice.
 * Step UP by editing this one line. The ids are Anthropic's taxonomy, not ours,
 * so there is deliberately no enum here to keep in sync — a hand-kept model list
 * goes stale and caps what a downstream project can configure:
 *
 *   - `claude-sonnet-5`  — mid tier
 *   - `claude-opus-4-8`  — most capable, priciest
 *
 * Use ids AS-IS. Never append a date suffix to an alias.
 */
export const DEFAULT_MODEL = 'claude-haiku-4-5'

/**
 * Wall-clock deadline for one inference call.
 *
 * This is the DEADLINE, not the retry. The SDK already retries (`maxRetries`,
 * default 2) and `lib/ai` deliberately does NOT add a second retry wrapper —
 * wrapping a caller that already retries multiplies the attempt count and still
 * is not a deadline.
 *
 * It is passed to the SDK as an `abortSignal`, which actually CANCELS the
 * request. A `Promise.race` would only bound the await and leave the call in
 * flight, billing us for a response nobody reads.
 */
export const INFERENCE_TIMEOUT_MS = 30_000

/**
 * The per-uid spend budget for inference — the cost guard `_actions.ts` passes to
 * `lib/http`'s `rateLimit`.
 *
 * A MODULE CONSTANT, never an env key. That is `lib/http`'s stated rule for a
 * budget, and it is also the only shape available: `_actions.ts` carries
 * `'use server'`, so every export in it must be an async function and a constant
 * cannot live there literally. This module is where a load-bearing AI constant a
 * TEST must reach already lives (see `INFERENCE_TIMEOUT_MS` above), and it is the
 * one AI module a client component may import — which is what lets the UI print
 * the real cap instead of a second, drifting copy of the number.
 *
 * 5 per minute per uid is deliberately TIGHT, unlike the session route's generous
 * 10/min: that budget guards a free-to-us Google round trip, this one guards a
 * call billed per token to a third party, and the surface is a human typing a
 * prompt and reading a paragraph back — nobody does that six times in a minute.
 * The deadline is 30s, so five slots also outlast any single hung call.
 *
 * The limitation is `lib/http`'s, restated because it bounds what this promises:
 * the counter lives in ONE PROCESS. Two replicas double the effective cap and a
 * restart resets it. It stops one caller burning the account; it is not a global
 * quota, and nothing may describe it as one.
 */
export const INFERENCE_RATE_LIMIT: RateLimitBudget = {
  limit: 5,
  windowMs: 60_000,
}
