/**
 * Tanggapan, koreksi kategori and tanggapan massal through the dashboard, with
 * the mock `aisa-api` behind the container (`mock-aisa-api.ts`).
 *
 * What these prove is the dashboard's half of each write: the exact request a
 * click sends (route, `X-AISA-Key`, JSON body), that a required reason is
 * enforced BEFORE anything is sent, that the API's own refusal reaches the
 * screen word for word, and that a pending click cannot be sent twice. The
 * end state in Firestore is `aisa-api`'s to prove, not this suite's: the mock
 * writes nothing.
 */
import { expect, signInAs, test } from './fixtures.ts'
import { alertIn, card, toast } from './locators.ts'
import { EXPECTED_KEY } from './mock-aisa-api.ts'

const UNREACHABLE = 'aisa-api tidak dapat dihubungi. Coba lagi sebentar lagi.'

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-70 Undang with a note sends kind and note, and says it was saved', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  const panel = card(page, 'Tanggapan')
  await panel.getByLabel('Catatan (opsional)').fill('  Ajak pitching Kamis  ')
  await panel.getByRole('button', { name: 'Undang' }).click()

  await expect(toast(page, 'Tanggapan tersimpan: Undang.')).toBeVisible()
  expect(aisaApi.calls).toEqual([
    {
      method: 'POST',
      path: '/api/proposals/form-seedtanimaju/response',
      key: EXPECTED_KEY,
      contentType: 'application/json',
      body: { kind: 'undang', note: 'Ajak pitching Kamis' },
    },
  ])
  await expect(panel.getByLabel('Catatan (opsional)')).toHaveValue('')
})

test('DSB-71 Pantau without a note sends no note at all', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedsawahku')
  const panel = card(page, 'Tanggapan')
  // Spaces only are no note.
  await panel.getByLabel('Catatan (opsional)').fill('   ')
  await panel.getByRole('button', { name: 'Pantau' }).click()

  await expect(toast(page, 'Tanggapan tersimpan: Pantau.')).toBeVisible()
  expect(aisaApi.calls.map((call) => [call.path, call.body])).toEqual([
    ['/api/proposals/form-seedsawahku/response', { kind: 'pantau' }],
  ])
})

test('DSB-72 an API refusal of a response is shown verbatim and nothing claims success', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedbelajaryuk')
  aisaApi.refuseNext({ status: 404, detail: 'proposal tidak ditemukan' })
  const panel = card(page, 'Tanggapan')
  await panel.getByRole('button', { name: 'Arsipkan' }).click()

  await expect(alertIn(panel, 'proposal tidak ditemukan')).toBeVisible()
  await expect(toast(page, 'proposal tidak ditemukan')).toBeVisible()
  await expect(toast(page, 'Tanggapan tersimpan: Arsipkan.')).toHaveCount(0)
  expect(aisaApi.calls).toHaveLength(1)
  expect(aisaApi.calls[0]?.body).toEqual({ kind: 'arsipkan' })
})

test('DSB-73 an unreachable aisa-api says so instead of failing silently', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedbelajaryuk')
  aisaApi.dropNext()
  const panel = card(page, 'Tanggapan')
  await panel.getByRole('button', { name: 'Pantau' }).click()

  await expect(alertIn(panel, UNREACHABLE)).toBeVisible()
  expect(aisaApi.calls).toHaveLength(1)
})

test('DSB-74 a double click on a response sends it once', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/upload-seedklinikdesa')
  aisaApi.delayAnswers(1500)
  const panel = card(page, 'Tanggapan')
  await panel.getByRole('button', { name: 'Pantau' }).dblclick()

  await expect(toast(page, 'Tanggapan tersimpan: Pantau.')).toBeVisible()
  expect(aisaApi.calls).toHaveLength(1)
})

test('DSB-75 Koreksi kategori without a reason sends nothing', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  const kategori = card(page, /^Kategori$/u)
  await kategori.getByLabel('Kategori baru').selectOption('Cocok')

  await kategori.getByRole('button', { name: 'Simpan koreksi' }).click()
  await expect(alertIn(kategori, 'Alasan koreksi wajib diisi.')).toBeVisible()

  await kategori.getByLabel('Alasan koreksi').fill('    ')
  await kategori.getByRole('button', { name: 'Simpan koreksi' }).click()
  await expect(alertIn(kategori, 'Alasan koreksi wajib diisi.')).toBeVisible()

  expect(aisaApi.calls).toEqual([])
})

