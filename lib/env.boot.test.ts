import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The boot contract behind `instrumentation-node.ts`: `collectConfigFailures()`
 * must validate each SHIPPED capability INDEPENDENTLY, so one boot names every
 * misconfigured group instead of only the first.
 *
 * It also pins the OTHER half of the manifest's honesty: a capability whose
 * `enabled()` is false must never be asked for credentials — an emulator target
 * needs no service account.
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
  'AISA_API_URL',
  'AISA_API_KEY',
  'FIREBASE_AUTH_SERVICE_ACCOUNT',
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
    const failures = await collectBootFailures()
    const blob = failures.join('\n')
    expect(blob).toContain('Firebase project')
    expect(blob).toContain('Firebase Admin')
    expect(blob).toContain('AISA_API_URL')
    expect(failures.length).toBeGreaterThanOrEqual(3)
  })

  it('does not ask an emulator target for the service-account credential', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'demo')
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080')
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
    vi.stubEnv('AISA_API_URL', 'http://127.0.0.1:8787')
    vi.stubEnv('AISA_API_KEY', 'test-key')
    expect(await collectBootFailures()).toEqual([])
  })

  it('accepts a real project with no key pair (Application Default Credentials)', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'real-project')
    vi.stubEnv('AISA_API_URL', 'https://aisa-api.example')
    vi.stubEnv('AISA_API_KEY', 'test-key')
    expect(await collectBootFailures()).toEqual([])
  })

  it('refuses a half-set service-account key pair', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'real-project')
    vi.stubEnv(
      'FIREBASE_CLIENT_EMAIL',
      'sa@real-project.iam.gserviceaccount.com',
    )
    vi.stubEnv('AISA_API_URL', 'https://aisa-api.example')
    vi.stubEnv('AISA_API_KEY', 'test-key')
    const blob = (await collectBootFailures()).join('\n')
    expect(blob).toContain('must be set together')
  })

  it('refuses an Auth impersonation target that is not an email', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'real-project')
    vi.stubEnv('FIREBASE_AUTH_SERVICE_ACCOUNT', 'not-an-account')
    vi.stubEnv('AISA_API_URL', 'https://aisa-api.example')
    vi.stubEnv('AISA_API_KEY', 'test-key')
    const blob = (await collectBootFailures()).join('\n')
    expect(blob).toContain('FIREBASE_AUTH_SERVICE_ACCOUNT')
  })
})
