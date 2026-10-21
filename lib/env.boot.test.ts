import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The boot contract behind `instrumentation-node.ts`: `collectConfigFailures()`
 * must validate each SHIPPED capability INDEPENDENTLY, so one boot names every
 * misconfigured group instead of only the first. This is the regression guard for
 * the trap where a missing Firebase Admin credential threw before the S3 / AI /
 * impersonation config was ever read, collapsing the aggregation to one failure.
 *
 * It also pins the OTHER half of the manifest's honesty: a capability that is
 * turned OFF must never be asked for credentials. "Off" that still demands an API
 * key is not off.
 *
 * Each test resets the module registry and re-imports the registry fresh, because
 * every config function is memoized with `once()` per module instance.
 */

const SERVER_KEYS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'AI_ENABLED',
  'ANTHROPIC_API_KEY',
  'IMPERSONATION_SECRET',
]

/** Exactly what `instrumentation-node.ts` runs at boot, on a fresh module graph. */
async function collectBootFailures(): Promise<string[]> {
  const { collectConfigFailures } = await import('@/lib/env/registry')
  return collectConfigFailures()
}

describe('server env boot aggregation', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of SERVER_KEYS) vi.stubEnv(key, '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('names every missing shipped group in one boot', async () => {
    // AI is opt-in, so it only counts as "shipped" once it is switched on.
    vi.stubEnv('AI_ENABLED', 'true')
    const blob = (await collectBootFailures()).join('\n')
    expect(blob).toContain('Firebase Admin')
    expect(blob).toContain('S3')
    expect(blob).toContain('AI')
    expect(blob).toContain('impersonation')
  })

  it('surfaces a missing capability even when Firebase Admin is valid', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'demo')
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'x@example.com')
    vi.stubEnv('FIREBASE_PRIVATE_KEY', 'key')
    vi.stubEnv('AI_ENABLED', 'true')
    // s3 / ai / impersonation still unset.
    const blob = (await collectBootFailures()).join('\n')
    expect(blob).not.toContain('Firebase Admin')
    expect(blob).toContain('S3')
    expect(blob).toContain('AI')
    expect(blob).toContain('impersonation')
  })

  it('does not ask a DISABLED capability for credentials', async () => {
    // AI_ENABLED unset and no ANTHROPIC_API_KEY: the capability ships in the tree
    // but is off, so boot must not demand its key. A fresh clone runs with no
    // Anthropic account.
    const offBlob = (await collectBootFailures()).join('\n')
    expect(offBlob).not.toContain('ANTHROPIC_API_KEY')

    // Same missing key, but intent stated: now it IS a misconfiguration, named.
    vi.resetModules()
    vi.stubEnv('AI_ENABLED', 'true')
    const onBlob = (await collectBootFailures()).join('\n')
    expect(onBlob).toContain('ANTHROPIC_API_KEY')
  })
})
