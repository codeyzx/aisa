/**
 * Saving the scoring rules (Aturan penilaian's edit dialog and Pengaturan's
 * retention) and STOP/LANJUT (Pengaturan → Integrasi), against the mock
 * `aisa-api` (`mock-aisa-api.ts`).
 *
 * The rules a save sends are compared with `settings/rules` as the shard's
 * emulator holds it: the request must carry exactly the stored rules plus the
 * manager's edits, keep the Asisten model as stored (only a redeploy changes
 * it), and carry no retired Orchestrator model. A rule the dashboard can check
 * (weights total 100%, a reason, descending thresholds) must be refused before
 * anything is sent.
 */
import type { Locator, Page } from '@playwright/test'

import {
  RULES_DOC_ID,
  SETTINGS_COLLECTION,
} from '../../features/aisa/aisa.path.ts'
import type { Rules } from '../../features/aisa/aisa.schema.ts'
import { emulatorDb, expect, signInAs, test, withRuntime } from './fixtures.ts'
import { alertIn, toast } from './locators.ts'
import { EXPECTED_KEY } from './mock-aisa-api.ts'

async function storedRules(): Promise<Rules> {
  const snap = await emulatorDb()
    .collection(SETTINGS_COLLECTION)
    .doc(RULES_DOC_ID)
    .get()
  return snap.data() as Rules
}

