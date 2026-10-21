/**
 * Saving the scoring rules and STOP/LANJUT from Pengaturan, against the mock
 * `aisa-api` (`mock-aisa-api.ts`).
 *
 * The rules a save sends are compared with `settings/rules` as the shard's
 * emulator holds it: the request must carry exactly the stored rules plus the
 * manager's edits, keep the Asisten model as stored (only a redeploy changes
 * it), and carry no retired Orchestrator model. A rule the dashboard can check
 * (weights total 100%, a reason, retention ≥ 1 day, descending thresholds) must
 * be refused before anything is sent.
 */
import {
  RULES_DOC_ID,
  SETTINGS_COLLECTION,
} from '../../features/aisa/aisa.path.ts'
import type { Rules } from '../../features/aisa/aisa.schema.ts'
import { emulatorDb, expect, signInAs, test, withRuntime } from './fixtures.ts'
import { alertIn, card, toast } from './locators.ts'
import { EXPECTED_KEY } from './mock-aisa-api.ts'

test.beforeEach(async ({ page }) => {
  await signInAs(page)
  await page.goto('/pengaturan')
})

test('DSB-90 weights that do not total 100% are refused before sending', async ({
  page,
  aisaApi,
}) => {
  await page.getByLabel('Tim (%)').fill('30')
  await expect(page.getByText('Total: 102,5% — harus 100%')).toBeVisible()
  await page.getByLabel('Alasan perubahan (wajib)').fill('Uji bobot')
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click()

  await expect(
    alertIn(page, 'Total bobot harus 100% (sekarang 102,5%).'),
  ).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-91 a rules change without a reason is refused before sending', async ({
  page,
  aisaApi,
}) => {
  await expect(page.getByText('Total: 100% ✓')).toBeVisible()
  await page.getByLabel('Alasan perubahan (wajib)').fill('   ')
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click()

  await expect(alertIn(page, 'Alasan perubahan wajib diisi.')).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-92 a retention below one whole day is refused before sending', async ({
  page,
  aisaApi,
}) => {
  await page.getByLabel('Alasan perubahan (wajib)').fill('Uji retensi')
  for (const days of ['0', '1.5']) {
    await page.getByLabel('Retensi (hari)').fill(days)
    await page
      .getByRole('button', { name: 'Simpan sebagai versi baru' })
      .click()
    await expect(
      alertIn(page, 'Retensi minimal 1 hari (bilangan bulat).'),
      days,
    ).toBeVisible()
  }
  expect(aisaApi.calls).toEqual([])
})

test('DSB-93 category thresholds that do not descend are refused before sending', async ({
  page,
  aisaApi,
}) => {
  await page.getByLabel('Cocok ≥', { exact: true }).fill('85')
  await page.getByLabel('Alasan perubahan (wajib)').fill('Uji batas')
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click()

  await expect(
    alertIn(
      page,
      'Batas kategori harus menurun: sangat cocok > cocok > kurang cocok',
    ),
  ).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-94 a valid save sends the stored rules plus the edits, Asisten unchanged and no Orchestrator', async ({
  page,
  aisaApi,
}) => {
  const stored = (
    await emulatorDb().collection(SETTINGS_COLLECTION).doc(RULES_DOC_ID).get()
  ).data() as Rules

  await page.getByLabel('Tim (%)').fill('30')
  await page.getByLabel('Pasar & masalah (%)').fill('27.5')
  await expect(page.getByText('Total: 100% ✓')).toBeVisible()
  await page.getByLabel('Retensi (hari)').fill('60')
  await expect(
    page.getByText(
      'Proposal yang diarsipkan dihapus otomatis setelah 60 hari (setiap hari 02.00 WIB).',
    ),
  ).toBeVisible()
  await page
    .getByLabel('Alasan perubahan (wajib)')
    .fill('Tesis dana Q4: tim lebih berat')
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click()

  await expect(
    toast(page, 'Aturan penilaian tersimpan sebagai versi baru.'),
  ).toBeVisible()
  expect(aisaApi.calls).toHaveLength(1)
  const [call] = aisaApi.calls
  expect(call?.method).toBe('PUT')
  expect(call?.path).toBe('/api/rules')
  expect(call?.key).toBe(EXPECTED_KEY)
  expect(call?.body).toStrictEqual({
    rules: {
      weights: { ...stored.weights, tim: 0.3, pasar: 0.275 },
      anchors: stored.anchors,
      fit: stored.fit,
      thresholds: stored.thresholds,
      models: {
        penilai: stored.models.penilai,
        ringkasan: stored.models.ringkasan,
        insight: stored.models.insight,
        asisten: stored.models.asisten,
      },
      minCharsPerPage: stored.minCharsPerPage,
      retentionDays: 60,
    },
    reason: 'Tesis dana Q4: tim lebih berat',
  })
  await expect(page.getByLabel('Alasan perubahan (wajib)')).toHaveValue('')
})

