/**
 * `/api/health` — the one route that must answer before anything else can.
 *
 * Driven with the API request context rather than a page: this is the route an
 * orchestrator's probe calls (the image's own HEALTHCHECK calls exactly this),
 * and it has no UI to render. It never touches Firestore on purpose, so a green
 * check here means "the server is up", never "the database is reachable".
 */
import { expect, test } from '@playwright/test'

test('GET /api/health answers the liveness envelope, uncached', async ({
  request,
}) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  // Every API answer in this app is the same envelope shape, correlation id
  // included — see docs/reference/contracts/http-api.md. The id itself is per request, so it
  // is asserted as PRESENT and never pinned to a value.
  expect(response.headers()['x-correlation-id']).toBeTruthy()
  expect(response.headers()['cache-control']).toBe('no-store')

  const body = await response.json()
  expect(body.ok).toBe(true)
  expect(body.data.status).toBe('ok')
  // `sha` and `builtAt` are the build stamp. They are `unknown` on a `pnpm dev`
  // or an unstamped build, which is the honest answer rather than a version-shaped
  // placeholder — so this asserts only that the fields are reported at all.
  // Proving a STAMPED image reports its real stamp is `pnpm smoke:image`'s job.
  expect(typeof body.data.sha).toBe('string')
  expect(typeof body.data.builtAt).toBe('string')
})
