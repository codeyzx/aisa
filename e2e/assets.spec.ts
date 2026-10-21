/**
 * The reference feature end to end: list → create → edit, as a person does it.
 *
 * ONE test rather than three, on purpose. "Create" and "edit" are not independent
 * facts — you cannot edit what was not created — and splitting them would either
 * duplicate the create or make the second test depend on the first's leftovers,
 * which is the ordering trap that makes a suite fail differently on every run.
 *
 * The asset it creates is named with a per-run token and LEFT BEHIND: the
 * emulator is disposable (`pnpm db:reset -- --apply`), and a cleanup step would
 * add a delete path this test never claims to cover — plus the token is what makes
 * the row findable through the list's own search rather than by guessing at
 * pagination.
 */
import { expect, test } from '@playwright/test'

import { signIn } from './sign-in.ts'

test('an admin can list, create and edit an asset', async ({ page }) => {
  // Alphanumeric and 15 characters or fewer, which is not cosmetic: the list
  // searches by stored word PREFIXES (lib/data/search-prefix.ts) with a 15-char
  // cap, and punctuation is a word separator. A token outside those rules would
  // simply not be findable.
  const token = `e2e${Date.now().toString(36)}`
  const name = `${token} Mesin uji`

  await signIn(page, 'admin')

  await page.goto('/assets')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Aset' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Aset baru' }).click()
  await expect(page).toHaveURL(/\/assets\/new/)

  const nameField = page.getByLabel('Nama', { exact: true })
  await nameField.fill(name)
  // Read the field back before submitting, and not as ceremony: this input is a
  // CONTROLLED React field, so a value typed into the server-rendered HTML before
  // hydration finishes is wiped when React takes over — and the symptom of that
  // race is a submit that silently posts an empty name and fails validation three
  // steps later, on the list. Asserting here fails at the cause instead.
  await expect(nameField).toHaveValue(name)
  await page.getByRole('button', { name: 'Buat aset' }).click()

  // The server action redirects back to the list it was opened from. Compared as
  // a PATHNAME rather than a URL pattern: the form's own URL carries
  // `?returnTo=/assets`, so a loose `/assets$/` regex matches the page we are
  // trying to leave and the test would pass without ever submitting.
  await expect.poll(() => new URL(page.url()).pathname).toBe('/assets')

  // Found through the app's own search rather than by scrolling the list: the
  // seed already holds 30 assets, so a new one need not be on the first page.
  await page.goto(`/assets?q=${token}&status=all`)
  await expect(page.getByText(name)).toBeVisible()

  // The row's edit control is named for the row it belongs to — the aria-label is
  // wider than the visible word precisely so it can be identified this way.
  await page.getByLabel(`Ubah ${name}`).click()
  await expect(page).toHaveURL(/\/assets\/[^/]+\/edit/)

  const renamed = `${name} diubah`
  const editField = page.getByLabel('Nama', { exact: true })
  await editField.fill(renamed)
  await expect(editField).toHaveValue(renamed)
  await page.getByRole('button', { name: 'Simpan perubahan' }).click()

  // Back on the SAME filtered list the edit was opened from (`?returnTo`), now
  // showing the new name — which is the only proof the write actually landed.
  await expect.poll(() => new URL(page.url()).pathname).toBe('/assets')
  await expect(page.getByText(renamed)).toBeVisible()
})