test('DSB-76 Koreksi kategori with a reason sends the category and the reason, not a score', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  const kategori = card(page, /^Kategori$/u)
  // The current kategori efektif cannot be chosen again.
  await kategori.getByLabel('Kategori baru').selectOption('Sangat cocok')
  await expect(
    kategori.getByRole('button', { name: 'Simpan koreksi' }),
  ).toBeDisabled()

  await kategori.getByLabel('Kategori baru').selectOption('Kurang cocok')
  await kategori.getByLabel('Alasan koreksi').fill('Tim belum lengkap')
  await kategori.getByRole('button', { name: 'Simpan koreksi' }).click()

  await expect(toast(page, 'Kategori dikoreksi ke Kurang cocok.')).toBeVisible()
  expect(aisaApi.calls).toEqual([
    {
      method: 'POST',
      path: '/api/proposals/form-seedtanimaju/correction',
      key: EXPECTED_KEY,
      contentType: 'application/json',
      body: { category: 'kurang_cocok', reason: 'Tim belum lengkap' },
    },
  ])
  await expect(kategori.getByLabel('Alasan koreksi')).toHaveValue('')
})

test('DSB-77 a refused Koreksi kategori shows the API message verbatim', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  aisaApi.refuseNext({
    status: 409,
    detail: 'hanya proposal yang sudah dinilai yang punya kategori',
  })
  const kategori = card(page, /^Kategori$/u)
  await kategori.getByLabel('Alasan koreksi').fill('Uji penolakan')
  await kategori.getByRole('button', { name: 'Simpan koreksi' }).click()

  await expect(
    alertIn(kategori, 'hanya proposal yang sudah dinilai yang punya kategori'),
  ).toBeVisible()
  await expect(kategori.getByLabel('Alasan koreksi')).toHaveValue(
    'Uji penolakan',
  )
})

test('DSB-78 Tanggapi semua asks first, then sends the category and the response', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal?kategori=cocok')
  await expect(
    page.getByText('Tanggapi semua 4 proposal Cocok yang belum ditanggapi:'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Arsipkan semua' }).click()
  await expect(page.getByText('Arsipkan 4 proposal?')).toBeVisible()
  await page.getByRole('button', { name: 'Batal' }).click()
  await expect(page.getByText('Arsipkan 4 proposal?')).toHaveCount(0)
  expect(aisaApi.calls).toEqual([])

  aisaApi.answerNext({ status: 200, body: { count: 4 } })
  await page.getByRole('button', { name: 'Arsipkan semua' }).click()
  await page.getByRole('button', { name: 'Ya, lanjutkan' }).click()

  await expect(toast(page, 'Arsipkan: 4 proposal Cocok.')).toBeVisible()
  expect(aisaApi.calls).toEqual([
    {
      method: 'POST',
      path: '/api/proposals/bulk-response',
      key: EXPECTED_KEY,
      contentType: 'application/json',
      body: { category: 'cocok', kind: 'arsipkan' },
    },
  ])
})

test('DSB-79 a refused Tanggapi semua shows the API message verbatim', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/proposal?kategori=tidak_cocok')
  aisaApi.refuseNext({ status: 401, detail: 'kunci tidak valid' })
  await page.getByRole('button', { name: 'Pantau semua' }).click()
  await page.getByRole('button', { name: 'Ya, lanjutkan' }).click()

  await expect(alertIn(page, 'kunci tidak valid')).toBeVisible()
  expect(aisaApi.calls[0]?.body).toEqual({
    category: 'tidak_cocok',
    kind: 'pantau',
  })
})

test('DSB-80 Tanggapi semua reports how many proposals aisa-api actually changed', async ({
  page,
  aisaApi,
}) => {
  // Between loading the list and confirming, one Cocok proposal was answered
  // over WhatsApp: the API changes 3, not the 4 the page counted.
  // The toast must report the API's count, not the page's.
  await page.goto('/proposal?kategori=cocok')
  aisaApi.answerNext({ status: 200, body: { count: 3 } })
  await page.getByRole('button', { name: 'Arsipkan semua' }).click()
  await page.getByRole('button', { name: 'Ya, lanjutkan' }).click()

  await expect(page.locator('[data-sonner-toast] [data-title]')).toHaveText(
    'Arsipkan: 3 proposal Cocok.',
  )
})
