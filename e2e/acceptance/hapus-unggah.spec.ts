/**
 * Hapus data and Unggah pitch deck through the dashboard, against the mock
 * `aisa-api` (`mock-aisa-api.ts`). Each test asserts the exact request, or that
 * no request left at all when the dashboard must refuse first.
 *
 * The deck is synthetic and for a FICTIONAL startup, per the testing standard;
 * it is a few bytes of PDF header, never a real founder's deck.
 */
import type { Page } from '@playwright/test'

import { expect, signInAs, test } from './fixtures.ts'
import { alertIn, toast } from './locators.ts'
import { EXPECTED_KEY, UPLOAD_ANSWER_ID } from './mock-aisa-api.ts'

const FICTIONAL_DECK = {
  name: 'Sawit_Digital_Fiktif_deck.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    '%PDF-1.4\n% Sawit Digital (fiktif) — deck uji E2E\n%%EOF\n',
    'utf8',
  ),
}

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

async function openDelete(page: Page) {
  await page.goto('/proposal/upload-seedklinikdesa')
  await page.getByRole('button', { name: 'Hapus data' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText('Hapus data Klinik Desa?')).toBeVisible()
  return dialog
}

test('DSB-81 Hapus data needs a reason that is more than spaces', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openDelete(page)
  await dialog.getByLabel('Alasan (wajib)').fill('   ')
  await dialog.getByRole('button', { name: 'Hapus permanen' }).click()

  await expect(alertIn(dialog, 'Alasan penghapusan wajib diisi.')).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-82 Hapus data with a reason sends it, lands on the list and says so', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openDelete(page)
  await dialog
    .getByLabel('Alasan (wajib)')
    .fill('Permintaan founder lewat email (uji E2E)')
  await dialog.getByRole('button', { name: 'Hapus permanen' }).click()

  await expect(page).toHaveURL(/\/proposal$/u)
  await expect(toast(page, 'Data proposal Klinik Desa dihapus.')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(aisaApi.calls).toEqual([
    {
      method: 'DELETE',
      path: '/api/proposals/upload-seedklinikdesa',
      key: EXPECTED_KEY,
      contentType: 'application/json',
      body: { reason: 'Permintaan founder lewat email (uji E2E)' },
    },
  ])
})

test('DSB-83 a refused Hapus data keeps the dialog open with the API message', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openDelete(page)
  aisaApi.refuseNext({ status: 404, detail: 'proposal tidak ditemukan' })
  await dialog.getByLabel('Alasan (wajib)').fill('Permintaan founder')
  await dialog.getByRole('button', { name: 'Hapus permanen' }).click()

  await expect(alertIn(dialog, 'proposal tidak ditemukan')).toBeVisible()
  await expect(page).toHaveURL(/\/proposal\/upload-seedklinikdesa$/u)
  await expect(toast(page, 'Data proposal Klinik Desa dihapus.')).toHaveCount(0)
})

async function openUpload(page: Page) {
  await page.goto('/hari-ini')
  await page.getByRole('button', { name: 'Unggah pitch deck' }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByText(
      'PDF dinilai lewat alur yang sama dengan Form. Hanya teks yang dikirim ke model.',
    ),
  ).toBeVisible()
  return dialog
}

test('DSB-84 Unggah pitch deck forwards the PDF and the name, then opens the new proposal', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Berkas PDF').setInputFiles(FICTIONAL_DECK)
  await dialog
    .getByLabel('Nama startup (opsional)')
    .fill('  Sawit Digital (fiktif)  ')
  await dialog.getByRole('button', { name: 'Unggah', exact: true }).click()

  await expect(
    toast(page, 'Pitch deck diterima dan sedang diproses.'),
  ).toBeVisible()
  await expect(page).toHaveURL(
    new RegExp(`/proposal/${UPLOAD_ANSWER_ID}$`, 'u'),
  )
  expect(aisaApi.calls).toHaveLength(1)
  const [call] = aisaApi.calls
  expect(call?.method).toBe('POST')
  expect(call?.path).toBe('/intake/upload')
  expect(call?.key).toBe(EXPECTED_KEY)
  expect(call?.contentType).toMatch(/^multipart\/form-data; boundary=/u)
  expect(call?.body).toEqual({
    file: {
      fileName: FICTIONAL_DECK.name,
      type: 'application/pdf',
      size: FICTIONAL_DECK.buffer.length,
      head: '%PDF-',
    },
    name: 'Sawit Digital (fiktif)',
  })
})

test('DSB-85 Unggah without a name sends no name field', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Berkas PDF').setInputFiles(FICTIONAL_DECK)
  await dialog.getByRole('button', { name: 'Unggah', exact: true }).click()

  await expect(
    toast(page, 'Pitch deck diterima dan sedang diproses.'),
  ).toBeVisible()
  expect(Object.keys(aisaApi.calls[0]?.body as object)).toEqual(['file'])
})

test('DSB-86 a file that is not a PDF is refused before it is sent', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Berkas PDF').setInputFiles({
    name: 'catatan.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('bukan pitch deck'),
  })
  await dialog.getByRole('button', { name: 'Unggah', exact: true }).click()

  await expect(alertIn(dialog, 'Berkas harus PDF.')).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-87 a deck over 20 MB is refused before it is sent', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Berkas PDF').setInputFiles({
    name: 'Terlalu_Besar_Fiktif.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 0x20),
  })
  await dialog.getByRole('button', { name: 'Unggah', exact: true }).click()

  await expect(
    alertIn(dialog, 'Berkas terlalu besar (maksimal 20 MB).'),
  ).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-88 a deck aisa-api refuses shows its message and stays on the dialog', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openUpload(page)
  aisaApi.refuseNext({ status: 422, detail: 'berkas bukan PDF' })
  await dialog.getByLabel('Berkas PDF').setInputFiles({
    name: 'Menyamar_Fiktif.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('bukan PDF walau namanya .pdf'),
  })
  await dialog.getByRole('button', { name: 'Unggah', exact: true }).click()

  await expect(alertIn(dialog, 'berkas bukan PDF')).toBeVisible()
  await expect(page).toHaveURL(/\/hari-ini$/u)
  expect(aisaApi.calls).toHaveLength(1)
})
