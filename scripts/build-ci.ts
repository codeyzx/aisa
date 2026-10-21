/**
 * `pnpm build:ci` — a secret-less `next build` that still validates.
 *
 * CI (and any "does it compile" build) has no real Firebase project, but the
 * `NEXT_PUBLIC_*` values are INLINED into the client bundle and cannot be fixed
 * afterwards, so the build must not simply skip checking them. This applies the
 * shared public fixture and then runs the real build: the validator in
 * `next.config.ts` runs for real, and a forgotten or renamed public var still
 * fails the build. The predecessor set a bypass flag instead, which made a green
 * build mean nothing.
 *
 * The fixture is applied WITHOUT overriding what is already set, so a caller that
 * exports real public values (the Containerfile passes real build args) keeps
 * them — the fixture fills gaps, it does not mask a caller's intent.
 *
 * NOT a substitute for `pnpm build` with real env: this proves the bundle
 * compiles and the public schema is satisfied, nothing about the server secrets,
 * which are checked at BOOT (instrumentation.ts) because they are read per
 * request.
 */
import { spawnSync } from 'node:child_process'

// Explicit `.ts`, as every script here does: `node` runs these directly and its
// native TS support does no extensionless resolution.
import { PUBLIC_ENV_FIXTURE } from './public-env-fixture.ts'

for (const [key, value] of Object.entries(PUBLIC_ENV_FIXTURE)) {
  process.env[key] ??= value
}

const result = spawnSync('next', ['build'], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
})

if (result.error) {
  console.error('[build:ci] failed to start `next build`:', result.error)
  process.exit(1)
}

// A signal-killed child has a null status; report it as a failure rather than
// letting `process.exit(null)` become a silent 0.
process.exit(result.status ?? 1)
