import { expect, it, vi } from 'vitest'

/**
 * The falsifiable half of `vitest.config.ts`'s public env fixture.
 *
 * That fixture is the only thing letting ANY test import the data layer:
 * client config validates for real (there is no bypass flag any more), every
 * repo reaches it through `lib/firebase/admin`, and with the fixture removed the
 * import throws `Invalid client Firebase environment`. The fixture reads as
 * cruft — six dummy literals in a test config. This test is what turns an edit
 * that removes it red instead of silent.
 *
 * It needs NO emulator: `adminDb()` is called per-query, not at import, so
 * resolving the module connects to nothing. That is deliberate — this guard has
 * to bite in a plain `pnpm test` with no infrastructure, which is exactly the run
 * where someone would be tempted to "clean up" the config.
 *
 * The import is DYNAMIC rather than top-level on purpose. A top-level `import`
 * that throws kills the file at COLLECTION — the failure mode vitest.config.ts
 * documents, where a file contributes zero tests and the summary still reads
 * green. Inside a test body the same throw is a red test with the real message
 * attached.
 */
it('a test can import the data layer (the public env fixture unlocks it)', async () => {
  const repo = await import('@/features/asset/asset.repo')

  // Assert the module is LIVE, not merely resolvable: a stub that exported an
  // empty object would satisfy "it imported" and prove nothing.
  expect(typeof repo.listAssets).toBe('function')
  expect(typeof repo.createAsset).toBe('function')
  expect(typeof repo.countAssets).toBe('function')
})

/**
 * The wall's other side, asserted so the reason above cannot rot into folklore.
 * `lib/data/batch.ts`'s header claims a test "cannot import a repo at all" — this
 * pins the actual, narrower truth: it cannot without the public values, because
 * client validation REFUSES rather than degrading to `undefined`.
 */
it('client env validation still refuses when a required NEXT_PUBLIC_* is missing', async () => {
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', '')
  // Without this the memoized (already-validated) config answers and the
  // assertion below passes for the wrong reason — `once()` caches per module
  // instance, so nothing would be re-parsed.
  vi.resetModules()
  try {
    const { validateClientEnv } = await import('@/lib/env/client')
    expect(() => validateClientEnv()).toThrowError(
      /Invalid client Firebase environment/,
    )
  } finally {
    vi.unstubAllEnvs()
    // Hand the next file back a clean graph — this test poisoned the registry
    // with a config module evaluated against a blanked var.
    vi.resetModules()
  }
})
