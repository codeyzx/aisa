import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `AI_ENABLED` is a STRICT ENUM, not a truthiness test, and that is the only
 * reason a misconfiguration is visible at all: under "anything non-empty is on",
 * `AI_ENABLED=yes` and `AI_ENABLED=ya` and a typo'd `AI_ENABLE=true` all read as
 * SOMETHING, and nothing can tell "off on purpose" from "broken". The enum turns
 * every one of those into a named refusal at the boundary.
 *
 * So the mutation these tests exist to catch is the tempting simplification —
 * swapping the enum for `value === 'true'`, `Boolean(value)`, or a `?? false`.
 * Each of those keeps the true/false cases below green and silently drops the
 * rejection, which is the whole guarantee.
 *
 * Env stubbing rather than a mocked schema: the schema IS the thing under test,
 * and `lib/env.boot.test.ts` already establishes this idiom for config groups.
 */

/**
 * A fresh module graph per case. `isAiEnabled()` and `getAiConfig()` are wrapped
 * in `once()`, so a graph shared between cases would answer every one of them
 * with the first case's env.
 */
async function loadConfig(aiEnabled: string | undefined) {
  vi.resetModules()
  vi.stubEnv('AI_ENABLED', aiEnabled)
  return import('./config')
}

describe('AI_ENABLED', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects a plausible-but-unlisted value instead of reading it as off', async () => {
    // `yes` is the value a human actually types. Silently treating it as off is
    // the worst outcome available: the operator believes AI is on, the boot
    // check never asks for a key, and the feature is simply absent with no
    // failure anywhere. The message must name the accepted set, because the
    // reader's next action is to pick one.
    const { isAiEnabled } = await loadConfig('yes')

    expect(() => isAiEnabled()).toThrow(/AI_ENABLED must be one of/)
  })

  for (const value of ['true', '1']) {
    it(`reads ${value} as on`, async () => {
      const { isAiEnabled } = await loadConfig(value)

      expect(isAiEnabled()).toBe(true)
    })
  }

  // '' is listed separately from the others in the schema — it is preprocessed
  // to `undefined` so an env file with a bare `AI_ENABLED=` means "unset", not
  // "invalid". Drop that preprocess step and this case throws instead.
  for (const [label, value] of [
    ['false', 'false'],
    ['0', '0'],
    ['empty', ''],
    ['unset', undefined],
  ] as const) {
    it(`reads ${label} as off`, async () => {
      const { isAiEnabled } = await loadConfig(value)

      expect(isAiEnabled()).toBe(false)
    })
  }
})

describe('getAiConfig', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('throws while AI is off, blaming the caller and not the env', async () => {
    // Reaching the credential with AI off is a PROGRAMMING error — a caller
    // skipped `isAiEnabled()`. Catches both the deletion of that guard (which
    // would instead report a missing ANTHROPIC_API_KEY and send the reader to
    // fix env that is correctly empty) and a reworded message that stops
    // pointing at the gate.
    const { getAiConfig } = await loadConfig(undefined)

    expect(() => getAiConfig()).toThrow(/gate the call on isAiEnabled/)
    expect(() => getAiConfig()).not.toThrow(/ANTHROPIC_API_KEY/)
  })
})
