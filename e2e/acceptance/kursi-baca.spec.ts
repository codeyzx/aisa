/**
 * The read-only seat (`aisa:read` only, `viewer@aisa.test`). It must see every
 * rule that scores proposals, and no control that would write: a button a seat
 * cannot use either fails on click or teaches the seat to ignore buttons. The
 * write controls are gated by capability on the server (`aisa:respond`,
 * `aisa:configure`); these tests drive what the page actually renders.
 */
import { expect, signInAs, test } from './fixtures.ts'
import { fact } from './locators.ts'

test.beforeEach(async ({ page }) => {
  await signInAs(page, 'user')
})

test('DSB-60 Pengaturan shows a viewer every active rule, read-only, and no STOP', async ({
  page,
}) => {
  await page.goto('/pengaturan')

  await expect(page.getByText('Berjalan', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'STOP' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'LANJUT' })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('spinbutton')).toHaveCount(0)

  await expect(page.getByText('versi 1', { exact: true })).toBeVisible()
  await expect(
    page.getByText(
      'Tim 27,5% · Pasar & masalah 30% · Produk & keunggulan 20% · Traksi 12,5% · Model bisnis & keuangan 10%',
    ),
  ).toBeVisible()
  await expect(
    page.getByText('agritech, fintech, edtech, healthtech, climate', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('pre-seed, seed, seri-a', { exact: true }),
  ).toBeVisible()
  for (const [label, value] of [
    ['Sangat cocok ≥', '80'],
    ['Cocok ≥', '65'],
    ['Kurang cocok ≥', '45'],
    ['Berkualitas, di luar fokus ≥', '65'],
  ] as const) {
    await expect(fact(page, label)).toHaveText(value)
  }
  for (const model of ['Penilai', 'Pembuat ringkasan', 'Insight', 'Asisten']) {
    await expect(fact(page, model)).toContainText('gemini-3.8-flash')
  }
  await expect(
    page.getByText('berlaku setelah Asisten di-deploy ulang'),
  ).toBeVisible()
  await expect(page.getByText('Orchestrator')).toHaveCount(0)
  await expect(
    page.getByText(
      '90 hari — Proposal yang diarsipkan dihapus otomatis setelah 90 hari (setiap hari 02.00 WIB).',
    ),
  ).toBeVisible()
})

test('DSB-61 a viewer gets no response, correction or delete control on a proposal', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tani Maju' }),
  ).toBeVisible()
  for (const name of [
    'Undang',
    'Pantau',
    'Arsipkan',
    'Simpan koreksi',
    'Hapus data',
  ]) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(page.getByText('Koreksi kategori', { exact: true })).toHaveCount(
    0,
  )
  // Reading the log is not a write.
  await expect(
    page.getByRole('link', { name: 'Lihat log penilaian' }),
  ).toBeVisible()
})

test('DSB-62 a viewer gets no bulk response on a filtered list', async ({
  page,
}) => {
  // Bulk response needs `aisa:respond`; a viewer must not be offered a panel
  // whose every button is refused by the server action.
  await page.goto('/proposal?kategori=cocok')
  await expect(
    page.getByText('Menampilkan 4 dari 14 proposal.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/^Tanggapi semua/u)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /semua$/u })).toHaveCount(0)
})

test('DSB-63 a viewer gets no Unggah pitch deck button', async ({ page }) => {
  // Uploading needs `aisa:respond`; a viewer must not learn that only after
  // picking a PDF and pressing Unggah.
  for (const path of ['/hari-ini', '/proposal']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Unggah pitch deck' }),
      path,
    ).toHaveCount(0)
  }
})
