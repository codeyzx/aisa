/**
 * Tren, Aktivitas AI and Riwayat — the audit readers. Totals are summed from
 * the shard's own `dailyStats` and `jobs` in the emulator, so a page that drops
 * a day or double-counts a kind cannot agree with them by accident.
 */
import type { Page } from '@playwright/test'

import { DAILY_STATS_COLLECTION } from '../../features/aisa/aisa.path.ts'
import { emulatorDb, expect, signInAs, test } from './fixtures.ts'
import { card } from './locators.ts'

const idNumber = new Intl.NumberFormat('id-ID')

interface StatsRow {
  date: string
  proposalsIn: number
  byCategory: Record<string, number>
  bySector: Record<string, number>
  perluDicekManual: number
  tokensIn: number
  tokensOut: number
  modelCalls: number
}

async function dailyStats(): Promise<StatsRow[]> {
  const snap = await emulatorDb()
    .collection(DAILY_STATS_COLLECTION)
    .orderBy('date', 'desc')
    .limit(14)
    .get()
  return snap.docs.map((doc) => doc.data() as StatsRow)
}

const sum = (rows: StatsRow[], pick: (row: StatsRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0)

function chart(page: Page, caption: string) {
  return page.getByRole('figure', { name: caption })
}

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-30 Tren shows the latest insight and the 14 days of dailyStats', async ({
  page,
}) => {
  const stats = await dailyStats()
  await page.goto('/tren')

  await expect(page.getByText('Insight terbaru')).toBeVisible()
  await expect(
    page.getByText(/^Dari ringkasan 09\.00 · \d{2} \S+ \d{4}$/u),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Yang menarik: proposal agritech naik dibanding minggu lalu.',
    ),
  ).toBeVisible()

  // Proposal masuk per hari: every day's value, read through "Lihat tabel".
  const perDay = chart(page, 'Proposal masuk per hari')
  await perDay.getByText('Lihat tabel').click()
  for (const row of stats) {
    const [, month, day] = row.date.split('-')
    await expect(
      perDay
        .getByRole('row')
        .filter({ hasText: `${day}/${month}` })
        .getByRole('cell'),
    ).toHaveText([
      `${day}/${month}`,
      `${idNumber.format(row.proposalsIn)} proposal`,
    ])
  }

  const kategori = card(page, 'Per kategori')
  for (const [key, label] of [
    ['sangat_cocok', 'Sangat cocok'],
    ['cocok', 'Cocok'],
    ['kurang_cocok', 'Kurang cocok'],
    ['tidak_cocok', 'Tidak cocok'],
  ] as const) {
    await expect(
      kategori
        .getByRole('listitem')
        .filter({ has: page.getByText(label, { exact: true }) }),
    ).toContainText(
      `${idNumber.format(sum(stats, (row) => row.byCategory[key] ?? 0))} proposal`,
    )
  }
  await expect(
    kategori.getByText(
      `Kategori dari kode saat dinilai. Ditambah ${sum(stats, (row) => row.perluDicekManual)} proposal perlu dicek manual (tanpa kategori).`,
    ),
  ).toBeVisible()

  const sektor = card(page, 'Per sektor')
  const sectorTotals = new Map<string, number>()
  for (const row of stats)
    for (const [name, n] of Object.entries(row.bySector))
      sectorTotals.set(name, (sectorTotals.get(name) ?? 0) + n)
  for (const [name, total] of sectorTotals) {
    await expect(
      sektor
        .getByRole('listitem')
        .filter({ has: page.getByText(name, { exact: true }) }),
    ).toContainText(`${idNumber.format(total)} proposal`)
  }
})

