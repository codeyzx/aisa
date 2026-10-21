/**
 * The proposal detail page, one variant per seeded shape. Expected values come
 * from the overview's rules applied to the seed (`scripts/_seed-aisa.ts`):
 * `skor = Σ bobot × (nilai − 1) / 4` with the baseline weights, the fit rules
 * (agritech/fintech/edtech/healthtech/climate · pre-seed/seed/seri-a ·
 * Rp1–20 M), and "a butir that is not mentioned fails the fit check".
 */
import type { Locator, Page } from '@playwright/test'

import { expect, signInAs, test } from './fixtures.ts'
import { card } from './locators.ts'
import { deckLinkFor } from './mock-aisa-api.ts'

function criterion(page: Page, key: string): Locator {
  return page.locator(`li[data-criterion="${key}"]`)
}

/** The page's first card: name, profile facts, badges and the score box. */
const header = (page: Page) => page.locator('[data-slot="card"]').first()

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-20 a scored, fitting proposal shows both stages, quotes and tokens', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedtanimaju')

  await expect(
    page.getByRole('heading', { level: 2, name: 'Tani Maju' }),
  ).toBeVisible()
  const top = header(page)
  await expect(
    top.getByText('Platform pembiayaan dan input pertanian untuk petani padi.'),
  ).toBeVisible()
  await expect(top.getByText('Agritech', { exact: true })).toBeVisible()
  await expect(top.getByText('seed', { exact: true })).toBeVisible()
  await expect(top.getByText(/^Cari Rp\s5\.000\.000\.000$/u)).toBeVisible()
  await expect(top.getByText('Sangat cocok', { exact: true })).toBeVisible()

  // Tahap 1: 0,275·1 + 0,3·1 + 0,2·0,75 + 0,125·1 + 0,1·0,75 = 92,5
  await expect(top.getByText('92,5', { exact: true })).toBeVisible()
  await expect(
    card(page, 'Nilai per kriteria').getByText(
      'Aturan v1 · model gemini-3.8-flash.',
    ),
  ).toBeVisible()
  for (const [key, value] of [
    ['tim', '5/5'],
    ['pasar', '5/5'],
    ['produk', '4/5'],
    ['traksi', '5/5'],
    ['bisnis', '4/5'],
  ] as const) {
    await expect(
      criterion(page, key).getByText(value, { exact: true }),
    ).toBeVisible()
    // Every value carries a page quote.
    await expect(criterion(page, key).getByText(/^Hal\. \d+$/u)).toHaveCount(1)
  }
  await expect(
    criterion(page, 'tim').getByText(
      '“Tani Maju: pendiri pernah membangun dan keluar dari startup serupa.”',
    ),
  ).toBeVisible()

  // Tahap 2: every butir passes.
  await expect(
    top.getByText('3 dari 3 syarat fokus terpenuhi', { exact: true }),
  ).toBeVisible()
  const fit = card(page, 'Sesuai fokus investasi?')
  await expect(fit.getByText('agritech termasuk sektor fokus')).toBeVisible()
  await expect(fit.getByText('seed sesuai')).toBeVisible()
  await expect(fit.getByText('Rp5 M dalam rentang Rp1 M–Rp20 M')).toBeVisible()

  await expect(
    card(page, 'Founder').getByText(
      'Form · Tani_Maju_pitchdeck.pdf · 10 halaman',
    ),
  ).toBeVisible()
  // Seed: 10 pages → 7000 + 10·310 in, 1100 + 8·23 out.
  await expect(
    page.getByTitle('10.100 token masuk / 1.284 token keluar'),
  ).toHaveText('Dibuat dari pitch deck · 11,4 rb token')

  await expect(
    card(page, 'Keputusan Anda').getByText('Belum ditanggapi', { exact: true }),
  ).toBeVisible()
})

test('DSB-21 a good proposal outside the fund focus is Tidak cocok and marked Berkualitas, di luar fokus', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedkopirakyat')

  const top = header(page)
  await expect(top.getByText('82,5', { exact: true })).toBeVisible()
  await expect(
    top.getByText('2 dari 3 syarat fokus terpenuhi', { exact: true }),
  ).toBeVisible()
  const fit = card(page, 'Sesuai fokus investasi?')
  await expect(fit.getByText('F&B di luar sektor fokus')).toBeVisible()

  await expect(top.getByText('Tidak cocok', { exact: true })).toBeVisible()
  await expect(
    top.getByText('Berkualitas, di luar fokus', { exact: true }),
  ).toBeVisible()
})

