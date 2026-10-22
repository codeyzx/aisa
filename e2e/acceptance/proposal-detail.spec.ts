/**
 * The proposal detail page, one variant per seeded shape. Expected values come
 * from the overview's rules applied to the seed (`scripts/_seed-aisa.ts`):
 * `skor = Σ bobot × (nilai − 1) / 4` with the baseline weights, the fit rules
 * (agritech/fintech/edtech/healthtech/climate · pre-seed/seed/seri-a ·
 * Rp1–20 M), and "a butir that is not mentioned fails the fit check".
 */
import type { Locator, Page } from '@playwright/test'

import {
  JOB_STEPS_SUBCOLLECTION,
  JOBS_COLLECTION,
  PROPOSALS_COLLECTION,
} from '../../features/aisa/aisa.path.ts'
import { emulatorDb, expect, signInAs, test, withRuntime } from './fixtures.ts'
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

  const log = page.getByRole('dialog', { name: 'Log penilaian' })
  await expect(log).toBeVisible()
  await expect(
    log.getByRole('heading', { name: 'AI menilai 5 kriteria' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(log).toHaveCount(0)

  await page.getByRole('button', { name: 'Cara AI menilai' }).click()
  await log.getByRole('link', { name: 'Semua aktivitas AI' }).click()
  await expect(page).toHaveURL(
    /\/aktivitas\?job=job-penilaian-tanimaju#job-job-penilaian-tanimaju$/u,
  )
  const job = page.locator('#job-job-penilaian-tanimaju')
  await expect(job).toHaveAttribute('open', '')
  await expect(job.locator('summary')).toContainText(
    'Menilai proposal Tani Maju',
  )
  await expect(job.getByText(/^Menilai 5 kriteria/u)).toBeVisible()
  // Exactly one card is open: the one the link named.
  await expect(page.locator('details[open]')).toHaveCount(1)
})

test('DSB-36 Log penilaian is a centred dialog with a timed timeline, start to finish', async ({
  page,
}) => {
  await page.goto('/proposal/form-seedpanenkita')
  await page.getByRole('button', { name: 'Lihat log penilaian' }).click()
  const log = page.getByRole('dialog', { name: 'Log penilaian' })
  await expect(log).toBeVisible()

  // Centred on the page, not docked to one side like a sheet.
  const box = await log.boundingBox()
  const viewport = page.viewportSize()
  expect(box && viewport).toBeTruthy()
  if (box && viewport) {
    const middle = box.x + box.width / 2
    expect(Math.abs(middle - viewport.width / 2)).toBeLessThan(4)
  }

  // Summary: how long, from when to when, tokens, model, who did what.
  await expect(log.getByText('Lama penilaian')).toBeVisible()
  await expect(
    log.getByText(/^\d{2}\.\d{2}\.\d{2} → \d{2}\.\d{2}\.\d{2}$/u),
  ).toBeVisible()
  await expect(log.getByText('gemini-3.8-flash', { exact: true })).toBeVisible()
  await expect(log.getByText('1 langkah AI', { exact: true })).toBeVisible()
  await expect(log.getByText('6 langkah Sistem', { exact: true })).toBeVisible()
  await expect(
    log.getByText('2 langkah Manajer', { exact: true }),
  ).toBeVisible()

  // The seven production steps in order, each with its clock time.
  const steps = log.getByRole('list', { name: 'Langkah penilaian' })
  await expect(steps.getByRole('heading', { level: 3 })).toHaveText([
    'Membaca teks tiap halaman',
    'Memeriksa deck bisa dibaca',
    'AI menilai 5 kriteria',
    'Menghitung skor',
    'Mencocokkan dengan fokus investasi',
    'Menentukan kategori',
    'Menyimpan hasil',
  ])
  const ai = steps.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'AI menilai 5 kriteria' }),
  })
  await expect(ai.locator('time').first()).toHaveText(/^\d{2}\.\d{2}\.\d{2}$/u)
  await expect(ai.getByText('21,4 dtk', { exact: true })).toBeVisible()
  await expect(
    ai.getByText('Menilai 5 kriteria · gemini.generate_content'),
  ).toBeVisible()

  // The rincian the proposal stores, for the steps that produced them.
  const skor = steps.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Menghitung skor' }),
  })
  await expect(skor.getByText(/^Hasil: Skor \d+,\d$/u)).toBeVisible()
  await skor.getByRole('button', { name: 'Lihat rincian' }).click()
  await expect(skor.getByText('Skor akhir')).toBeVisible()
  const kategori = steps.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Menentukan kategori' }),
  })
  await kategori.getByRole('button', { name: 'Lihat rincian' }).click()
  await expect(
    kategori.getByText(/^(Lolos|Tidak lolos) cek fokus/u),
  ).toBeVisible()

  // The manager's correction and response come after, behind a divider.
  await expect(
    log.getByText('Setelah penilaian', { exact: true }),
  ).toBeVisible()
  await expect(
    log
      .getByRole('list', { name: 'Keputusan manajer' })
      .getByRole('heading', { level: 3 }),
  ).toHaveText(['Koreksi kategori', 'Tanggapan'])
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
    page.getByRole('heading', { name: 'Menunggu giliran dinilai' }),
  ).toBeVisible()
  await expect(
    card(page, 'Nilai per kriteria').getByText('Belum ada penilaian.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Lihat log penilaian' }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buka deck' })).toBeVisible()

  // While STOP is on, a queued proposal says it waits for LANJUT.
  await withRuntime({ paused: true }, async () => {
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Penilaian dijeda' }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'AI sedang dijeda (STOP). Proposal ini akan dinilai setelah LANJUT.',
      ),
    ).toBeVisible()
  })
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

  // The link must open a second tab on the deck, not merely carry the href. A
  // popup is a new page, so only a context route keeps it off the real host.
  const opened: string[] = []
  await page.context().route(
    (url) => url.href === link.url,
    async (route) => {
      opened.push(route.request().url())
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF\n',
      })
    },
  )
  const popup = page.waitForEvent('popup')
  await panel.getByRole('link', { name: 'Buka di tab baru' }).click()
  await expect.poll(() => opened).toEqual([link.url])
  await (await popup).close()
  await expect(panel).toBeVisible()

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

