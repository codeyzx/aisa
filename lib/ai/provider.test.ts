/**
 * The offline double for the AI path lives HERE, in the test, and nowhere else.
 * Production keeps one provider and zero branches; CI still runs offline. A stub
 * is not a mock — a runtime-selectable provider would be production code, which
 * this repo deliberately does not ship.
 *
 * The double is `MockLanguageModelV4` from the SDK's own `ai/test` entrypoint,
 * NOT a bespoke `interface Model { generate(): string }`. A double satisfying a
 * shape we invented is a parallel model of "a language model" — it would not be
 * standing in for the real thing, it would be standing in for our idea of it.
 *
 * Nothing here needs a key or a network.
 */
import { generateText } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_MODEL, INFERENCE_TIMEOUT_MS } from './model'

/**
 * These fixtures cover the CONTRACT a caller depends on — that a model handle
 * drives `generateText`, and that the deadline actually reaches the provider.
 * They stand in for a model, so they say nothing about which model or which
 * credential `inferenceModel()` picked; that half is driven separately at the
 * bottom of this file, against a mocked `@ai-sdk/anthropic`.
 */
function answering(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    // Both `finishReason` and `usage` are V4's NESTED shapes, not the flat ones
    // every AI SDK example on the internet still shows: `finishReason` is
    // `{ unified, raw }`, not the string `'stop'`, and `usage.inputTokens` is an
    // object, not a number. This is a `specificationVersion: 'v4'` model — read
    // the installed package, not the training data. (The compiler catches it, but
    // only after reporting `Type 'string' is not assignable` for a literal that
    // IS a string, which sends you looking in the wrong place.)
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: 'end_turn' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  })
}

/**
 * A model that never answers — the hung provider the deadline exists for.
 *
 * It rejects when the abort signal fires, which is what a real provider's
 * `fetch` does with the same signal. That fidelity is the whole point: a fixture
 * that IGNORES the signal (`() => new Promise(() => {})`) does not reject at the
 * deadline — it hangs until vitest's own 5s timeout kills it. `generateText`
 * PROPAGATES `abortSignal` into `doGenerate`, it does not itself cancel anything.
 * The cancellation is the provider's to honour.
 */
function neverResolving(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) =>
      new Promise((_resolve, reject) => {
        abortSignal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        )
      }),
  })
}

describe('the model handle drives the SDK', () => {
  it('returns the completion text', async () => {
    const { text } = await generateText({
      model: answering('a deterministic answer'),
      prompt: 'anything',
    })

    expect(text).toBe('a deterministic answer')
  })
})

describe('the default model', () => {
  it('is a bare alias, with no date suffix appended', () => {
    // Ids are used AS-IS. Appending a date to an alias invents an id that does
    // not exist, and the failure is a 404 at the provider, not a type error.
    expect(DEFAULT_MODEL).toBe('claude-haiku-4-5')
    expect(DEFAULT_MODEL).not.toMatch(/-\d{8}$/)
  })
})

describe('the deadline', () => {
  it('reaches the model, so a provider can honour it', async () => {
    // The claim `lib/ai` actually depends on. `generateText` does not cancel
    // anything itself — it hands the signal DOWN to the model, and the real
    // provider's fetch is what aborts. If this propagation ever breaks, the
    // deadline silently becomes decorative, which is the failure worth a test.
    const model = answering('answered')
    const signal = AbortSignal.timeout(1_000)

    await generateText({ model, prompt: 'anything', abortSignal: signal })

    expect(model.doGenerateCalls[0]?.abortSignal).toBe(signal)
  })

  it('rejects a hung provider instead of hanging', async () => {
    // The real deadline is INFERENCE_TIMEOUT_MS; the test drives the same
    // MECHANISM (`abortSignal`) on a short fuse, because a test that waits 30s
    // to prove a timeout is a test nobody runs.
    const call = generateText({
      model: neverResolving(),
      prompt: 'anything',
      // The SDK retries by default; a hung call must not be retried into
      // 3x the deadline.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(50),
    })

    await expect(call).rejects.toThrow()
  })

  it('has a deadline that is finite and bounded', () => {
    expect(INFERENCE_TIMEOUT_MS).toBeGreaterThan(0)
    expect(Number.isFinite(INFERENCE_TIMEOUT_MS)).toBe(true)
  })
})

/**
 * `inferenceModel()` — the construction path itself, driven with no key and no
 * network.
 *
 * The block above stands in for a MODEL; this one stands in for the SDK, so that
 * what `inferenceModel()` hands the SDK becomes assertable. That is a different
 * double for a different seam, not a second offline provider: production still
 * has one provider and zero branches, and nothing here is reachable from it.
 *
 * `vi.mock` and `vi.hoisted` are lifted above the imports wherever they appear,
 * so this section sits at the bottom next to the tests it serves — file position
 * carries no meaning here.
 *
 * `lib/ai/config.ts` is deliberately NOT mocked. Its whole claim is that the
 * validated schema IS the transport, and a stubbed config would prove that claim
 * against a stand-in for itself. Stubbing the ENV instead (the idiom in
 * `lib/env.boot.test.ts`) drives the real enum, the real `requiredVar`, and the
 * real `once()` memoization, so these tests fail if any of them stops holding.
 */
