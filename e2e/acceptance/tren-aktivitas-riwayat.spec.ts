/**
 * Tren, Aktivitas AI and Riwayat — the audit readers. Totals are summed from
 * the shard's own `dailyStats`, `jobs` and `history` in the emulator, so a page
 * that drops a day or double-counts a kind cannot agree with them by accident.
 */
import { readFile } from 'node:fs/promises'

import type { Locator, Page } from '@playwright/test'

import {
  DAILY_STATS_COLLECTION,
  HISTORY_COLLECTION,
} from '../../features/aisa/aisa.path.ts'
import { sectorLabel } from '../../features/aisa/aisa.labels.ts'
import { emulatorDb, expect, signInAs, test } from './fixtures.ts'
import { exactly } from './locators.ts'

const idNumber = new Intl.NumberFormat('id-ID')
// The ISO date is already a WIB date, so it is formatted in UTC — as the page does.
const dayLabel = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})

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

/** The seed writes exactly 14 days, so this is also every row the 30-day KPIs read. */
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

/** Proposals per sector over `rows`, by the label the page shows. */
function weekSum(rows: StatsRow[]) {
  const sums = new Map<string, number>()
  for (const row of rows)
    for (const [raw, n] of Object.entries(row.bySector)) {
      const name = sectorLabel(raw)
      sums.set(name, (sums.get(name) ?? 0) + n)
    }
  return sums
}

/** A prototype chart panel (`.a-chart`) found by its heading. */
function panel(page: Page, heading: string): Locator {
  return page
    .locator('.a-chart')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/** A KPI tile (`.a-kpi`) found by its label. */
function kpi(page: Page, label: string): Locator {
  return page
    .locator('.a-kpi')
    .filter({ has: page.getByText(label, { exact: true }) })
}

/** A job card's summary, found by the job title. */
function job(page: Page, title: string): Locator {
  return page
    .locator('details.a-job > summary')
    .filter({ has: page.locator('.a-ttl', { hasText: exactly(title) }) })
}

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-30 Tren shows the latest insight and the 14 days of dailyStats', async ({
  page,
}) => {
  const stats = await dailyStats()
  await page.goto('/tren')

  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Yang menarik:' })
      .filter({ hasText: 'proposal agritech naik dibanding minggu lalu.' }),
  ).toContainText(/\(ringkasan 09\.00 · \d{2} \S+ \d{4}\)/u)

  // Every day's counts, per kategori and perlu dicek manual, read through the
  // chart's table.
  const perDay = panel(page, 'Proposal masuk per hari')
  await perDay.getByText('Lihat sebagai tabel').click()
  await Promise.all(
    stats.map((row) => {
      const label = dayLabel.format(new Date(`${row.date}T00:00:00Z`))
      const cells = perDay
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: label, exact: true }) })
        .getByRole('cell')
      return expect(cells).toHaveText([
        label,
        String(row.proposalsIn),
        String(row.byCategory.sangat_cocok ?? 0),
        String(row.byCategory.cocok ?? 0),
        String(row.byCategory.kurang_cocok ?? 0),
        String(row.byCategory.tidak_cocok ?? 0),
        String(row.perluDicekManual),
        /^(–|\d+,\d)$/u,
      ])
    }),
  )
  await expect(
    perDay.getByText(/^Kategori dari kode saat dinilai, sebelum koreksi/u),
  ).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({
      hasText: `${idNumber.format(sum(stats, (row) => row.perluDicekManual))} proposal perlu dicek manual.`,
    }),
  ).toHaveCount(1)

  // Per sector: this week's count and its difference from the week before.
  const ascending = stats.toReversed()
  const now = weekSum(ascending.slice(-7))
  const before = weekSum(ascending.slice(0, -7))
  const sectors = [...new Set([...now.keys(), ...before.keys()])]
    .map((name) => ({
      name,
      now: now.get(name) ?? 0,
      before: before.get(name) ?? 0,
    }))
    .toSorted((a, b) => b.now - a.now || b.before - a.before)
    .slice(0, 7)
  const sektor = panel(page, 'Proposal per sektor')
  await Promise.all(
    sectors.map((row) => {
      const delta = row.now - row.before
      return expect(
        sektor.getByText(row.name, { exact: true }).locator('..'),
      ).toContainText(`${row.now} (${delta >= 0 ? '+' : ''}${delta})`)
    }),
  )

  await expect(panel(page, 'Pemakaian token AI')).toContainText(
    `${idNumber.format(sum(stats, (row) => row.tokensIn + row.tokensOut))} token dalam 14 hari`,
  )
})

