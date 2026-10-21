/**
 * The proposal detail page, one variant per seeded shape. Expected values come
 * from the overview's rules applied to the seed (`scripts/_seed-aisa.ts`):
 * `skor = Σ bobot × (nilai − 1) / 4` with the baseline weights, the fit rules
 * (agritech/fintech/edtech/healthtech/climate · pre-seed/seed/seri-a ·
 * Rp1–20 M), and "a butir that is not mentioned fails the fit check".
 */
import type { Locator, Page } from '@playwright/test'

import { expect, signInAs, test } from './fixtures.ts'
import { card, fact } from './locators.ts'

function criterionRow(page: Page, label: string): Locator {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: label, exact: true }) })
}

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-20 a scored, fitting proposal shows both stages, quotes and tokens', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedtanimaju')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Tani Maju' }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Platform pembiayaan dan input pertanian untuk petani padi.',
    ),
  ).toBeVisible()

  // Tahap 1: 0,275·1 + 0,3·1 + 0,2·0,75 + 0,125·1 + 0,1·0,75 = 92,5
  await expect(
    page.getByText('Tahap 1 — Skor kualitas 92,5', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Aturan v1 · model gemini-3.8-flash · skor = Σ bobot × (nilai − 1) / 4, dihitung kode',
    ),
  ).toBeVisible()
  for (const [label, value] of [
    ['Tim', '5/5'],
    ['Pasar & masalah', '5/5'],
    ['Produk & keunggulan', '4/5'],
    ['Traksi', '5/5'],
    ['Model bisnis & keuangan', '4/5'],
  ] as const) {
    await expect(criterionRow(page, label).getByRole('cell').nth(1)).toHaveText(
      value,
    )
    // Every value carries a page quote.
    await expect(
      criterionRow(page, label).getByText(/^hal\. \d+$/u),
    ).toHaveCount(1)
  }
  await expect(
    criterionRow(page, 'Tim').getByText(
      '“Tani Maju: pendiri pernah membangun dan keluar dari startup serupa.”',
    ),
  ).toBeVisible()

  // Tahap 2: every butir passes.
  const fit = card(page, 'Tahap 2 — Cek kecocokan')
  await expect(fit.locator('[data-slot="card-title"]')).toHaveText(
    'Tahap 2 — Cek kecocokan Lulus',
  )
  await expect(fit.getByText('agritech termasuk sektor fokus')).toBeVisible()
  await expect(fit.getByText('seed sesuai')).toBeVisible()
  await expect(fit.getByText('Rp5 M dalam rentang Rp1 M–Rp20 M')).toBeVisible()

  const kategori = card(page, /^Kategori$/u)
  await expect(fact(kategori, 'Dari kode')).toHaveText('Sangat cocok')
  await expect(fact(kategori, 'Efektif')).toHaveText('Sangat cocok')

  const profil = card(page, 'Profil')
  await expect(fact(profil, 'Sektor')).toHaveText('agritech')
  await expect(fact(profil, 'Tahap')).toHaveText('seed')
  await expect(fact(profil, 'Dana yang diminta')).toHaveText(
    /^Rp\s5\.000\.000\.000$/u,
  )
  await expect(fact(profil, 'Sumber')).toHaveText(
    'Form · Tani_Maju_pitchdeck.pdf',
  )
  // Seed: 10 pages → 7000 + 10·310 in, 1100 + 8·23 out.
  await expect(fact(profil, 'Token (masuk / keluar)')).toHaveText(
    '10.100 / 1.284',
  )

  await expect(
    card(page, 'Tanggapan').getByText('Belum ditanggapi.'),
  ).toBeVisible()
})

test('DSB-21 a good proposal outside the fund focus is Tidak cocok and marked Berkualitas, di luar fokus', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedkopirakyat')

  await expect(
    page.getByText('Tahap 1 — Skor kualitas 82,5', { exact: true }),
  ).toBeVisible()
  const fit = card(page, 'Tahap 2 — Cek kecocokan')
  await expect(fit.locator('[data-slot="card-title"]')).toHaveText(
    'Tahap 2 — Cek kecocokan Gagal',
  )
  await expect(fit.getByText('F&B di luar sektor fokus')).toBeVisible()

  const kategori = card(page, /^Kategori$/u)
  await expect(fact(kategori, 'Dari kode')).toHaveText('Tidak cocok')
  await expect(fact(kategori, 'Efektif')).toHaveText('Tidak cocok')
  await expect(
    kategori.getByText('Berkualitas, di luar fokus', { exact: true }),
  ).toBeVisible()
})

test('DSB-22 a perlu dicek manual proposal has no score, no category and no correction form', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedbengkelonline')

  await expect(
    page.getByText('Perlu dicek manual', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('teks terlalu sedikit (34 karakter di 12 halaman)'),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Tidak dinilai: deck perlu dicek manual, tanpa skor dan kategori.',
    ),
  ).toBeVisible()
  await expect(page.getByText('Belum ada cek kecocokan.')).toBeVisible()
  // The title carries no score at all.
  await expect(
    page.locator('[data-slot="card-title"]', { hasText: 'Tahap 1' }),
  ).toHaveText('Tahap 1 — Skor kualitas')

  const kategori = card(page, /^Kategori$/u)
  await expect(fact(kategori, 'Dari kode')).toHaveText('—')
  await expect(fact(kategori, 'Efektif')).toHaveText('—')
  await expect(page.getByText('Koreksi kategori', { exact: true })).toHaveCount(
    0,
  )
  await expect(fact(card(page, 'Profil'), 'Token (masuk / keluar)')).toHaveText(
    '0 / 0',
  )
})