const LIVE_ID = 'upload-e2eliveprogress'
const LIVE_JOB = 'penilaian-e2e-live'

/**
 * A proposal being scored, written the way `run_intake` writes one: the
 * proposal `dinilai_proses`, its job `berjalan` with `currentStep` set, and a
 * step doc per finished step. The spec then moves it along and removes it.
 */
async function liveAssessment() {
  const db = emulatorDb()
  const proposal = db.collection(PROPOSALS_COLLECTION).doc(LIVE_ID)
  const job = db.collection(JOBS_COLLECTION).doc(LIVE_JOB)
  const steps = job.collection(JOB_STEPS_SUBCOLLECTION)
  const old = new Date('2020-01-01T00:00:00Z')
  const now = Date.now()
  await proposal.set({
    name: 'Uji Langsung',
    nameLower: 'uji langsung',
    source: {
      kind: 'upload',
      gcsPath: `decks/${LIVE_ID}.pdf`,
      fileName: 'uji.pdf',
    },
    founder: null,
    consent: true,
    status: 'dinilai_proses',
    statusReason: null,
    pageCount: 8,
    responded: false,
    tokens: { in: 0, out: 0 },
    jobId: LIVE_JOB,
    createdAt: old,
    updatedAt: old,
  })
  await job.set({
    kind: 'penilaian',
    agent: 'Penilai',
    title: 'Menilai proposal Uji Langsung',
    model: 'gemini-3.8-flash',
    proposalId: LIVE_ID,
    status: 'berjalan',
    startedAt: new Date(now - 6_000),
    stepCount: 2,
    tokensIn: 0,
    tokensOut: 0,
    currentStep: {
      action: 'Menilai 5 kriteria',
      tool: 'gemini.generate_content',
      actor: 'model',
      startedAt: new Date(now - 4_000),
    },
  })
  let seq = 0
  const record = (
    action: string,
    tool: string,
    durationMs: number,
    actor = 'kode',
  ) => {
    seq += 1
    return steps.doc(String(seq).padStart(3, '0')).set({
      seq,
      at: new Date(),
      action,
      tool,
      actor,
      tokensIn: 0,
      tokensOut: 0,
      durationMs,
      status: 'ok',
    })
  }
  await record('Ekstrak teks per halaman', 'pypdf', 1_200)
  await record('Cek jumlah teks', 'kode', 4)
  return {
    proposal,
    job,
    record,
    async remove() {
      await db.recursiveDelete(job)
      await proposal.delete()
    },
  }
}