test('DSB-40 Aktivitas AI sums usage and labels every code step (kode) with 0 tokens', async ({
  page,
}) => {
  const stats = await dailyStats()
  await page.goto('/aktivitas')

  // The value is compact (`1,6 jt`); its exact total rides in the title.
  await expect(kpi(page, 'Token 30 hari').locator('.a-v')).toHaveAttribute(
    'title',
    idNumber.format(sum(stats, (row) => row.tokensIn + row.tokensOut)),
  )
  await expect(kpi(page, 'Panggilan model').locator('.a-v')).toHaveText(
    idNumber.format(sum(stats, (row) => row.modelCalls)),
  )

  // Render every loaded job, then read every step row: a code step is "(kode)"
  // with 0 tokens, a model step names its model and spent tokens.
  const more = page.getByRole('button', { name: /^Tampilkan \d+ lagi$/u })
  await expect(async () => {
    if (await more.isVisible()) {
      await more.click()
      throw new Error('more jobs left to show')
    }
  }).toPass()
  const steps = await page
    .locator('details.a-job tbody tr')
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
      expect(step.tokens, step.action).toBe('0')
    } else {
      expect(step.action, 'a step without (kode) names its model').toMatch(
        / · gemini-3\.8-flash$/u,
      )
      expect(step.tokens, step.action).not.toBe('0')
    }
  }

  // A job that called no model says so in its header, not with a model.
  await Promise.all(
    ['Menilai proposal Bengkel Online', 'Retensi harian'].map(async (title) => {
      const summary = job(page, title)
      await expect(summary.locator('.a-model')).toHaveText('kode · tanpa model')
      await expect(summary.getByTitle('0 masuk / 0 keluar')).toBeVisible()
    }),
  )
  const tani = job(page, 'Menilai proposal Tani Maju')
  await expect(tani.locator('.a-model')).toHaveText('gemini-3.8-flash')
  await expect(tani.locator('.a-agent')).toHaveText('Penilai')
  await expect(tani).toContainText('7 langkah')
  await expect(tani.getByTitle('10.100 masuk / 1.284 keluar')).toBeVisible()
  await expect(tani).toContainText('Selesai')

  const ringkasan = job(page, 'Ringkasan 09.00')
  await expect(ringkasan.locator('.a-agent')).toHaveText('Pembuat ringkasan')
  await expect(ringkasan).toContainText('6 langkah')
  await expect(ringkasan.getByTitle('3.800 masuk / 720 keluar')).toBeVisible()

  // An agent chip narrows the log to that agent's jobs.
  await page.getByRole('button', { name: 'Retensi', exact: true }).click()
  await expect(page.locator('details.a-job')).toHaveCount(1)
  await expect(job(page, 'Retensi harian')).toBeVisible()
  await page.getByRole('button', { name: 'Semua agent' }).click()

  // Opening a card shows its steps in the uniform format.
  await job(page, 'Menilai proposal Bengkel Online').click()
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
  ).toContainText('pypdf')

  // "Lihat log penilaian" links here with ?job=…; that card opens by itself.
  await page.goto(
    '/aktivitas?job=job-penilaian-rumahbelajar#job-job-penilaian-rumahbelajar',
  )
  await expect(page.locator('#job-job-penilaian-rumahbelajar')).toHaveAttribute(
    'open',
    '',
  )
})