test('DSB-23 a criterion whose quotes could not be found is capped at 2 and flagged', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedfashionista')

  const produk = criterionRow(page, 'Produk & keunggulan')
  await expect(produk.getByRole('cell').nth(1)).toHaveText('2/5')
  const badge = produk.getByText('kutipan tidak terverifikasi', { exact: true })
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute(
    'title',
    'Tidak ada kutipan yang ditemukan di halamannya, jadi nilai dibatasi 2',
  )
  await expect(produk.getByText(/^hal\. \d+$/u)).toHaveCount(0)
  // Only that criterion is flagged.
  await expect(page.getByText('kutipan tidak terverifikasi')).toHaveCount(1)
})

test('DSB-24 a corrected proposal keeps its code category and score beside the correction', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedpasarikan')

  // All five criteria at 3 → 50,0, a Kurang cocok score.
  await expect(
    page.getByText('Tahap 1 — Skor kualitas 50,0', { exact: true }),
  ).toBeVisible()
  const kategori = card(page, /^Kategori$/u)
  await expect(fact(kategori, 'Dari kode')).toHaveText('Kurang cocok')
  await expect(fact(kategori, 'Efektif')).toHaveText('Cocok')
  await expect(
    kategori.getByText(
      /^Dikoreksi ke Cocok \(\d{2} \S+ \d{4} \d{2}\.\d{2}, Dashboard\): Traksi di Muncar lebih kuat dari yang terbaca di deck$/u,
    ),
  ).toBeVisible()
  await expect(page.getByText('dikoreksi', { exact: true })).toBeVisible()

  const riwayat = card(page, 'Riwayat proposal ini')
  await expect(
    riwayat
      .getByRole('listitem')
      .filter({ hasText: 'Kategori Pasar Ikan dikoreksi' }),
  ).toContainText('Koreksi kategori')
})

test('DSB-25 Lihat log penilaian opens that proposal’s own job card', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  await page.getByRole('link', { name: 'Lihat log penilaian' }).click()

  await expect(page).toHaveURL(
    /\/aktivitas\?job=job-penilaian-tanimaju#job-job-penilaian-tanimaju$/u,
  )
  const job = page.locator('#job-job-penilaian-tanimaju')
  await expect(job).toHaveAttribute('open', '')
  await expect(job.locator('summary')).toContainText(
    'Menilai proposal Tani Maju',
  )
  await expect(
    job.getByText('Nilai 5 kriteria dengan kutipan halaman'),
  ).toBeVisible()
  // Exactly one card is open: the one the link named.
  await expect(page.locator('details[open]')).toHaveCount(1)
})

test('DSB-26 criteria and fit butir the deck does not mention read tidak disebut and fail', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedternakpintar')

  for (const label of ['Traksi', 'Model bisnis & keuangan']) {
    const row = criterionRow(page, label)
    await expect(row.getByRole('cell').nth(1)).toHaveText('1/5')
    await expect(row.getByText('tidak disebut', { exact: true })).toBeVisible()
  }
  const profil = card(page, 'Profil')
  await expect(fact(profil, 'Tahap')).toHaveText('tidak disebut')
  await expect(fact(profil, 'Dana yang diminta')).toHaveText('tidak disebut')

  const fit = card(page, 'Tahap 2 — Cek kecocokan')
  await expect(fit.locator('[data-slot="card-title"]')).toHaveText(
    'Tahap 2 — Cek kecocokan Gagal',
  )
  await expect(
    fit
      .getByRole('listitem')
      .filter({ hasText: 'tahap pendanaan tidak disebut' }),
  ).toContainText('Gagal')
  await expect(
    fit.getByRole('listitem').filter({ hasText: 'besar dana tidak disebut' }),
  ).toContainText('Gagal')
  await expect(fact(card(page, /^Kategori$/u), 'Efektif')).toHaveText(
    'Tidak cocok',
  )
})

test('DSB-27 a queued upload has no assessment and no log link yet', async ({
  page,
}) => {
  await page.goto('/proposal/upload-seedlogistiknusa')

  await expect(page.getByText('Antre', { exact: true })).toBeVisible()
  await expect(page.getByText('Belum ada penilaian.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Lihat log penilaian' }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buka deck' })).toBeVisible()
})

test('DSB-28 a responded proposal shows who responded, when, through what and the note', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedpanenkita')

  await expect(
    card(page, 'Tanggapan').getByText(
      /^Undang \d{2} \S+ \d{4} \d{2}\.\d{2} via WhatsApp — Jadwalkan pitching minggu depan$/u,
    ),
  ).toBeVisible()
  // The current response cannot be sent again.
  await expect(page.getByRole('button', { name: 'Undang' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Pantau' })).toBeEnabled()
})
