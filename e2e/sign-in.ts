/**
 * Sign a browser in the way a person does, because there is no shortcut worth
 * taking here.
 *
 * The password NEVER reaches this app's origin: the login form talks to Firebase
 * (the Auth emulator locally) from the BROWSER, then posts the resulting ID token
 * to `POST /api/auth/session`, which mints the httpOnly `session` cookie. So a
 * test that forged a cookie would prove nothing about the half of sign-in that
 * actually holds the credential — and would be refused by the layout guard
 * anyway, which verifies the cookie rather than trusting it.
 *
 * The accounts and the password are IMPORTED from the module that creates them
 * (`scripts/_seed-users.ts`) rather than typed here, so a change to the seed can
 * never leave this suite signing in as somebody who does not exist.
 */
import { expect, type Page } from '@playwright/test'

import { SEED_USERS, SEEDED_PASSWORD } from '../scripts/_seed-users.ts'

/** The seeded account for a role — the same list `pnpm seed` writes. */
export function seededEmail(role: 'admin' | 'user'): string {
  const user = SEED_USERS.find((candidate) => candidate.role === role)
  // Loud rather than `?? 'admin@aixel.test'`: a missing role means the seed
  // changed, and a hardcoded fallback would turn that into a confusing sign-in
  // failure ten lines later instead of naming the cause here.
  if (!user) throw new Error(`No seeded account has the role "${role}"`)
  return user.email
}

/** Sign in as the seeded account for `role` and wait for the dashboard. */
export async function signIn(
  page: Page,
  role: 'admin' | 'user',
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(seededEmail(role))
  await page.getByLabel('Kata sandi').fill(SEEDED_PASSWORD)
  await page.getByRole('button', { name: 'Masuk' }).click()
  // The redirect the form performs after the session cookie is set. Waiting for
  // it here means every caller starts from a page that is genuinely
  // authenticated, rather than from a click that may still be in flight.
  //
  // The generous timeout is not flake-padding, and it costs nothing on the fast
  // path — the assertion resolves as soon as the URL changes. It exists because
  // `e2e/target.ts` supports driving an app you started yourself, and against a
  // cold `pnpm dev` the FIRST navigation to `/dashboard` compiles the route on
  // demand. Driven on 2026-07-22 from a fresh clone: this assertion failed at the
  // 5s default on the first spec of the run, then passed in 15s once the route
  // was warm. A sign-in helper that fails on the first test of a cold run reports
  // "wrong password" for what is actually a compile.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 })
}
