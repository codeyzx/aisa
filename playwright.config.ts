/**
 * Playwright config for the E2E suite in `e2e/`.
 *
 * SCOPE, deliberately small: health, sign-in, the anonymous redirect, the admin
 * guard, the asset list/create/edit round trip, and ONE no-JavaScript flow. These
 * are the paths where a beginner forking this starter would not notice a break
 * until a user did. Everything else is covered cheaper by the unit and emulator
 * suites, and a big browser suite that nobody runs is worse than a small one that
 * everybody does.
 *
 * NO page objects, no fixture library, no visual regression. Each spec reads
 * top-to-bottom as the thing a person would do.
 *
 * WHAT IT NEEDS RUNNING (all three, or every test fails at sign-in):
 *   1. `pnpm emulators` — the browser signs in against the Auth emulator DIRECTLY
 *      (lib/firebase/client-auth.ts), and the server verifies the session against
 *      it too.
 *   2. `pnpm seed` — the accounts the tests sign in as (scripts/_seed-users.ts).
 *   3. an app on `E2E_BASE_URL`. This config starts NOTHING — see `e2e/target.ts`
 *      for why, and use `pnpm test:e2e:ci` to get all three at once.
 *
 * WHY chromium ONLY: this is a starter's smoke suite, not a compatibility matrix.
 * A fork that ships to a browser it has not driven should add the project; three
 * engines by default would triple every CI minute to re-prove the same Next.js
 * output.
 */
import { defineConfig, devices } from '@playwright/test'

import { BASE_URL } from './e2e/target.ts'

export default defineConfig({
  testDir: './e2e',
  // ONE worker, and this is not timidity: the specs create and edit assets in a
  // SHARED Firestore emulator, so parallel workers would race over the same
  // collection and the failure would look like a product bug rather than a test
  // one. Parallelism is worth buying back only with per-worker data isolation,
  // which is a bigger machine than this suite justifies.
  workers: 1,
  fullyParallel: false,
  // `.only` left in a spec passes locally and silently narrows CI to one test.
  forbidOnly: Boolean(process.env.CI),
  // No retries locally: a test that only passes on the second attempt is a bug
  // report, and hiding it behind a retry is how a suite stops meaning anything.
  // One retry in CI covers genuine infrastructure flake (a cold container, a slow
  // emulator) without hiding a two-out-of-two failure.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    // Kept only for a FAILING test — enough to see what the page looked like
    // without writing a video for every green run.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // NO `webServer`, deliberately — this config starts nothing, ever.
  //
  // The obvious arrangement (`webServer` running `next start`) was removed because
  // it could not tell the truth about what it was driving:
  //
  //   - `next start` does NOT serve the shipped artifact. The image runs
  //     `node server.js` out of `.next/standalone`; Next prints, on this repo's own
  //     build: `⚠ "next start" does not work with "output: standalone"
  //     configuration.` A suite driven that way stays green while the image serves
  //     an unstyled, JS-less page — the exact failure `scripts/smoke-image.ts`
  //     exists to catch.
  //   - `reuseExistingServer` would adopt whatever was already on the port. A
  //     developer with `pnpm dev` running would have driven a DEVELOPMENT build
  //     and been told it passed.
  //   - even on the intended path it served whatever stale `.next` happened to be
  //     on disk, with nothing tying the run to the working tree.
  //
  // `pnpm test:e2e:ci` (scripts/e2e-container.ts) owns the lifecycle instead: it
  // builds the image, runs THAT, and points this config at it.
})