test('DSB-40 Aktivitas AI sums usage and labels every code step (kode) with 0 tokens', async ({
  page,
}) => {
  const stats = await dailyStats()
  await page.goto('/aktivitas')

  const stat = (label: string) => card(page, label)
  await expect(stat('Total token')).toContainText(
    idNumber.format(sum(stats, (row) => row.tokensIn + row.tokensOut)),
  )
  await expect(stat('Panggilan model')).toContainText(
    idNumber.format(sum(stats, (row) => row.modelCalls)),
  )

  // Every step row of every job card: a code step is "(kode)" with 0 / 0 tokens, a
  // model step names its model.
  const steps = await page
    .locator('section[aria-label="Pekerjaan"] details tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const cells = [...row.querySelectorAll('td')].map(
          (cell) => cell.textContent?.trim() ?? '',
        )
        return { action: cells[1] ?? '', tokens: cells[4] ?? '' }
      }),
    )
  expect(steps.length).toBeGreaterThan(0)
  for (const step of steps) {
    if (step.action.endsWith('(kode)')) {
      expect(step.tokens, step.action).toBe('0 / 0')
    } else {
      expect(step.action, 'a step without (kode) names its model').toMatch(
        / · gemini-3\.8-flash$/u,
      )
      expect(step.tokens, step.action).not.toBe('0 / 0')
    }
  }

  // A job that called no model is labelled (kode) in its header, not with a model.
  for (const title of ['Menilai proposal Bengkel Online', 'Retensi harian']) {
    const summary = page.locator('details > summary').filter({ hasText: title })
    await expect(summary.locator('code')).toHaveText('(kode)')
    await expect(summary).toContainText('0 / 0 token')
  }
  const tani = page
    .locator('details > summary')
    .filter({ hasText: 'Menilai proposal Tani Maju' })
  await expect(tani.locator('code')).toHaveText('gemini-3.8-flash')
  await expect(tani).toContainText('Penilai · Penilaian')
  await expect(tani).toContainText('5 langkah')
  await expect(tani).toContainText('10.100 / 1.284 token')
  await expect(tani).toContainText('Selesai')

  const ringkasan = page
    .locator('details > summary')
    .filter({ hasText: 'Ringkasan 09.00' })
  await expect(ringkasan).toContainText('Pembuat ringkasan · Ringkasan')
  await expect(ringkasan).toContainText('6 langkah')
  await expect(ringkasan).toContainText('3.800 / 720 token')

  // Opening a card shows its steps in the uniform format.
  await page
    .locator('details > summary')
    .filter({ hasText: 'Menilai proposal Bengkel Online' })
    .click()
  const bengkel = page.locator('#job-job-penilaian-bengkelonline')
  await expect(bengkel.getByRole('columnheader')).toHaveText([
    'Waktu',
    'Aksi',
    'Tool',
    'Data dibaca / ditulis',
    'Token masuk / keluar',
    'Durasi',
    'Status',
  ])
  await expect(
    bengkel
      .getByRole('row')
      .filter({ hasText: 'Ekstrak teks per halaman (kode)' }),
  ).toContainText('extract_text')
})

test('DSB-50 Riwayat lists every audit row, newest first, and leaves a deleted proposal unlinked', async ({
  page,
}) => {
  await page.goto('/riwayat')
  const body = page.getByRole('table').locator('tbody')

  // Seed: 3 rule/STOP/LANJUT rows, 14 proposal_masuk, 2 koreksi, 2 tanggapan,
  // 1 ringkasan, 1 retention deletion.
  await expect(body.getByRole('row')).toHaveCount(23)

  const deleted = body.getByRole('row').filter({ hasText: '(dihapus)' })
  await expect(deleted).toHaveCount(1)
  await expect(deleted.getByRole('cell')).toHaveText([
    /^\d{2} \S+ \d{4} \d{2}\.\d{2}$/u,
    'Proposal dihapus',
    '(dihapus)',
    'Data proposal dihapus (diarsipkan lebih dari 90 hari)',
    'retensi',
    'Sistem',
  ])
  await expect(deleted.getByRole('link')).toHaveCount(0)
  await expect(page.locator('a[href*="seedlamaarsip"]')).toHaveCount(0)

  const panen = body.getByRole('row').filter({ hasText: 'Panen Kita: undang' })
  await expect(panen.getByRole('cell')).toHaveText([
    /^\d{2} \S+ \d{4} \d{2}\.\d{2}$/u,
    'Tanggapan',
    'Panen Kita',
    'Panen Kita: undang',
    'Jadwalkan pitching minggu depan',
    'WhatsApp',
  ])
  await expect(panen.getByRole('link', { name: 'Panen Kita' })).toHaveAttribute(
    'href',
    '/proposal/form-seedpanenkita',
  )

  await expect(
    body.getByRole('row').filter({ hasText: 'Kategori Pasar Ikan dikoreksi' }),
  ).toContainText('Traksi di Muncar lebih kuat dari yang terbaca di deck')
  const aturan = body
    .getByRole('row')
    .filter({ hasText: 'Aturan penilaian versi 1 dibuat' })
  await expect(aturan.getByRole('cell').nth(1)).toHaveText('Aturan diubah')
  await expect(aturan.getByRole('cell').nth(2)).toHaveText('—')
  await expect(aturan.getByRole('cell').nth(5)).toHaveText('Dashboard')
  for (const action of ['STOP', 'LANJUT', 'Ringkasan terkirim']) {
    await expect(
      body
        .getByRole('row')
        .filter({ has: page.getByText(action, { exact: true }) }),
    ).toHaveCount(1)
  }

  // Newest first: the rule version (15 days old) is the last row.
  await expect(body.getByRole('row').last()).toContainText(
    'Aturan penilaian versi 1 dibuat',
  )
})