test('DSB-22 a perlu dicek manual proposal has no score, no category and no correction form', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedbengkelonline')

  const top = header(page)
  await expect(
    top.getByText('Perlu dicek manual', { exact: true }),
  ).toBeVisible()
  await expect(
    top.getByText('teks terlalu sedikit (34 karakter di 12 halaman)'),
  ).toBeVisible()
  await expect(
    card(page, 'Nilai per kriteria').getByText(
      'Tidak dinilai: deck perlu dicek manual, tanpa skor dan kategori.',
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Belum ada cek kecocokan.', { exact: true }),
  ).toBeVisible()
  // No score at all: the score box is a dash, and there is no AI summary.
  await expect(top.getByText('—', { exact: true })).toBeVisible()
  await expect(page.getByText('Ringkasan AI')).toHaveCount(0)

  for (const category of [
    'Sangat cocok',
    'Cocok',
    'Kurang cocok',
    'Tidak cocok',
  ]) {
    await expect(top.getByText(category, { exact: true })).toHaveCount(0)
  }
  await expect(card(page, 'Kategori kurang pas?')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Simpan koreksi' }),
  ).toHaveCount(0)
})

test('DSB-23 a criterion whose quotes could not be found is capped at 2 and flagged', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedfashionista')

  const produk = criterion(page, 'produk')
  await expect(produk.getByText('2/5', { exact: true })).toBeVisible()
  const badge = produk.getByText('kutipan tidak terverifikasi', { exact: true })
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute(
    'title',
    'Tidak ada kutipan yang ditemukan di halamannya, jadi nilai dibatasi 2',
  )
  await expect(produk.getByText(/^Hal\. \d+$/u)).toHaveCount(0)
  // Only that criterion is flagged.
  await expect(page.getByText('kutipan tidak terverifikasi')).toHaveCount(1)
})

test('DSB-24 a corrected proposal keeps its code category and score beside the correction', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedpasarikan')

  // All five criteria at 3 → 50,0, a Kurang cocok score.
  const top = header(page)
  await expect(top.getByText('50,0', { exact: true })).toBeVisible()
  await expect(top.getByText('Cocok', { exact: true })).toBeVisible()
  await expect(top.getByText('dikoreksi', { exact: true })).toBeVisible()
  await expect(
    card(page, 'Kategori kurang pas?').getByText(
      /^AI menilai Kurang cocok, lalu dikoreksi ke Cocok \(\d{1,2} \S+ \d{4}, \d{2}\.\d{2}, Dashboard\): “Traksi di Muncar lebih kuat dari yang terbaca di deck”\.$/u,
    ),
  ).toBeVisible()

  const riwayat = card(page, 'Riwayat')
  await expect(
    riwayat
      .getByRole('listitem')
      .filter({ hasText: 'Kategori Pasar Ikan dikoreksi' }),
  ).toContainText('Koreksi kategori')
})

test('DSB-25 Lihat log penilaian opens that proposal’s own job log', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedtanimaju')
  await page.getByRole('button', { name: 'Lihat log penilaian' }).click()

  const sheet = page.getByRole('dialog', { name: 'Log penilaian' })
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByText('Nilai 5 kriteria dengan kutipan halaman'),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  await page.getByRole('button', { name: 'Cara AI menilai' }).click()
  await sheet.getByRole('link', { name: 'Semua aktivitas AI' }).click()
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

  for (const key of ['traksi', 'bisnis']) {
    const item = criterion(page, key)
    await expect(item.getByText('1/5', { exact: true })).toBeVisible()
    await expect(item.getByText('Tidak dibahas di pitch deck')).toBeVisible()
    await expect(item.getByText('(tidak disebut)')).toHaveCount(1)
  }
  const top = header(page)
  await expect(
    top.getByText('Tahap tidak disebut', { exact: true }),
  ).toBeVisible()
  await expect(
    top.getByText('Dana tidak disebut', { exact: true }),
  ).toBeVisible()

  await expect(
    top.getByText('1 dari 3 syarat fokus terpenuhi', { exact: true }),
  ).toBeVisible()
  const fit = card(page, 'Sesuai fokus investasi?')
  await expect(
    fit
      .getByRole('listitem')
      .filter({ hasText: 'tahap pendanaan tidak disebut' }),
  ).toContainText('Tahap')
  await expect(
    fit.getByRole('listitem').filter({ hasText: 'besar dana tidak disebut' }),
  ).toContainText('Dana')
  await expect(top.getByText('Tidak cocok', { exact: true })).toBeVisible()
})

