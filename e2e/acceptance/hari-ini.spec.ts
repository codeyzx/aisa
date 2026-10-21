/**
 * Hari ini against the seed (`scripts/_seed-aisa.ts`). The expected numbers are
 * worked out from the seed's proposals with the overview's rules, not read off
 * the page: 14 proposals, 2 responded (Panen Kita, AplikasiX), so 12 belum
 * ditanggapi — of which 9 are scored, 2 perlu dicek manual, 1 antre. By
 * KATEGORI EFEKTIF: Sangat cocok 1 (Tani Maju), Cocok 4 (SawahKu, Klinik Desa,
 * Dana UMKM, and Pasar Ikan corrected from Kurang cocok), Kurang cocok 1
 * (BelajarYuk), Tidak cocok 3 (Kopi Rakyat, Fashionista, Ternak Pintar);
 * Berkualitas, di luar fokus 1 (Kopi Rakyat, 82,5 and outside the sectors).
 */
import {
  DIGESTS_COLLECTION,
  PROPOSALS_COLLECTION,
} from '../../features/aisa/aisa.path.ts'
import { emulatorDb, expect, signInAs, test, withRuntime } from './fixtures.ts'

const TILES = [
  ['Sangat cocok', 1],
  ['Cocok', 4],
  ['Kurang cocok', 1],
  ['Tidak cocok', 3],
  ['Berkualitas, di luar fokus', 1],
  ['Perlu dicek manual', 2],
] as const

const PAUSED_BANNER =
  'AI sedang dijeda (STOP). Proposal baru menunggu sebagai Antre sampai LANJUT di Pengaturan.'

function tiles(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: 'Belum ditanggapi per kategori' })
}

function tile(page: import('@playwright/test').Page, label: string) {
  return tiles(page)
    .getByRole('link')
    .filter({ has: page.getByText(label, { exact: true }) })
}

test('DSB-01 Hari ini counts every unresponded proposal by kategori efektif', async ({
  page,
}) => {
  await signInAs(page)

  await expect(
    page.getByText('12 proposal belum ditanggapi.', { exact: true }),
  ).toBeVisible()
  for (const [label, count] of TILES) {
    await expect(
      tile(page, label).getByText(String(count), { exact: true }),
      label,
    ).toBeVisible()
  }

  // "Baru sejak ringkasan terakhir" is every proposal created after the newest
  // digest — responded or not — read back from Firestore, not from the page.
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
  const baru = tile(page, 'Baru sejak ringkasan terakhir')
  await expect(baru.getByText(String(since), { exact: true })).toBeVisible()
  await expect(baru.getByText(/^Sejak \d{2} \S+ \d{4} 09\.00$/u)).toBeVisible()

  await expect(
    page.getByText(/^Ringkasan 09\.00 · \d{2} \S+ \d{4}$/u),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Yang menarik: proposal agritech naik dibanding minggu lalu.',
    ),
  ).toBeVisible()
})

test('DSB-02 Hari ini shows no STOP banner while AI runs, and the banner once paused', async ({
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
      await expect(page).toHaveURL(/\/pengaturan$/u)
      await expect(
        page.getByText('Dijeda (STOP)', { exact: true }),
      ).toBeVisible()
    },
  )
})

test('DSB-03 every Hari ini tile opens a list with the same count', async ({
  page,
}) => {
  await signInAs(page)
  for (const [label, count] of TILES) {
    await tile(page, label).click()
    await expect(page).toHaveURL(/\/proposal\?/u)
    await expect(
      page.getByText(`Menampilkan ${count} dari 14 proposal.`, { exact: true }),
      label,
    ).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/hari-ini$/u)
  }
})
