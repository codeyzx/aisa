/**
 * Biaya AI against the shard's emulator. Every expected amount is priced here
 * from the shard's own `dailyStats` and `jobs` with the same pricing module the
 * page reads, so a page that drops a day, prices a day at the wrong tariff, or
 * averages over the wrong population cannot agree with it by accident.
 */
import type { Locator, Page } from '@playwright/test'

import {
  DAILY_STATS_COLLECTION,
  JOBS_COLLECTION,
  SETTINGS_COLLECTION,
  RULES_DOC_ID,
} from '../../features/aisa/aisa.path.ts'
import {
  PRICING_SOURCE,
  ratesOn,
  tokenCost,
  USD_IDR,
} from '../../features/aisa/aisa.pricing.ts'
import { emulatorDb, expect, signInAs, test } from './fixtures.ts'

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
/** The page's `formatRupiah`, with U+00A0 collapsed for a plain-text match. */
const idr = (usd: number) =>
  rupiah.format(usd * USD_IDR.rate).replace(/\s+/gu, ' ')
const wibDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

interface Tokens {
  in: number
  out: number
}
interface StatsRow {
  date: string
  tokensByKind: Record<string, Tokens>
}
interface JobRow {
  kind: string
  model: string | null
  proposalId: string | null
  startedAt: { toDate(): Date }
  tokensIn: number
  tokensOut: number
}

async function rulesModels(): Promise<Record<string, string>> {
  const snap = await emulatorDb()
    .collection(SETTINGS_COLLECTION)
    .doc(RULES_DOC_ID)
    .get()
  return (snap.data() as { models: Record<string, string> }).models
}

/** Total and per-kind cost from dailyStats, each day at its own tariff. */
async function dailyCost() {
  const models = await rulesModels()
  const modelOf: Record<string, string | undefined> = {
    penilaian: models.penilai,
    ringkasan: models.ringkasan,
    asisten: models.asisten,
  }
  const snap = await emulatorDb().collection(DAILY_STATS_COLLECTION).get()
  const byKind: Record<string, number> = {}
  let total = 0
  for (const row of snap.docs.map((doc) => doc.data() as StatsRow)) {
    for (const [kind, tokens] of Object.entries(row.tokensByKind)) {
      const rates = ratesOn(modelOf[kind], row.date)
      if (!rates) continue
      const usd = tokenCost(tokens, rates).usd
      byKind[kind] = (byKind[kind] ?? 0) + usd
      total += usd
    }
  }
  return { total, byKind }
}

async function jobs(): Promise<JobRow[]> {
  const snap = await emulatorDb().collection(JOBS_COLLECTION).get()
  return snap.docs.map((doc) => doc.data() as JobRow)
}

const jobUsd = (
  job: JobRow,
  isoDate = wibDate.format(job.startedAt.toDate()),
) => {
  const rates = ratesOn(job.model, isoDate)
  if (!rates) throw new Error(`no tariff for ${job.model}`)
  return tokenCost({ in: job.tokensIn, out: job.tokensOut }, rates).usd
}

/** Mean penilaian cost per proposal: a proposal's jobs are summed first. */
function perProposal(all: JobRow[], isoDate?: string) {
  const sums = new Map<string, number>()
  for (const job of all) {
    if (job.kind !== 'penilaian' || !job.proposalId) continue
    if (job.tokensIn + job.tokensOut === 0) continue
    sums.set(
      job.proposalId,
      (sums.get(job.proposalId) ?? 0) + jobUsd(job, isoDate),
    )
  }
  const values = [...sums.values()]
  return {
    n: values.length,
    usd: values.reduce((a, b) => a + b, 0) / values.length,
  }
}

function tile(page: Page, label: string): Locator {
  return page
    .locator('.a-tile')
    .filter({ has: page.getByText(label, { exact: true }) })
}

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-45 Biaya AI prices recorded usage and compares it with manual screening', async ({
  page,
}) => {
  const [cost, allJobs] = await Promise.all([dailyCost(), jobs()])
  const proposal = perProposal(allJobs)
  expect(proposal.n).toBeGreaterThan(0)

  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'Biaya AI' }).first().click()
  await expect(page).toHaveURL(/\/biaya$/u)
  await expect(page.getByRole('heading', { name: 'Biaya AI' })).toBeVisible()

  // The hero tiles: the dailyStats total and the jobs-based averages.
  await expect(tile(page, 'Total biaya AI').locator('.a-v')).toHaveText(
    idr(cost.total),
  )
  await expect(tile(page, 'Per proposal dinilai').locator('.a-v')).toHaveText(
    idr(proposal.usd),
  )
  await expect(tile(page, 'Per proposal dinilai')).toContainText(
    `rata-rata ${proposal.n} proposal`,
  )
  const asisten = allJobs.filter(
    (job) => job.kind === 'asisten' && job.tokensIn + job.tokensOut > 0,
  )
  if (asisten.length === 0)
    await expect(tile(page, 'Per pertanyaan Asisten')).toContainText(
      'Belum ada pertanyaan ke Asisten',
    )
  const credit = tile(page, 'Kredit uji coba $300')
  await expect(credit).toContainText(
    'Bila pemakaian ini ditagihkan ke kredit uji coba Google Cloud',
  )

  // Ke mana biayanya: the Penilai row carries its own dailyStats cost.
  await expect(page.locator('li[data-kind="penilaian"]')).toContainText(
    idr(cost.byKind.penilaian ?? 0),
  )

  // The calculator: set the assumptions, read the per-proposal comparison.
  const calc = page.locator('section', {
    has: page.getByRole('heading', { name: 'AISA vs cek manual' }),
  })
  await calc.getByLabel('Proposal per bulan').fill('100')
  await calc.getByLabel('Menit analis per deck').fill('15')
  await calc.getByLabel('Menit membaca hasil AISA').fill('2')
  await expect(page).toHaveURL(/[?&]proposal=100(&|$)/u)
  const perMinute = 14_500_000 / 173 / 60
  const manualPer = rupiah.format(15 * perMinute).replace(/\s+/gu, ' ')
  const row = (name: string) =>
    calc
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name, exact: true }) })
  await expect(row('Total').getByRole('cell').nth(1)).toHaveText(manualPer)
  await expect(row('Biaya AI').getByRole('cell').nth(2)).toHaveText(
    idr(proposal.usd),
  )
  await expect(calc.getByTestId('hemat-bulan')).not.toHaveText('Rp 0')
  await expect(calc).toContainText('lebih murah')

  // The 2027 tariff reprices the same tokens at the standard price.
  await calc.getByRole('button', { name: 'Mulai 1 Jan 2027' }).click()
  await expect(row('Biaya AI').getByRole('cell').nth(2)).toHaveText(
    idr(perProposal(allJobs, '2027-01-01').usd),
  )

  // Sources are stated, with the official pricing page linked.
  await page.getByText('Cara menghitung dan sumber').click()
  await expect(
    page.getByRole('link', { name: 'halaman harga Vertex AI' }),
  ).toHaveAttribute('href', PRICING_SOURCE.url)
  await expect(page.getByText(/Kurs acuan: Rp\s17\.917 per USD/u)).toBeVisible()
})
