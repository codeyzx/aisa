/**
 * What an acceptance spec needs besides a browser: a signed-in session, the
 * mock `aisa-api` (for the write buttons), and the shard's own Firestore
 * emulator (`scripts/_e2e-firestore.ts`, re-exported here) to read the numbers
 * a screen must match and to put the runtime into a state the seed does not
 * ship, such as STOP.
 */
import { type BrowserContext, type Page, test as base } from '@playwright/test'

import { emulatorDb, withRuntime } from '../../scripts/_e2e-firestore.ts'
import { signIn } from '../sign-in.ts'
import { type MockAisaApi, startMockAisaApi } from './mock-aisa-api.ts'

type Role = Parameters<typeof signIn>[1] & string
type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>
const sessions = new Map<Role, Cookies>()

/**
 * Sign in as `role` once per worker, then reuse that session cookie.
 *
 * Not a shortcut past the real sign-in: the first call per role IS the real
 * browser → Auth emulator → `POST /api/auth/session` flow (`e2e/sign-in.ts`),
 * and `auth.spec.ts` owns proving it. The reuse exists because that route
 * mints at most 10 session cookies per uid per minute (`SESSION_MINT_BUDGET`
 * in `app/api/auth/session/route.ts`): a shard running more than ten tests a
 * minute as the manager was refused with "Terlalu banyak percobaan" on the
 * login page — the budget working as designed, not a product fault.
 */
export async function signInAs(
  page: Page,
  role: Role = 'admin',
): Promise<void> {
  const cookies = sessions.get(role)
  if (cookies) {
    await page.context().addCookies(cookies)
    await page.goto('/dashboard')
    if (page.url().endsWith('/dashboard')) return
  }
  await signIn(page, role)
  sessions.set(role, await page.context().cookies())
}

export const test = base.extend<
  { aisaApi: MockAisaApi },
  { mockServer: MockAisaApi }
>({
  mockServer: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixture's dependencies from this destructuring
    async ({}, provide) => {
      const server = await startMockAisaApi()
      await provide(server)
      await server.close()
    },
    { scope: 'worker' },
  ],
  aisaApi: async ({ mockServer }, provide) => {
    mockServer.reset()
    await provide(mockServer)
    mockServer.reset()
  },
})

export { expect } from '@playwright/test'
export { emulatorDb, withRuntime }