test('DSB-27 a queued upload has no assessment and no log link yet', async ({
  page,
}) => {
  await page.goto('/proposal/upload-seedlogistiknusa')

  await expect(header(page).getByText('Antre', { exact: true })).toBeVisible()
  await expect(
    card(page, 'Nilai per kriteria').getByText('Belum ada penilaian.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Lihat log penilaian' }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buka deck' })).toBeVisible()
})

test('DSB-28 a responded proposal shows who responded, when, through what and the note', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedpanenkita')

  const keputusan = card(page, 'Keputusan Anda')
  await expect(
    keputusan.getByText(
      /^Sekarang: Diundang · \d{1,2} \S+ \d{4}, \d{2}\.\d{2} via WhatsApp$/u,
    ),
  ).toBeVisible()
  await expect(
    keputusan.getByText('“Jadwalkan pitching minggu depan”', { exact: true }),
  ).toBeVisible()
  // The current response cannot be sent again.
  await expect(
    keputusan.getByRole('button', { name: /^Undang/u }),
  ).toBeDisabled()
  await expect(
    keputusan.getByRole('button', { name: /^Pantau/u }),
  ).toBeEnabled()
})

/**
 * The preview frames the real hosts `deckLinkFor` answers with, so each spec
 * intercepts them: a hit proves the browser was allowed to frame that origin
 * under the shipped `frame-src`, without the suite reaching Google.
 */
async function interceptDeckHosts(page: Page): Promise<string[]> {
  const framed: string[] = []
  await page.route('https://storage.googleapis.com/**', async (route) => {
    framed.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: '%PDF-1.4\n%%EOF\n',
    })
  })
  await page.route('https://drive.google.com/**', async (route) => {
    framed.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<p>Drive</p>',
    })
  })
  return framed
}

const previewPanel = (page: Page) =>
  page.getByRole('dialog', { name: 'Pratinjau deck' })

test('DSB-31 Pratinjau deck opens the uploaded deck in a panel and keeps a fresh link on reopen', async ({
  page,
  aisaApi,
}) => {
  const framed = await interceptDeckHosts(page)
  const link = deckLinkFor('upload-seedklinikdesa')
  await page.goto('/proposal/upload-seedklinikdesa')

  // Nothing is asked of the API until the panel opens.
  await expect(
    page.getByRole('button', { name: 'Pratinjau deck', exact: true }),
  ).toBeVisible()
  expect(aisaApi.calls).toEqual([])

  await page
    .getByRole('button', { name: 'Pratinjau deck', exact: true })
    .click()
  const panel = previewPanel(page)
  await expect(panel).toBeVisible()
  await expect(
    panel.getByText('Klinik_Desa_pitchdeck.pdf', { exact: true }),
  ).toBeVisible()
  await expect(panel.getByText('· 12 halaman', { exact: true })).toBeVisible()
  const frame = panel.locator('iframe')
  await expect(frame).toHaveAttribute('src', link.previewUrl)
  await expect(frame).toHaveAttribute(
    'title',
    'Pitch deck Klinik_Desa_pitchdeck.pdf',
  )
  await expect(
    panel.getByRole('link', { name: 'Buka di tab baru' }),
  ).toHaveAttribute('href', link.url)
  await expect.poll(() => framed).toEqual([link.previewUrl])
  expect(aisaApi.calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'GET /api/proposals/upload-seedklinikdesa/deck-url',
  ])

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  // Reopened inside the link's lifetime: the same link, no second request.
  await page
    .getByRole('button', { name: 'Pratinjau deck', exact: true })
    .click()
  await expect(previewPanel(page).locator('iframe')).toHaveAttribute(
    'src',
    link.previewUrl,
  )
  expect(aisaApi.calls).toHaveLength(1)
})