test('DSB-50 Riwayat lists every audit row, newest first, and leaves a deleted proposal unlinked', async ({
  page,
}) => {
  const total = (
    await emulatorDb().collection(HISTORY_COLLECTION).count().get()
  ).data().count
  await page.goto('/riwayat')

  const tab = (name: string) =>
    page.getByRole('tab', { name: new RegExp(`^${name}\\s*\\d+$`, 'u') })
  const events = page
    .getByRole('listitem')
    .filter({ has: page.locator('time') })
  const event = (title: string | RegExp) => events.filter({ hasText: title })

  // Every row is on the timeline (the seed fits on one page of 40).
  await expect(tab('Semua')).toHaveAttribute('aria-selected', 'true')
  await expect(tab('Semua')).toContainText(String(total))
  await expect(events).toHaveCount(total)
  await expect(
    page.getByText(`Menampilkan ${total} dari ${total} kejadian`),
  ).toBeVisible()

  // Newest first: the rule version (15 days old) is the last event.
  await expect(events.last()).toContainText(
    'Aturan penilaian diperbarui ke versi 1',
  )

  const panen = event('Panen Kita diundang diskusi')
  await expect(panen).toContainText('“Jadwalkan pitching minggu depan”')
  await expect(panen).toContainText('Manajer')
  await expect(panen).toContainText('via WhatsApp')
  await expect(
    panen.getByRole('link', { name: 'Panen Kita', exact: true }),
  ).toHaveAttribute('href', '/proposal/form-seedpanenkita')

  await expect(event('Kategori Pasar Ikan dikoreksi')).toContainText(
    'Traksi di Muncar lebih kuat dari yang terbaca di proposal',
  )
  const aturan = event('Aturan penilaian diperbarui ke versi 1')
  await expect(aturan).toContainText('via Dashboard')
  await expect(
    aturan.getByRole('link', { name: 'Buka aturan penilaian' }),
  ).toHaveAttribute('href', '/aturan')

  // The ringkasan row opens to the digest it announced.
  await tab('Ringkasan WA').click()
  await expect(events).toHaveCount(1)
  await expect(event('Ringkasan pagi terkirim')).toContainText(
    'Ke WhatsApp · 11 proposal menunggu keputusan',
  )
  await page.getByRole('button', { name: 'Lihat isi' }).click()
  await expect(event('Ringkasan pagi terkirim')).toContainText('Dana UMKM (90)')

  await tab('STOP/LANJUT').click()
  await expect(events).toHaveCount(2)
  await expect(event('Pekerjaan AI dijeda (STOP)')).toContainText(
    'via WhatsApp',
  )
  await expect(event('Pekerjaan AI dilanjutkan (LANJUT)')).toBeVisible()

  // The retention deletion stays as audit, by the system, with nothing to link.
  await tab('Dihapus').click()
  await expect(events).toHaveCount(1)
  const deleted = event('Sebuah proposal dihapus')
  await expect(deleted).toContainText(
    'Data proposal dihapus (diarsipkan lebih dari 90 hari)',
  )
  await expect(deleted).toContainText('“retensi”')
  await expect(deleted).toContainText('Sistem')
  await expect(deleted.getByRole('link')).toHaveCount(0)
  await tab('Semua').click()
  await expect(page.locator('a[href*="seedlamaarsip"]')).toHaveCount(0)

  // Search narrows the timeline; the CSV carries exactly what is shown.
  await page.getByLabel('Cari riwayat').fill('Panen Kita')
  const shown = await events.count()
  expect(shown).toBeGreaterThan(0)
  for (const text of await events.allInnerTexts())
    expect(text).toContain('Panen Kita')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('riwayat-aisa.csv')
  const csv = (await readFile(await download.path(), 'utf8'))
    .replace(/^﻿/u, '')
    .split('\r\n')
  expect(csv[0]).toBe('Waktu,Jenis,Kejadian,Proposal,Pelaku,Kanal,Alasan')
  expect(csv).toHaveLength(shown + 1)
})
