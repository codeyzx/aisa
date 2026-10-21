'use server'

/**
 * The AI example's one action: prompt in, completion out — with one tool the
 * model may call (`lookupAsset`) to show the tool-gating doctrine: a tool's
 * `execute` delegates to a gated action, never the repo (see the tool below and
 * docs/reference/contracts/ai.md).
 *
 * It lives under the example route group rather than in `lib/actions/` for the
 * same reason the storage demo's actions do: `lib/actions/<entity>.action.ts` is
 * the home for ENTITY actions (docs/reference/contracts/data.md), and inference is
 * not an entity — there is no schema, no collection, no repo. Keeping it here
 * also means the whole demo still deletes in one shot (`trash "app/(app)/(examples)"`)
 * without stranding an AI action in the shared action layer.
 *
 * A server action, not a route handler, because `docs/reference/contracts/http-api.md`
 * already decided the transport: "Default to a server action. Reach for a route
 * handler + envelope ONLY when HTTP itself is the requirement." It lists a
 * stream as a legitimate reason — this example does not stream, so it has no
 * claim on one.
 */
import * as z from 'zod'

import { generateText, stepCountIs, tool } from 'ai'

import { getAssetAction } from '@/features/asset/asset.action'
import { runAction, type ActionResult } from '@/lib/data/action-result'
import { RateLimitedError } from '@/lib/data/domain-error'
import { rateLimit } from '@/lib/http'
import { INFERENCE_RATE_LIMIT, INFERENCE_TIMEOUT_MS } from '@/lib/ai/model'
import { inferenceModel } from '@/lib/ai/provider'

/**
 * The prompt is UNTRUSTED input and this only enforces a coarse shape. It is not
 * a prompt-injection defence and must not be read as one — egress redaction and
 * injection fencing are out of scope here, and a length cap that looks like a
 * guard is worse than no guard.
 *
 * The ceiling is a COST bound: the model bills per input token, and this action
 * is reachable by anyone holding `asset:write`.
 */
const PromptSchema = z.string().trim().min(1).max(2_000)

/**
 * Generate one completion.
 *
 * Gated on `ai:invoke`, which is admin-only and therefore fails closed:
 * `lib/auth/rbac.ts:ROLE_CAPABILITIES` grants `user` only
 * `['asset:read', 'storage:read']`. Inference costs money per call, so the
 * permissive default is the wrong one to squat on — the same reasoning storage
 * follows. This example deliberately does NOT widen `CAPABILITIES`: an example
 * is not a product decision.
 *
 * `runAction` is the real boundary. The page's `requireCapability` is UX.
 */
export async function generateAction(
  prompt: string,
): Promise<ActionResult<string>> {
  return runAction('ai:invoke', async (session) => {
    const parsed = PromptSchema.parse(prompt)

    // METERED HERE — after the capability gate, after validation, immediately
    // before the only call that costs money. Every part of that ordering is a
    // decision:
    //
    //  - INSIDE `runAction`, not around it, because the budget is per-uid and
    //    `session.uid` is what the gate resolved. Metering outside would mean
    //    re-resolving the session (a second auth path to keep honest) and
    //    charging slots to callers the gate is about to refuse anyway.
    //  - AFTER `PromptSchema.parse`, so a malformed prompt — which never reaches
    //    Anthropic and never bills — dies free and spends no slot. This is the
    //    same rule `app/api/auth/session/route.ts` states from the other side:
    //    meter the PAID call, let the free local failure through unmetered.
    //  - The key EMBEDS the resolved uid and is namespaced by purpose (`ai:`), so
    //    this budget can never share a counter with the session route's. An empty
    //    key is not possible here and `rateLimit` throws if it ever became so —
    //    that throw is the design, not a nicety.
    const limit = await rateLimit(`ai:${session.uid}`, INFERENCE_RATE_LIMIT)
    if (!limit.ok) {
      // The message is for the SERVER LOG only; the client is handed
      // `ACTION_ERROR_MESSAGE.resource_exhausted`. So the seconds go here, where
      // an operator can read them — the action envelope has no `retryAfter`
      // field the way the HTTP one does.
      throw new RateLimitedError(
        `inference budget spent for ${session.uid}; ${limit.retryAfter}s until the window resets`,
      )
    }

    const { text } = await generateText({
      model: inferenceModel(),
      prompt: parsed,
      tools: {
        // The one tool this example exists to demonstrate: it does NOT read the
        // asset repo itself — its `execute` delegates to `getAssetAction`, which
        // re-runs `runAction('asset:read')`. So a model-driven read crosses the
        // SAME capability gate a human read would, and is refused identically if
        // the caller lacks `asset:read`. A tool wired straight to the repo would
        // be a back-door around that gate — the doctrine in
        // docs/reference/contracts/ai.md. The model's tool result is a small
        // projection, never the raw doc.
        lookupAsset: tool({
          description:
            'Look up one asset by its id and return its code, name, rupiah value, and status.',
          inputSchema: z.object({
            id: z.string().describe('The asset id to read.'),
          }),
          execute: async ({ id }) => {
            const result = await getAssetAction(id)
            if (!result.ok) return { ok: false as const, reason: result.error }
            const { code, name, value, status } = result.data
            return { ok: true as const, code, name, value, status }
          },
        }),
      },
      // Allow a tool round-trip then a final narration. Without this the SDK
      // stops after the first tool call and returns empty text.
      stopWhen: stepCountIs(4),
      // The deadline, not the retry. The SDK already retries (maxRetries,
      // default 2); `abortSignal` is what actually CANCELS a hung call.
      abortSignal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    })

    return text
  })
}