test('DSB-32 a page citation opens the preview at that page, from the criteria and from Log penilaian', async ({
  page,
}) => {
  await interceptDeckHosts(page)
  const link = deckLinkFor('upload-seedklinikdesa')
  await page.goto('/proposal/upload-seedklinikdesa')

  // Seed: criterion n quotes page 2 + n (produk is the third → hal. 4).
  await criterion(page, 'produk')
    .getByRole('button', { name: 'Buka pratinjau deck di halaman 4' })
    .click()
  const panel = previewPanel(page)
  await expect(panel.locator('iframe')).toHaveAttribute(
    'src',
    `${link.previewUrl}#page=4`,
  )
  await expect(panel.getByText('hal. 4', { exact: true })).toBeVisible()
  await expect(
    panel.getByRole('link', { name: 'Buka di tab baru' }),
  ).toHaveAttribute('href', `${link.url}#page=4`)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await page.getByRole('button', { name: 'Lihat log penilaian' }).click()
  const log = page.getByRole('dialog', { name: 'Log penilaian' })
  await log
    .getByRole('button', { name: 'Buka pratinjau deck di halaman 3' })
    .click()
  await expect(panel.locator('iframe')).toHaveAttribute(
    'src',
    `${link.previewUrl}#page=3`,
  )
  // Closing the preview returns to the log it was opened from.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(log).toBeVisible()
})

test('DSB-33 a Form deck previews in Drive from page 1 and says which page the quote is on', async ({
  page,
}) => {
  const framed = await interceptDeckHosts(page)
  const link = deckLinkFor('form-seedtanimaju')
  await page.goto('/proposal/form-seedtanimaju')

  // A Form deck lives in Drive: preview, no "Buka deck" for an upload link.
  await expect(page.getByRole('button', { name: 'Buka deck' })).toHaveCount(0)
  await criterion(page, 'tim')
    .getByRole('button', { name: 'Buka pratinjau deck di halaman 2' })
    .click()
  const panel = previewPanel(page)
  await expect(panel.locator('iframe')).toHaveAttribute('src', link.previewUrl)
  await expect(panel.getByText('hal. 2', { exact: true })).toBeVisible()
  await expect(
    panel.getByText(
      /^Pratinjau Drive selalu mulai dari halaman 1; gulir ke hal\. 2\./u,
    ),
  ).toBeVisible()
  await expect.poll(() => framed).toEqual([link.previewUrl])
})

test('DSB-34 with no preview link the panel offers Buka deck instead of a frame', async ({
  page,
  aisaApi,
}) => {
  const link = deckLinkFor('upload-seedklinikdesa')
  aisaApi.answerNext({
    status: 200,
    body: { url: link.url, previewUrl: null, expiresIn: 900 },
  })
  await page.goto('/proposal/upload-seedklinikdesa')
  await page
    .getByRole('button', { name: 'Pratinjau deck', exact: true })
    .click()

  const panel = previewPanel(page)
  await expect(
    panel.getByText('Pratinjau tidak tersedia untuk deck ini.'),
  ).toBeVisible()
  await expect(panel.locator('iframe')).toHaveCount(0)
  await expect(panel.getByRole('link', { name: 'Buka deck' })).toHaveAttribute(
    'href',
    link.url,
  )
})

test('DSB-35 a deck link the API refuses shows its message in the panel with Coba lagi', async ({
  page,
  aisaApi,
}) => {
  await interceptDeckHosts(page)
  aisaApi.refuseNext({ status: 404, detail: 'deck tidak ditemukan' })
  await page.goto('/proposal/upload-seedklinikdesa')
  await page
    .getByRole('button', { name: 'Pratinjau deck', exact: true })
    .click()

  const panel = previewPanel(page)
  await expect(panel.getByText('Deck tidak bisa dibuka.')).toBeVisible()
  await expect(panel.getByText('deck tidak ditemukan')).toBeVisible()
  await panel.getByRole('button', { name: 'Coba lagi' }).click()
  await expect(panel.locator('iframe')).toHaveAttribute(
    'src',
    deckLinkFor('upload-seedklinikdesa').previewUrl,
  )
  expect(aisaApi.calls).toHaveLength(2)
})
