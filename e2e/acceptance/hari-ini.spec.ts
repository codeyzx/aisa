/**
 * The Dashboard (the AISA home that replaced Hari ini; `/hari-ini` redirects
 * here) against the seed (`scripts/_seed-aisa.ts`). The expected numbers are
 * worked out from the seed's proposals with the overview's rules, not read off
 * the page: 14 proposals, 2 responded (Panen Kita setuju, AplikasiX tolak),
 * so 12 belum ditanggapi — of which 9 are scored, 2 perlu dicek manual, 1
 * antre; the 11 that can be decided on are "Menunggu keputusan". By EFFECTIVE
 * grade (score bands 85/75/65/50 alone): Sangat layak 3 (Tani Maju, Dana UMKM,
 * Kopi Rakyat), Layak bersyarat 1 (Klinik Desa), Perlu penyesuaian 2 (SawahKu,
 * and Pasar Ikan corrected from Risiko tinggi), Risiko tinggi 1 (BelajarYuk),
 * Tidak layak 2 (Fashionista, Ternak Pintar), and 2 perlu dicek manual without
 * a grade. Di luar fokus 3 (Kopi Rakyat, Fashionista, Ternak Pintar): a failed
 * fit check lowers the priority, never the grade.
 */
import type { Locator, Page } from '@playwright/test'

import {
  DIGESTS_COLLECTION,
  PROPOSALS_COLLECTION,
} from '../../features/aisa/aisa.path.ts'
import { emulatorDb, expect, signInAs, test, withRuntime } from './fixtures.ts'

const STATS = [
  ['Menunggu keputusan', 11, /\/proposal\?tanggapan=belum$/u],
  ['Disarankan untuk Anda', 4, /\/proposal\?kategori=atas&tanggapan=belum$/u],
  ['Sudah ditanggapi', 2, /\/proposal\?tanggapan=sudah$/u],
  ['Total proposal', 14, /\/proposal$/u],
] as const

const CATEGORY_ROWS = [
  ['Sangat layak', 3, 'sangat_layak'],
  ['Layak bersyarat', 1, 'layak_bersyarat'],
  ['Perlu penyesuaian', 2, 'perlu_penyesuaian'],
  ['Risiko tinggi', 1, 'risiko_tinggi'],
  ['Tidak layak', 2, 'tidak_layak'],
] as const

const PAUSED_BANNER =
  'AI sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai LANJUT di Pengaturan.'

function linkWith(page: Page, text: string) {
  return page
    .getByRole('main')
    .getByRole('link')
    .filter({ has: page.getByText(text, { exact: true }) })
    .first()
}

function categoryRows(page: Page) {
  return page.getByRole('list', { name: 'Menunggu keputusan per grade' })
}

test('DSB-01 the Dashboard counts every unresponded proposal by effective grade', async ({
  page,
}) => {
  await signInAs(page)
  await expect(page).toHaveURL(/\/dashboard$/u)

  for (const [label, count] of STATS) {
    await expect(
      linkWith(page, label).getByText(String(count), { exact: true }),
      label,
    ).toBeVisible()
  }
  for (const [label, count] of CATEGORY_ROWS) {
    await expect(
      categoryRows(page)
        .getByRole('link')
        .filter({ has: page.getByText(label, { exact: true }) })
        .getByText(String(count), { exact: true }),
      label,
    ).toBeVisible()
  }
  await expect(
    categoryRows(page)
      .getByRole('listitem')
      .filter({ hasText: 'Perlu dicek manual' })
      .getByText('2', { exact: true }),
  ).toBeVisible()

  await expect(
    linkWith(page, 'Di luar fokus').getByText('3 proposal, prioritas rendah'),
  ).toBeVisible()
  await expect(
    linkWith(page, 'Perlu dicek manual').getByText(
      '2 proposal tidak bisa dinilai otomatis',
    ),
  ).toBeVisible()

  // "Sejak ringkasan" is every proposal created after the newest digest —
  // responded or not — read back from Firestore, not from the page.
  const digest = (
    await emulatorDb()
      .collection(DIGESTS_COLLECTION)
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get()
  ).docs[0]
  expect(digest, 'the seed ships a digest').toBeDefined()
  const sentAt = digest?.get('sentAt').toDate() as Date
  const since = (
    await emulatorDb()
      .collection(PROPOSALS_COLLECTION)
      .where('createdAt', '>', sentAt)
      .count()
      .get()
  ).data().count
  const baru = page
    .getByRole('main')
    .getByRole('link')
    .filter({ hasText: /^Sejak ringkasan 09\.00 · \d{2} \S+ \d{4}/u })
  await expect(
    baru.getByText(`${since} proposal baru masuk`, { exact: true }),
  ).toBeVisible()

  await expect(
    page.getByText(
      'Yang menarik: proposal agritech naik dibanding minggu lalu.',
    ),
  ).toBeVisible()
  await expect(
    page.getByText(/^Ringkasan 09\.00 · \d{2} \S+ \d{4}$/u),
  ).toBeVisible()
})

test('DSB-02 the Dashboard shows no STOP banner while AI runs, and the banner once paused', async ({
  page,
}) => {
  await signInAs(page)
  await expect(page.getByText(PAUSED_BANNER)).toHaveCount(0)

  await withRuntime(
    { paused: true, pausedAt: new Date(), pausedVia: 'wa' },
    async () => {
      await page.reload()
      await expect(page.getByText(PAUSED_BANNER)).toBeVisible()
      await page
        .getByText(PAUSED_BANNER)
        .getByRole('link', { name: 'Pengaturan' })
        .click()
      await expect(page).toHaveURL(/\/pengaturan\?tab=integrasi$/u)
      await expect(
        page.getByText('Dijeda (STOP)', { exact: true }),
      ).toBeVisible()
    },
  )
})

test('DSB-03 every Dashboard count opens the proposal list filtered the same way', async ({
  page,
}) => {
  await signInAs(page)
  const targets: [Locator, RegExp][] = [
    ...STATS.map(([label, , url]): [Locator, RegExp] => [
      linkWith(page, label),
      url,
    ]),
    ...CATEGORY_ROWS.map(([label, , category]): [Locator, RegExp] => [
      categoryRows(page)
        .getByRole('link')
        .filter({ has: page.getByText(label, { exact: true }) }),
      new RegExp(`/proposal\\?kategori=${category}&tanggapan=belum$`, 'u'),
    ]),
    [
      linkWith(page, 'Di luar fokus'),
      /\/proposal\?luarFokus=1&tanggapan=belum$/u,
    ],
    [
      linkWith(page, 'Perlu dicek manual'),
      /\/proposal\?status=perlu_dicek_manual&tanggapan=belum$/u,
    ],
  ]
  for (const [link, url] of targets) {
    await link.click()
    await expect(page).toHaveURL(url)
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/u)
  }
})

test('DSB-04 the old Hari ini address lands on the Dashboard', async ({
  page,
}) => {
  await signInAs(page)
  await page.goto('/hari-ini')
  await expect(page).toHaveURL(/\/dashboard$/u)
})
