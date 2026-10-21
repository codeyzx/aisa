/**
 * The rules page and the "Hapus data" dialog against the seeded emulator, read
 * side only: the E2E image has no `aisa-api` behind it, so nothing here saves
 * rules or confirms a deletion. What it proves is what each seat is SHOWN — the
 * retired Orchestrator model is gone, the Asisten model cannot be edited, the
 * retention rule is visible to everyone, and the delete dialog will not submit
 * without a reason.
 */
import { expect, test } from '@playwright/test'

import { signIn } from './sign-in.ts'

test('the manager edits retention, sees Asisten read-only and no Orchestrator', async ({
  page,
}) => {
  await signIn(page)
  await page.goto('/pengaturan')

  await expect(page.getByLabel('Retensi (hari)')).toHaveValue('90')
  await expect(
    page.getByText(
      'Proposal yang diarsipkan dihapus otomatis setelah 90 hari (setiap hari 02.00 WIB).',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Asisten')).toBeDisabled()
  await expect(
    page.getByText('berlaku setelah Asisten di-deploy ulang'),
  ).toBeVisible()
  await expect(page.getByText('Orchestrator')).toHaveCount(0)
})

test('a read-only seat sees every rule but no form', async ({ page }) => {
  await signIn(page, 'user')
  await page.goto('/pengaturan')

  await expect(
    page.getByRole('heading', { name: 'Patokan nilai' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Retensi' })).toBeVisible()
  await expect(
    page.getByText('berlaku setelah Asisten di-deploy ulang'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Simpan sebagai versi baru' }),
  ).toHaveCount(0)
})

test('Hapus data asks for a reason before it sends anything', async ({
  page,
}) => {
  await signIn(page)
  await page.goto('/proposal/form-seedfashionista')

  await expect(page.getByText('kutipan tidak terverifikasi')).toBeVisible()

  await page.getByRole('button', { name: 'Hapus data' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Hapus permanen' }).click()
  await expect(
    dialog.getByText('Alasan penghapusan wajib diisi.'),
  ).toBeVisible()

  await dialog.getByRole('button', { name: 'Batal' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/proposal\/form-seedfashionista$/)
})

test('a read-only seat has no Hapus data button', async ({ page }) => {
  await signIn(page, 'user')
  await page.goto('/proposal/form-seedfashionista')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Fashionista' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hapus data' })).toHaveCount(0)
})
