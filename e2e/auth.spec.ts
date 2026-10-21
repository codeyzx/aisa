/**
 * The three auth facts a fork must never break: an anonymous visitor cannot see a
 * protected page, a seeded account can sign in for real, and a capability the
 * account does not hold is refused.
 *
 * The guard chain is two layers and only the second is a boundary — `proxy.ts`
 * bounces a request with NO session cookie (optimistic, it never verifies), and
 * the `(app)` layout resolves and VERIFIES the session. These tests drive the
 * outcome, not the layer, which is why the anonymous case asserts the URL a
 * visitor lands on rather than a status code.
 */
import { expect, test } from '@playwright/test'

import { signIn } from './sign-in.ts'

test('an anonymous visit to a protected page lands on /login, carrying ?next', async ({
  page,
}) => {
  await page.goto('/assets')

  // `?next` is what makes the bounce recoverable: sign in and you arrive where
  // you were going, instead of on a generic dashboard having lost your link.
  await expect(page).toHaveURL(/\/login\?next=%2Fassets$/)
  await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible()
})

test('a seeded admin can sign in and reach the dashboard', async ({ page }) => {
  await signIn(page, 'admin')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('a non-admin is refused the admin console', async ({ page }) => {
  await signIn(page, 'user')

  await page.goto('/admin')

  // Refused, NOT 404 and not a blank shell: the capability check maps a denial to
  // /403, which says what happened and offers the way back. The seeded `user`
  // holds only asset:read and storage:read (lib/auth/rbac.ts), so admin:access is
  // genuinely absent rather than mocked away.
  await expect(page).toHaveURL(/\/403$/)
  await expect(page.getByText('403 — Akses ditolak')).toBeVisible()
})
