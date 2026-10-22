/**
 * The onboarding tour: it starts by itself on a person's first visit, walks
 * across pages, resumes after a reload, and can be replayed from the account
 * menu. The upload step is skipped here (its interactive path needs a real
 * aisa-api to finish an assessment); a read-only seat never reaches it at all.
 *
 * Playwright's browser reports `navigator.webdriver`, which the tour reads as
 * "automated" and does not autostart for (so every other spec is undisturbed).
 * These tests are the person, so they clear that flag before any page runs.
 */
import { expect, test, type Page } from '@playwright/test'

import { signIn } from './sign-in.ts'

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => false,
    })
  })
})

const popover = (page: Page) => page.locator('.driver-popover.aisa-tour')
const title = (page: Page) => page.locator('#driver-popover-title')
const next = (page: Page) => page.locator('.driver-popover-next-btn')

/** Press Lanjut until the popover shows `heading`, failing on `forbidden`. */
async function advanceTo(page: Page, heading: string, forbidden?: string) {
  for (let i = 0; i < 12; i += 1) {
    await expect(popover(page)).toBeVisible({ timeout: 30_000 })
    const current = (await title(page).textContent())?.trim()
    if (current === heading) return
    if (forbidden) expect(current).not.toBe(forbidden)
    await next(page).click()
    // The next step replaces this popover; wait until its title moved on.
    await expect(title(page)).not.toHaveText(current ?? '', {
      timeout: 30_000,
    })
  }
  throw new Error(`The tour never reached "${heading}"`)
}

test('autostarts once, skips the upload, resumes across pages, and replays', async ({
  page,
}) => {
  await signIn(page, 'admin')
  await expect(title(page)).toHaveText('Selamat datang di AISA', {
    timeout: 30_000,
  })

  await advanceTo(page, 'Coba unggah proposal')
  await expect(next(page)).toHaveText('Lewati')
  await next(page).click()

  await expect(page).toHaveURL(/\/proposal$/)
  await expect(title(page)).toHaveText('Daftar proposal', { timeout: 30_000 })
  await next(page).click()

  await expect(page).toHaveURL(/\/proposal\/[^/]+$/, { timeout: 60_000 })
  await expect(title(page)).toHaveText('Skor kualitas', { timeout: 30_000 })

  // The position survives a reload of the page it is on.
  await page.reload()
  await expect(title(page)).toHaveText('Skor kualitas', { timeout: 30_000 })

  await page.keyboard.press('Escape')
  await expect(popover(page)).toHaveCount(0)

  // Seen once: it does not start by itself again.
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.waitForTimeout(2000)
  await expect(popover(page)).toHaveCount(0)

  await page.getByRole('button', { name: 'Menu pengguna' }).click()
  await page.getByRole('menuitem', { name: /Panduan/ }).click()
  await expect(title(page)).toHaveText('Selamat datang di AISA')
})

test('a read-only seat is never asked to upload', async ({ page }) => {
  await signIn(page, 'user')
  await advanceTo(page, 'Daftar proposal', 'Coba unggah proposal')
  await expect(page).toHaveURL(/\/proposal$/)
})