test('DSB-37 a proposal being scored shows its steps live, then its result', async ({
  page,
}) => {
  const live = await liveAssessment()
  try {
    await page.goto(`/proposal/${LIVE_ID}`)
    const progress = page.getByRole('region', {
      name: 'AISA sedang menilai proposal ini',
    })
    await expect(progress).toBeVisible()
    const steps = progress.getByRole('list', { name: 'Langkah penilaian' })
    const row = (title: string) =>
      steps.getByRole('listitem').filter({ hasText: title })

    // Finished steps carry their real duration; the model step is running.
    await expect(row('Membaca teks tiap halaman')).toHaveAttribute(
      'data-state',
      'selesai',
    )
    await expect(row('Membaca teks tiap halaman')).toContainText('1,2 dtk')
    const running = steps.locator('li[aria-current="step"]')
    await expect(running).toContainText('AI menilai 5 kriteria')
    await expect(running).toContainText('biasanya 15–25 detik')
    await expect(running).toContainText(/\d:\d{2}/u)
    await expect(row('Menghitung skor')).toHaveAttribute(
      'data-state',
      'menunggu',
    )

    // The API records the model step and starts the next: the card follows.
    await live.record(
      'Menilai 5 kriteria',
      'gemini.generate_content',
      21_400,
      'model',
    )
    await live.job.update({
      currentStep: {
        action: 'Hitung skor',
        tool: 'kode',
        actor: 'kode',
        startedAt: new Date(),
      },
    })
    await expect(row('AI menilai 5 kriteria')).toHaveAttribute(
      'data-state',
      'selesai',
    )
    await expect(row('AI menilai 5 kriteria')).toContainText('21,4 dtk')
    await expect(running).toContainText('Menghitung skor')

    // Between two steps there is no currentStep: the next one is "berikutnya".
    await live.record('Hitung skor', 'kode', 3)
    await live.job.update({ currentStep: null })
    await expect(row('Mencocokkan dengan fokus investasi')).toHaveAttribute(
      'data-state',
      'berikutnya',
    )
    await expect(running).toHaveCount(0)

    // Scored: a short success state, then the page shows the result.
    const seed = (
      await emulatorDb()
        .collection(PROPOSALS_COLLECTION)
        .doc('form-seedtanimaju')
        .get()
    ).data()
    await live.job.update({
      status: 'selesai',
      endedAt: new Date(),
      durationMs: 23_000,
    })
    await live.proposal.update({
      status: 'dinilai',
      assessment: seed?.assessment,
      fit: seed?.fit,
      category: seed?.category,
      effectiveCategory: seed?.category,
      profile: seed?.profile,
      assessedAt: new Date(),
    })
    // The page re-renders with the result, and says the assessment finished.
    await expect(header(page).getByText('92,5', { exact: true })).toBeVisible()
    const done = page.getByRole('region', { name: 'Penilaian selesai' })
    await expect(done).toContainText('Penilaian selesai dalam 23 dtk.')
    await done.getByRole('button', { name: 'Lihat langkahnya' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Log penilaian' }),
    ).toBeVisible()
  } finally {
    await live.remove()
  }
})

test('DSB-38 a run that fails says why and that it went back to the queue', async ({
  page,
}) => {
  const live = await liveAssessment()
  try {
    await live.job.update({
      status: 'gagal',
      currentStep: null,
      endedAt: new Date(),
    })
    await live.proposal.update({
      status: 'antre',
      statusReason: 'gagal diproses: model tidak menjawab',
    })
    await page.goto(`/proposal/${LIVE_ID}`)
    const progress = page.getByRole('region', { name: 'Penilaian gagal' })
    await expect(progress).toBeVisible()
    await expect(
      progress.getByText(
        'Gagal diproses: model tidak menjawab. Proposal kembali ke antrean dan dinilai lagi setelah perintah LANJUT.',
      ),
    ).toBeVisible()
    await expect(
      progress
        .getByRole('listitem')
        .filter({ hasText: 'AI menilai 5 kriteria' }),
    ).toHaveAttribute('data-state', 'dilewati')
  } finally {
    await live.remove()
  }
})
