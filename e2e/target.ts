/**
 * WHERE the E2E suite points, and the fence that keeps it pointed somewhere safe.
 *
 * One module, read by `playwright.config.ts` (for `use.baseURL`) and by any spec
 * that builds a browser context by hand. A second copy of the origin would be a
 * literal to keep in sync, and the copy that drifted would be the one pointing
 * the suite at nothing.
 *
 * THIS SUITE CAN BE A WRITE PATH, and that is the whole reason for the fence
 * below. It signs in with the dashboard password, and a spec that clicks a
 * response button changes real data. Pointed at a real environment it would
 * write real documents, permanently, with no cleanup.
 *
 * The repo already models this: `scripts/_safety.ts` is the safety manifest, and
 * `requireEmulatorTarget` is the gate that makes a destructive script provably
 * unable to reach a real database. `structure:check`'s `cli-safety` enforces it
 * across `scripts/**`. This directory is a database-mutating surface that reaches
 * the data through the app's HTTP layer instead of the Admin SDK, so that check
 * cannot see it — which makes it MORE important that the fence here is real code
 * and not a comment. A hand-rolled guard is invisible to a structure check; being
 * invisible is not the same as being absent.
 *
 * HOW TO RUN IT:
 *
 *   pnpm test:e2e:ci
 *     The full local equivalent of CI: builds the production IMAGE, starts and
 *     seeds the emulators, runs the suite split over shards — one container
 *     and one Firestore emulator each (`scripts/e2e-fast.ts`) — and tears down.
 *
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 *     Drive an app you started yourself (`pnpm dev`, or a container). Playwright
 *     starts nothing — whoever named the target owns its lifecycle.
 *
 * There is deliberately NO mode where Playwright starts a server for you. The
 * previous arrangement used Playwright's `webServer` with `reuseExistingServer`,
 * which had two silent failure modes: it would adopt a `pnpm dev` server that
 * happened to be on the port (driving a DEVELOPMENT build while reporting green),
 * and on the intended path it served whatever stale `.next` happened to exist. A
 * suite that can quietly test the wrong thing is worse than one that asks you to
 * name your target.
 */

/**
 * Host port `pnpm test:e2e:container` runs the container on. `pnpm test:e2e:ci`
 * sets it per shard (3201 upward).
 */
export const E2E_PORT = process.env.E2E_PORT ?? '3100'

/**
 * Hostnames that can only mean "this machine". `localhost` is included as a NAME
 * rather than resolved: resolving it would let a doctored `/etc/hosts` widen the
 * fence, and the point is to be conservative about what counts as local.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function resolveBaseUrl(): string {
  const provided = process.env.E2E_BASE_URL
  if (provided === undefined) {
    throw new Error(
      'E2E_BASE_URL is not set, so there is no target to drive.\n\n' +
        'Run the full local equivalent of CI:\n' +
        '  pnpm test:e2e:ci\n\n' +
        'Or name a target you started yourself:\n' +
        '  E2E_BASE_URL=http://localhost:3000 pnpm test:e2e',
    )
  }

  let host: string
  try {
    host = new URL(provided).hostname
  } catch {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${provided}`)
  }

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run: E2E_BASE_URL points at ${host}, which is not loopback.\n\n` +
        'This suite signs in with the dashboard password and can change data.\n' +
        'Against a real environment that is a permanent write with no\n' +
        'cleanup, performed by a test run nobody was watching.\n\n' +
        'If you genuinely mean to drive a remote deployment, do it with a suite\n' +
        'that owns its own throwaway data — not this one.',
    )
  }

  return provided.replace(/\/$/, '')
}

/**
 * The origin every test drives.
 *
 * `localhost` is the spelling to prefer, and it is load-bearing rather than taste.
 * `POST /api/auth/session` — the request that mints the session cookie — refuses
 * a cross-origin `Origin` header (login CSRF, see the route's own comment), and it
 * compares that header against `new URL(request.url).origin`. Driven on
 * 2026-07-22: a server started with the default hostname accepts
 * `http://localhost:3100` and REFUSES `http://127.0.0.1:3100` even though both
 * reach it. Drive the wrong spelling and every test dies at sign-in with a 403
 * that looks like a wrong password.
 */
export const BASE_URL = resolveBaseUrl()