/** Open Aturan penilaian's edit dialog. */
async function openRulesDialog(page: Page): Promise<Locator> {
  await page.goto('/aturan')
  await page.getByRole('button', { name: 'Ubah aturan' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ubah aturan penilaian' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** A Pengaturan panel, found by its heading. */
/**
 * The calls that ask aisa-api to CHANGE something. The Integrasi tab reads
 * `GET /health` on every render to show the API's status, which is a read and
 * says nothing about what STOP or LANJUT sent.
 */
function writes<T extends { path: string }>(calls: readonly T[]): T[] {
  return calls.filter((call) => call.path !== '/health')
}

function panel(page: Page, title: string): Locator {
  return page.locator('section').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
}

const saveButton = (dialog: Locator) =>
  dialog.getByRole('button', { name: /^Simpan versi \d+$/u })

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-90 weights that do not total 100% are refused before sending', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openRulesDialog(page)
  await dialog.getByLabel('Tim manajemen', { exact: true }).fill('30')
  await expect(dialog.getByText('· lebih 5%')).toBeVisible()
  await dialog.getByLabel('Alasan perubahan (wajib)').fill('Uji bobot')
  await saveButton(dialog).click()

  await expect(
    alertIn(dialog, 'Total bobot lima kriteria harus tepat 100%.'),
  ).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-91 a rules change without a reason is refused before sending', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openRulesDialog(page)
  await dialog.getByLabel('Tim manajemen', { exact: true }).fill('30')
  await dialog.getByLabel('Kinerja bisnis saat ini', { exact: true }).fill('15')
  await expect(dialog.getByText('· sudah pas')).toBeVisible()
  await dialog.getByLabel('Alasan perubahan (wajib)').fill('   ')
  await saveButton(dialog).click()

  await expect(alertIn(dialog, 'Alasan perubahan wajib diisi.')).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-92 a retention change needs a reason, then sends the stored rules with only the retention changed', async ({
  page,
  aisaApi,
}) => {
  const stored = await storedRules()
  await page.goto('/pengaturan?tab=privasi')
  const retention = panel(page, 'Berapa lama proposal yang ditolak disimpan')

  // Only whole days are offered: there is no field to type a fraction or 0 into.
  await retention.getByLabel('Hapus yang ditolak setelah').click()
  await expect(page.getByRole('option')).toHaveText([
    /^30 hari/u,
    /^90 hari/u,
    /^180 hari/u,
  ])
  await page.getByRole('option', { name: /^30 hari/u }).click()
  await expect(
    page.getByText('Ada perubahan yang belum disimpan', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(
    alertIn(retention, 'Alasan perubahan wajib diisi.'),
  ).toBeVisible()
  expect(aisaApi.calls).toEqual([])

  await retention.getByLabel('Alasan perubahan').fill('Hemat data arsip')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(
    toast(
      page,
      `Retensi 30 hari tersimpan sebagai aturan versi ${stored.version + 1}.`,
    ),
  ).toBeVisible()
  expect(aisaApi.calls).toHaveLength(1)
  const [call] = aisaApi.calls
  expect(call?.method).toBe('PUT')
  expect(call?.path).toBe('/api/rules')
  expect(call?.body).toStrictEqual({
    rules: {
      weights: stored.weights,
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
      retentionDays: 30,
    },
    reason: 'Hemat data arsip',
  })
})

test('DSB-93 grade thresholds that do not descend are refused before sending', async ({
  page,
  aisaApi,
}) => {
  const dialog = await openRulesDialog(page)
  await dialog.getByRole('tab', { name: 'Batas grade' }).click()
  await dialog.getByLabel('Layak bersyarat', { exact: true }).fill('85')
  // The row says what is wrong as soon as it is typed, before any save.
  const problem = alertIn(
    dialog,
    'Batas Sangat layak harus lebih tinggi dari batas Layak bersyarat (85).',
  )
  await expect(problem).toBeVisible()
  await dialog.getByLabel('Alasan perubahan (wajib)').fill('Uji batas')
  await saveButton(dialog).click()

  await expect(problem).toBeVisible()
  expect(aisaApi.calls).toEqual([])
})

test('DSB-94 a valid save sends the stored rules plus the edits, Asisten unchanged and no Orchestrator', async ({
  page,
  aisaApi,
}) => {
  const stored = await storedRules()
  const dialog = await openRulesDialog(page)

  await dialog.getByLabel('Tim manajemen', { exact: true }).fill('30')
  await dialog.getByLabel('Kinerja bisnis saat ini', { exact: true }).fill('15')
  await expect(dialog.getByText('· sudah pas')).toBeVisible()
  await dialog
    .getByLabel('Alasan perubahan (wajib)')
    .fill('Tesis dana Q4: tim lebih berat')
  await saveButton(dialog).click()

  await expect(
    toast(page, 'Aturan penilaian tersimpan sebagai versi baru.'),
  ).toBeVisible()
  await expect(dialog).toBeHidden()
  expect(aisaApi.calls).toHaveLength(1)
  const [call] = aisaApi.calls
  expect(call?.method).toBe('PUT')
  expect(call?.path).toBe('/api/rules')
  expect(call?.key).toBe(EXPECTED_KEY)
  expect(call?.body).toStrictEqual({
    rules: {
      weights: { ...stored.weights, manajemen: 0.3, kinerja: 0.15 },
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
      retentionDays: stored.retentionDays,
    },
    reason: 'Tesis dana Q4: tim lebih berat',
  })
})

test('DSB-95 a rules save aisa-api refuses shows its message verbatim', async ({
  page,
  aisaApi,
}) => {
  aisaApi.refuseNext({
    status: 422,
    detail: 'bobot harus berisi kelima kriteria dan berjumlah 1,0',
  })
  const dialog = await openRulesDialog(page)
  // The save button stays off until the draft changes something.
  await dialog.getByRole('tab', { name: 'Batas grade' }).click()
  await dialog.getByLabel('Risiko tinggi', { exact: true }).fill('40')
  await dialog.getByLabel('Alasan perubahan (wajib)').fill('Uji penolakan')
  await saveButton(dialog).click()

  await expect(
    alertIn(dialog, 'bobot harus berisi kelima kriteria dan berjumlah 1,0'),
  ).toBeVisible()
  await expect(dialog.getByLabel('Alasan perubahan (wajib)')).toHaveValue(
    'Uji penolakan',
  )
  expect(aisaApi.calls).toHaveLength(1)
})

/** STOP's confirmation, opened from the Status AI panel. */
async function openStopConfirm(page: Page, status: Locator): Promise<Locator> {
  await status.getByRole('button', { name: 'STOP' }).click()
  const confirm = page.getByRole('alertdialog', {
    name: 'Jeda semua pekerjaan AI?',
  })
  await expect(confirm).toBeVisible()
  return confirm
}

test('DSB-96 STOP asks first, Batal sends nothing, and the confirm sends the stop route with no body', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/pengaturan?tab=integrasi')
  const status = panel(page, 'Status AI')
  await expect(status.getByText('Berjalan', { exact: true })).toBeVisible()

  const cancelled = await openStopConfirm(page, status)
  await expect(
    cancelled.getByText(
      'Selama dijeda, proposal baru menunggu sebagai Antre, Asisten menjawab “AISA sedang dijeda”, dan pekerjaan yang sedang berjalan dihentikan di antara langkah.',
    ),
  ).toBeVisible()
  await cancelled.getByRole('button', { name: 'Batal' }).click()
  await expect(cancelled).toHaveCount(0)
  expect(writes(aisaApi.calls)).toEqual([])
  await expect(status.getByText('Berjalan', { exact: true })).toBeVisible()

  const confirm = await openStopConfirm(page, status)
  await confirm.getByRole('button', { name: 'Ya, jeda AI' }).click()

  await expect(toast(page, 'AI dijeda (STOP).')).toBeVisible()
  await expect(confirm).toHaveCount(0)
  expect(writes(aisaApi.calls)).toEqual([
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
      await page.goto('/pengaturan?tab=integrasi')
      const status = panel(page, 'Status AI')
      await expect(
        status.getByText('Dijeda (STOP)', { exact: true }),
      ).toBeVisible()
      await expect(
        status.getByText(
          /^Pekerjaan AI berhenti sejak \d{2} \S+ \d{4}, \d{2}\.\d{2} \(lewat WhatsApp\)\. Proposal baru menunggu sebagai Antre sampai LANJUT\.$/u,
        ),
      ).toBeVisible()
      await status.getByRole('button', { name: 'LANJUT' }).click()

      // Resuming needs no confirmation.
      await expect(toast(page, 'AI dilanjutkan (LANJUT).')).toBeVisible()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      expect(
        writes(aisaApi.calls).map((call) => [call.method, call.path]),
      ).toEqual([['POST', '/api/runtime/resume']])
    },
  )
})

test('DSB-98 a STOP aisa-api refuses shows its message verbatim', async ({
  page,
  aisaApi,
}) => {
  await page.goto('/pengaturan?tab=integrasi')
  const status = panel(page, 'Status AI')
  await expect(status.getByText('Berjalan', { exact: true })).toBeVisible()
  // Armed only once the tab has rendered: its own `GET /health` would
  // otherwise take the refusal meant for STOP.
  const confirm = await openStopConfirm(page, status)
  aisaApi.refuseNext({ status: 503, detail: 'INTERNAL_API_KEY belum diatur' })
  await confirm.getByRole('button', { name: 'Ya, jeda AI' }).click()

  // The confirmation stays open so the refusal can be read where it was asked.
  await expect(alertIn(confirm, 'INTERNAL_API_KEY belum diatur')).toBeVisible()
  await expect(toast(page, 'AI dijeda (STOP).')).toHaveCount(0)
})

test('DSB-99 Pengaturan Ringkasan names both schedules and previews the daily and the weekly message', async ({
  page,
}) => {
  await page.goto('/pengaturan?tab=ringkasan')
  const jadwal = panel(page, 'Jadwal kirim')
  await expect(jadwal).toContainText('09.00 setiap hari')
  await expect(jadwal).toContainText(
    'Proposal baru sejak ringkasan pagi sebelumnya',
  )
  await expect(jadwal).toContainText('17.00 setiap Jumat')
  await expect(jadwal).toContainText('Ringkasan minggu ini')
  await expect(jadwal).toContainText(
    /Berikutnya (hari ini|besok) pukul (09\.00 WIB \(harian\)|17\.00 WIB \(mingguan\))/u,
  )
  await expect(panel(page, 'Isi ringkasan mingguan')).toBeVisible()

  const preview = page.getByRole('complementary', {
    name: 'Pratinjau pesan WhatsApp',
  })
  await preview.getByRole('button', { name: 'Harian' }).click()
  // The daily window starts at the seed's 09.00 ringkasan.
  await expect(preview).toContainText(
    /Selamat pagi, Pak\. Sejak ringkasan \S+ pukul 09\.00 masuk \d+ proposal baru\./u,
  )
  await expect(preview).toContainText('Sangat layak (3)')

  await preview.getByRole('button', { name: 'Mingguan' }).click()
  await expect(preview).toContainText(
    /Selamat sore, Pak\. Ini ringkasan mingguan AISA, \d{1,2}/u,
  )
  for (const heading of [
    'Proposal masuk',
    'Sektor',
    'Rata-rata skor',
    'Keputusan minggu ini',
    'Perlu dicek manual',
  ])
    await expect(preview.locator('b', { hasText: heading })).toBeVisible()
  await expect(preview).toContainText(/Setuju \d+ · Tolak \d+/u)
})