test('DSB-95 a rules save aisa-api refuses shows its message verbatim', async ({
  page,
  aisaApi,
}) => {
  aisaApi.refuseNext({
    status: 422,
    detail: 'bobot harus berisi kelima kriteria dan berjumlah 1,0',
  })
  await page.getByLabel('Alasan perubahan (wajib)').fill('Uji penolakan')
  await page.getByRole('button', { name: 'Simpan sebagai versi baru' }).click()

  await expect(
    alertIn(page, 'bobot harus berisi kelima kriteria dan berjumlah 1,0'),
  ).toBeVisible()
  await expect(page.getByLabel('Alasan perubahan (wajib)')).toHaveValue(
    'Uji penolakan',
  )
  expect(aisaApi.calls).toHaveLength(1)
})

test('DSB-96 STOP sends the stop route with no body', async ({
  page,
  aisaApi,
}) => {
  const status = card(page, 'Status AI')
  await expect(status.getByText('Berjalan', { exact: true })).toBeVisible()
  await status.getByRole('button', { name: 'STOP' }).click()

  await expect(toast(page, 'AI dijeda (STOP).')).toBeVisible()
  expect(aisaApi.calls).toEqual([
    {
      method: 'POST',
      path: '/api/runtime/stop',
      key: EXPECTED_KEY,
      contentType: null,
      body: null,
    },
  ])
})

test('DSB-97 while paused, Pengaturan says so and LANJUT sends the resume route', async ({
  page,
  aisaApi,
}) => {
  await withRuntime(
    { paused: true, pausedAt: new Date(), pausedVia: 'wa' },
    async () => {
      await page.reload()
      const status = card(page, 'Status AI')
      await expect(
        status.getByText('Dijeda (STOP)', { exact: true }),
      ).toBeVisible()
      await expect(
        status.getByText(
          /^Pekerjaan AI berhenti sejak \d{2} \S+ \d{4} \d{2}\.\d{2} \(lewat WhatsApp\)\. Proposal baru menunggu sebagai Antre sampai LANJUT\.$/u,
        ),
      ).toBeVisible()
      await status.getByRole('button', { name: 'LANJUT' }).click()

      await expect(toast(page, 'AI dilanjutkan (LANJUT).')).toBeVisible()
      expect(aisaApi.calls.map((call) => [call.method, call.path])).toEqual([
        ['POST', '/api/runtime/resume'],
      ])
    },
  )
})

test('DSB-98 a STOP aisa-api refuses shows its message verbatim', async ({
  page,
  aisaApi,
}) => {
  aisaApi.refuseNext({ status: 503, detail: 'INTERNAL_API_KEY belum diatur' })
  const status = card(page, 'Status AI')
  await status.getByRole('button', { name: 'STOP' }).click()

  await expect(alertIn(status, 'INTERNAL_API_KEY belum diatur')).toBeVisible()
  await expect(toast(page, 'AI dijeda (STOP).')).toHaveCount(0)
})
