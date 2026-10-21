/**
 * Sign a browser in the way a person does, because there is no shortcut worth
 * taking here.
 *
 * The password NEVER reaches this app's origin: the login form talks to Firebase
 * (the Auth emulator locally) from the BROWSER, then posts the resulting ID token
 * to `POST /api/auth/session`, which mints the httpOnly `session` cookie. A test
 * that forged a cookie would prove nothing about the half of sign-in that holds
 * the credential — and would be refused by the layout guard anyway, which
 * verifies the cookie rather than trusting it.
 *
 * The accounts and the password are IMPORTED from the module that creates them
 * (`scripts/_seed-users.ts`), so a change to the seed can never leave this suite
 * signing in as somebody who does not exist.
 */
import { expect, type Page } from '@playwright/test'

import { SEED_USERS, SEEDED_PASSWORD } from '../scripts/_seed-users.ts'

/** The seeded account for a role — the same list `pnpm seed` writes. */
export function seededEmail(role: 'admin' | 'user'): string {
  const user = SEED_USERS.find((candidate) => candidate.role === role)
  if (!user) throw new Error(`No seeded account has the role "${role}"`)
  return user.email
}

/** Sign in as the seeded account for `role` and wait for the Dashboard. */
export async function signIn(
  page: Page,
  role: 'admin' | 'user' = 'admin',
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(seededEmail(role))
  await page.getByLabel('Kata sandi').fill(SEEDED_PASSWORD)
  await page.getByRole('button', { name: 'Masuk' }).click()
  // Generous on purpose: against a cold `pnpm dev` the FIRST navigation to
  // `/dashboard` compiles the route on demand, and a sign-in helper that failed
  // on that would report "wrong password" for what is actually a compile.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 })
}
