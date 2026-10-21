import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { PUBLIC_ENV_FIXTURE } from './scripts/public-env-fixture'

export default defineConfig({
  // Mirrors tsconfig's `"@/*": ["./*"]`. Vitest does not read tsconfig paths, so
  // without this ANY test importing a module that uses `@/` dies at collection
  // with "Cannot find package '@/...'" — and a file that fails to collect
  // contributes ZERO tests while the summary still reports the rest as passed.
  //
  // Miss this and it is a silent blind spot: a test that imports relatively
  // (`./session`) looks fine while the harness cannot reach any module behind
  // the alias.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // See test/stubs/server-only.ts. Without this, every module in the data
      // layer is unreachable from a test — `import 'server-only'` does not
      // resolve outside a react-server bundle, so the file dies at collection
      // and reports zero tests while the run stays green.
      'server-only': fileURLToPath(
        new URL('./test/stubs/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    // `node` is the DEFAULT; React hook/component tests opt into jsdom per file
    // with a `// @vitest-environment jsdom` docblock. Keeping node global means
    // the data-layer/pure suites pay nothing for a DOM they never touch.
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // LOAD-BEARING — do not "clean this up" to match the developer's zone.
    //
    // lib/format's whole job is to pin the zone so output depends on the data,
    // not on where the code ran. On a WIB machine that pin is UNFALSIFIABLE:
    // delete `timeZone` from the formatters and every assertion still passes,
    // because host == target. The test only bites from a zone that disagrees.
    //
    // UTC is the honest choice: it is what the container actually runs as, so
    // the suite reproduces the server, not the laptop. Same false-negative trap
    // as `env -i pnpm build` on a machine that has a .env.
    //
    // THE PUBLIC FIXTURE supplies any required client-facing config a test would
    // otherwise lack (none today — see scripts/public-env-fixture.ts). Spreading the
    // SHARED fixture (scripts/public-env-fixture.ts, also used by `build:ci`)
    // supplies explicit non-secret dummy values instead of switching the check
    // off, so the validator stays live everywhere: a renamed NEXT_PUBLIC_* still
    // fails, here and in CI, from ONE list rather than two copies.
    //
    // Why this is NOT machine-local: VITEST READS NO .env FILE. Vitest 4 ships
    // no dotenv and has no loadEnv/envDir — with a .env present, both
    // process.env.X and import.meta.env.X come back undefined. The gap stands
    // identically everywhere, so there is no machine where a .env would help.
    //
    // Server config is untouched by the fixture: it is read LAZILY through
    // `lib/env/server` and the capability configs, so a data-layer test still
    // sees the real FIRESTORE_EMULATOR_HOST / FIREBASE_PROJECT_ID from
    // process.env — which is exactly what routes adminDb() at the emulator with
    // no credential.
    //
    // The real build guard is untouched: `env -i pnpm build` (with .env moved
    // aside) and the Containerfile's real build args both still bite.
    // FIREBASE_PROJECT_ID is defaulted, NOT fixed: `firebase emulators:exec`
    // exports FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT but never
    // FIREBASE_PROJECT_ID, so the integration suite could not name the project it
    // was already pointed at, and every test that touched adminDb() died at
    // `getFirebaseProjectId()`. `demo-aisa` is the id `--project` passes on both
    // emulator scripts.
    //
    // `??` and not a plain literal: a real FIREBASE_PROJECT_ID in the environment
    // must WIN. Overriding it would silently redirect a run to the emulator
    // project while the operator believed otherwise — the same reason
    // `build-ci.ts` applies its fixture with `??=`.
    env: {
      TZ: 'UTC',
      ...PUBLIC_ENV_FIXTURE,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'demo-aisa',
    },
    // Vitest 4's default exclude is only node_modules + .git, so anything else
    // that holds .ts files has to be listed or it gets collected as tests.
    //
    // `.claude/worktrees` is NOT hypothetical: git worktrees live INSIDE the
    // repo here, so every test file exists twice while one is open and the suite
    // silently runs each of them twice (a green "50 passed" that is really 25).
    // Double-counting hides nothing today, but a worktree mid-edit would report
    // failures against code that is not on this branch.
    exclude: ['**/node_modules/**', '.next/**', '.claude/worktrees/**'],
  },
})
