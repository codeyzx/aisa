import { expect, it } from 'vitest'

/**
 * A test can import the server data layer with no emulator and no credential:
 * `adminDb()` is called per query, not at import, so resolving a repo connects
 * to nothing. This pins that, so a module that starts doing I/O at import time
 * turns this red instead of silently breaking every unit test that imports it.
 *
 * The import is DYNAMIC on purpose: a top-level import that throws kills the
 * file at collection, where it contributes zero tests and the summary still
 * reads green. Inside a test body the same throw is a red test.
 */
it('a test can import the data layer', async () => {
  const repo = await import('@/features/aisa/aisa.repo')
  expect(typeof repo.getProposal).toBe('function')
  expect(typeof repo.listRecentProposals).toBe('function')
})

it('the build-time client env gate passes with no public env', async () => {
  const { validateClientEnv } = await import('@/lib/env/client')
  expect(() => validateClientEnv()).not.toThrow()
})
