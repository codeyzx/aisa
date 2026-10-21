/**
 * The read-only seat (`aisa:read` only, `viewer@aisa.test`). It must see every
 * rule that scores proposals, and no control that would write: a button a seat
 * cannot use either fails on click or teaches the seat to ignore buttons. The
 * write controls are gated by capability on the server (`aisa:respond`,
 * `aisa:configure`); these tests drive what the page actually renders.
 */
import { expect, signInAs, test } from './fixtures.ts'
import { card, fact } from './locators.ts'

test.beforeEach(async ({ page }) => {
  await signInAs(page, 'user')
})

test('DSB-60 Aturan penilaian and Pengaturan show a viewer every active rule, read-only, and no STOP', async ({
  page,
}) => {
  await page.goto('/aturan')
  const main = page.getByRole('main')

  await expect(main.getByRole('button', { name: /^Ubah/u })).toHaveCount(0)
  await expect(main.getByRole('textbox')).toHaveCount(0)
  await expect(main.getByRole('spinbutton')).toHaveCount(0)

  await expect(main.getByText('Aturan versi 1', { exact: true })).toBeVisible()
  const weights = card(page, 'Bobot kriteria')
  for (const [label, percent] of [
    ['Tim', '27,5%'],
    ['Pasar & masalah', '30%'],
    ['Produk & keunggulan', '20%'],
    ['Traksi', '12,5%'],
    ['Model bisnis & keuangan', '10%'],
  ] as const) {
    await expect(
      weights
        .getByRole('listitem')
        .filter({ has: page.getByText(label, { exact: true }) }),
      label,
    ).toContainText(percent)
  }
  const focus = card(page, 'Fokus investasi')
  await expect(focus.getByText('5 sektor fokus', { exact: true })).toBeVisible()
  await expect(focus.getByText('3 tahap fokus', { exact: true })).toBeVisible()
  for (const value of [
    'agritech',
    'fintech',
    'edtech',
    'healthtech',
    'climate',
    'pre-seed',
    'seed',
    'seri-a',
  ]) {
    await expect(focus.getByText(value, { exact: true })).toBeVisible()
  }
  const thresholds = card(page, 'Batas kategori')
  for (const range of ['≥ 80', '≥ 65', '≥ 45', '< 45']) {
    await expect(thresholds.getByText(range, { exact: true })).toBeVisible()
  }
  await expect(
    thresholds.getByText(/Skor 65 ke atas yang gagal salah satu cek fokus/u),
  ).toBeVisible()
  for (const model of ['Penilai', 'Pembuat ringkasan', 'Insight', 'Asisten']) {
    await expect(fact(page, model)).toContainText('gemini-3.8-flash')
  }
  await expect(
    page.getByText('berlaku setelah Asisten di-deploy ulang'),
  ).toBeVisible()
  await expect(page.getByText('Orchestrator')).toHaveCount(0)

  await page.goto('/pengaturan?tab=integrasi')
  await expect(page.getByText('Berjalan', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'STOP' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'LANJUT' })).toHaveCount(0)

  await page.goto('/pengaturan?tab=privasi')
  await expect(main.getByText('90 hari', { exact: true }).first()).toBeVisible()
  await expect(
    main.getByText(
      /^Proposal yang diarsipkan dihapus otomatis setelah 90 hari \(setiap hari 02\.00 WIB\)\./u,
    ),
  ).toBeVisible()
  await expect(main.getByRole('combobox')).toHaveCount(0)
  await expect(main.getByRole('textbox')).toHaveCount(0)
})

test('DSB-61 a viewer gets no response, correction or delete control on a proposal', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  await expect(
    page.getByRole('heading', { level: 2, name: 'Tani Maju' }),
  ).toBeVisible()
  for (const name of [/^Undang/u, /^Pantau/u, /^Arsipkan/u]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
  for (const name of ['Simpan koreksi', 'Hapus data']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(page.getByLabel('Catatan (opsional)')).toHaveCount(0)
  await expect(page.getByText('Kategori kurang pas?')).toHaveCount(0)
  // Reading the log is not a write.
  await expect(
    page.getByRole('button', { name: 'Lihat log penilaian' }),
  ).toBeVisible()
})

test('DSB-62 a viewer gets no bulk response on a filtered list', async ({
  page,
}) => {
  // Bulk response needs `aisa:respond`; a viewer must not be offered a panel
  // whose every button is refused by the server action.
  await page.goto('/proposal?kategori=cocok')
  await expect(
    page.getByText('Menampilkan 1–5 dari 5 proposal', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/^Tanggapi semua/u)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /semua$/u })).toHaveCount(0)
  // Ticking rows still allows an export, but offers no response.
  await page.getByRole('checkbox', { name: 'Pilih SawahKu' }).click()
  const bar = page.getByRole('region', { name: 'Tanggapan massal' })
  await expect(bar.getByText('1 dipilih')).toBeVisible()
  for (const name of ['Undang', 'Pantau', 'Arsipkan']) {
    await expect(bar.getByRole('button', { name })).toHaveCount(0)
  }
})

test('DSB-63 a viewer gets no Unggah pitch deck button', async ({ page }) => {
  // Uploading needs `aisa:respond`; a viewer must not learn that only after
  // picking a PDF and pressing Unggah.
  for (const path of ['/dashboard', '/proposal']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Unggah pitch deck' }),
      path,
    ).toHaveCount(0)
  }
})

test('DSB-64 a viewer can preview a deck, which only reads', async ({
  page,
  aisaApi,
}) => {
  // `getDeckUrlAction` is gated on `aisa:read`, the capability a viewer holds:
  // reading the deck the AI quoted is part of reading the proposal.
  await page.route('https://storage.googleapis.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: '%PDF-1.4\n%%EOF\n',
    }),
  )
  await page.goto('/proposal/upload-seedklinikdesa')
  await page
    .getByRole('button', { name: 'Buka pratinjau deck di halaman 2' })
    .first()
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Pratinjau deck' }).locator('iframe'),
  ).toHaveAttribute('src', /#page=2$/u)
  expect(aisaApi.calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'GET /api/proposals/upload-seedklinikdesa/deck-url',
  ])
})