const anthropicSdk = vi.hoisted(() => {
  // Two levels, because the production line is two calls: `createAnthropic(opts)`
  // returns the provider, and the provider is then called with a model id.
  // Splitting them is what lets the credential and the model choice fail
  // independently instead of as one opaque "wiring is wrong".
  const provider = vi.fn((modelId: string) => ({ mockModelId: modelId }))
  return {
    provider,
    createAnthropic: vi.fn((_options: { apiKey: string }) => provider),
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: anthropicSdk.createAnthropic,
}))

/** Obvious junk. If a real key is ever needed to run this file, it is broken. */
const STUB_KEY = 'sk-ant-not-a-real-key'

/**
 * A fresh module graph per test: `isAiEnabled()` and `getAiConfig()` are wrapped
 * in `once()`, so a graph carried between tests would answer with the FIRST
 * test's env and the rest would assert nothing.
 */
async function loadProvider(env: {
  AI_ENABLED: string | undefined
  ANTHROPIC_API_KEY: string | undefined
}) {
  vi.resetModules()
  vi.stubEnv('AI_ENABLED', env.AI_ENABLED)
  vi.stubEnv('ANTHROPIC_API_KEY', env.ANTHROPIC_API_KEY)
  return import('./provider')
}

describe('inferenceModel', () => {
  beforeEach(() => {
    anthropicSdk.createAnthropic.mockClear()
    anthropicSdk.provider.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('refuses while AI is disabled, without touching the credential', async () => {
    // Catches deleting or inverting the `!isAiEnabled()` gate. The message is
    // matched by the FUNCTION IT NAMES, not by the shared "while AI is disabled"
    // phrasing: `getAiConfig()` refuses in the same words one layer down, so a
    // loose match stays green when this gate is deleted and the credential
    // loader catches the fall — reporting a second line of defence as if it were
    // the first. The second assertion is the half a `toThrow` alone would miss:
    // "off" has to mean the provider is NEVER CONSTRUCTED, otherwise a disabled
    // capability still reads a key and the toggle is cosmetic. A key is present
    // here on purpose, so the refusal cannot be coming from a missing one.
    const { inferenceModel } = await loadProvider({
      AI_ENABLED: 'false',
      ANTHROPIC_API_KEY: STUB_KEY,
    })

    expect(() => inferenceModel()).toThrow(
      /inferenceModel\(\) was called while AI is disabled/,
    )
    expect(anthropicSdk.createAnthropic).not.toHaveBeenCalled()
  })

  it('passes the validated key to the SDK explicitly', async () => {
    // THE regression this file exists for. `@ai-sdk/anthropic`'s default
    // provider reads `process.env.ANTHROPIC_API_KEY` itself, so dropping this
    // argument leaves a working app and a silently unenforced schema — until the
    // two disagree and the SDK wins. `toStrictEqual` on the whole call list, not
    // `toHaveBeenCalledWith`: it pins the argument SHAPE (one call, exactly one
    // key) so an added field or a second construction is a failure too.
    const { inferenceModel } = await loadProvider({
      AI_ENABLED: 'true',
      ANTHROPIC_API_KEY: STUB_KEY,
    })

    inferenceModel()

    expect(anthropicSdk.createAnthropic.mock.calls).toStrictEqual([
      [{ apiKey: STUB_KEY }],
    ])
  })

  it('reads the key through the config, not process.env at call time', async () => {
    // Falsifies the test above rather than restating it. With the key threaded
    // from `getAiConfig()` the value is memoized by `once()` at first use, so a
    // LATER env change cannot reach the SDK. A build that read `process.env`
    // directly — or let the SDK read it — would pick up the second value here
    // and pass the previous test regardless. Env does not really change
    // mid-process; this is the probe that tells the two paths apart.
    const { inferenceModel } = await loadProvider({
      AI_ENABLED: 'true',
      ANTHROPIC_API_KEY: STUB_KEY,
    })

    inferenceModel()
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-a-different-later-value')
    inferenceModel()

    expect(anthropicSdk.createAnthropic.mock.calls).toStrictEqual([
      [{ apiKey: STUB_KEY }],
      [{ apiKey: STUB_KEY }],
    ])
  })

  it('builds the handle from DEFAULT_MODEL', async () => {
    // Catches a hardcoded id drifting from the constant — the failure a wrong
    // model otherwise shows as a 404 from Anthropic, in production, on the first
    // real call. The expectation reads the constant instead of restating it:
    // `DEFAULT_MODEL` is a product call meant to be edited, and a test spelling
    // the id out again would redden on every legitimate tier change.
    const { inferenceModel } = await loadProvider({
      AI_ENABLED: 'true',
      ANTHROPIC_API_KEY: STUB_KEY,
    })

    const handle = inferenceModel()

    expect(anthropicSdk.provider.mock.calls).toStrictEqual([[DEFAULT_MODEL]])
    // …and the handle the caller gets back is that model, not something the
    // function built and then discarded.
    expect(handle).toStrictEqual({ mockModelId: DEFAULT_MODEL })
  })
})
