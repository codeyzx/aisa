/**
 * The auth facts that must never break: an anonymous visitor cannot see a
 * protected page, a seeded account signs in for real (browser → Auth emulator →
 * session cookie), a wrong password is refused, and signing out ends the session.
 *
 * The guard chain is two layers and only the second is a boundary — `proxy.ts`
 * bounces a request with NO session cookie (optimistic, it never verifies), and
 * the `(app)` layout resolves and VERIFIES the session. These tests drive the
 * outcome, not the layer, which is why the anonymous case asserts the URL a
 * visitor lands on rather than a status code.
 */
import { expect, test } from '@playwright/test'

import { seededEmail, signIn } from './sign-in.ts'

test('an anonymous visit to a protected page lands on /login, carrying ?next', async ({
  page,
}) => {
  await page.goto('/hari-ini')

  // `?next` is what makes the bounce recoverable: sign in and you arrive where
  // you were going, instead of on a generic dashboard having lost your link.
  await expect(page).toHaveURL(/\/login\?next=%2Fhari-ini$/)
  await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible()
})

test('the manager can sign in, reach Hari ini, and sign out', async ({
  page,
}) => {
  await signIn(page)

  await expect(
    page.getByRole('heading', { level: 1, name: 'Hari ini' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Menu pengguna' }).click()
  await page.getByRole('menuitem', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/login/)

  // The cookie is gone, not merely the page: a protected URL bounces again.
  await page.goto('/hari-ini')
  await expect(page).toHaveURL(/\/login\?next=%2Fhari-ini$/)
})

test('a wrong password is refused and says so', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(seededEmail('admin'))
  await page.getByLabel('Kata sandi').fill('bukan-kata-sandinya')
  await page.getByRole('button', { name: 'Masuk' }).click()

  await expect(page.getByText('Email atau kata sandi salah')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
