/**
 * The Proposal list's filters against the seed. Each expected row set is worked
 * out from the seed's proposals (`scripts/_seed-aisa.ts`), newest first, with
 * the filter's meaning from the overview and GLOSSARY: "kategori" filters the
 * KATEGORI EFEKTIF (a corrected proposal is listed under its correction), and
 * an unknown URL value means "no filter", never an error page.
 */
import type { Page } from '@playwright/test'

import { expect, signInAs, test } from './fixtures.ts'

/** Every seeded proposal, newest first (`createdAt` desc). */
const ALL = [
  'Logistik Nusantara',
  'Ternak Pintar',
  'Tani Maju',
  'Bengkel Online',
  'SawahKu',
  'Klinik Desa',
  'Kopi Rakyat',
  'Dana UMKM',
  'Rumah Belajar',
  'BelajarYuk',
  'Panen Kita',
  'Fashionista',
  'Pasar Ikan',
  'AplikasiX',
]

const only = (...names: string[]) => ALL.filter((name) => names.includes(name))

async function expectRows(page: Page, names: string[]) {
  await expect(page.getByRole('table').getByRole('link')).toHaveText(names)
  await expect(
    page.getByText(`Menampilkan ${names.length} dari 14 proposal.`, {
      exact: true,
    }),
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-10 the unfiltered list shows every proposal, newest first', async ({
  page,
}) => {
  await page.goto('/proposal')
  await expectRows(page, ALL)
})

test('DSB-11 kategori filters the kategori efektif, so a correction moves the row', async ({
  page,
}) => {
  await page.goto('/proposal?kategori=sangat_cocok')
  await expectRows(page, only('Tani Maju', 'Panen Kita'))

  // Pasar Ikan scored Kurang cocok and was corrected to Cocok.
  await page.goto('/proposal?kategori=cocok')
  await expectRows(
    page,
    only('SawahKu', 'Klinik Desa', 'Dana UMKM', 'Pasar Ikan'),
  )
  const pasarIkan = page.getByRole('row').filter({ hasText: 'Pasar Ikan' })
  await expect(pasarIkan.getByText('Cocok', { exact: true })).toBeVisible()
  await expect(pasarIkan.getByText('dikoreksi', { exact: true })).toBeVisible()

  await page.goto('/proposal?kategori=kurang_cocok')
  await expectRows(page, only('BelajarYuk'))

  await page.goto('/proposal?kategori=tidak_cocok')
  await expectRows(
    page,
    only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista', 'AplikasiX'),
  )
})

test('DSB-12 status separates perlu dicek manual and antre from scored proposals', async ({
  page,
}) => {
  await page.goto('/proposal?status=perlu_dicek_manual')
  await expectRows(page, only('Bengkel Online', 'Rumah Belajar'))
  for (const name of ['Bengkel Online', 'Rumah Belajar']) {
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(
      row.getByText('Perlu dicek manual', { exact: true }),
    ).toBeVisible()
    // No score and no category: the Skor cell is a dash.
    await expect(row.getByRole('cell').nth(2)).toHaveText('—')
  }

  await page.goto('/proposal?status=antre')
  await expectRows(page, only('Logistik Nusantara'))

  await page.goto('/proposal?status=dinilai')
  await expectRows(
    page,
    ALL.filter(
      (name) =>
        !['Logistik Nusantara', 'Bengkel Online', 'Rumah Belajar'].includes(
          name,
        ),
    ),
  )
})

test('DSB-13 sektor lists the seeded sectors and filters on them', async ({
  page,
}) => {
  await page.goto('/proposal')
  const sektor = page.getByLabel('Sektor')
  for (const sector of [
    'agritech',
    'edtech',
    'F&B',
    'fashion',
    'fintech',
    'healthtech',
  ]) {
    await expect(sektor.locator('option', { hasText: sector })).toHaveCount(1)
  }

  await page.goto('/proposal?sektor=agritech')
  await expectRows(
    page,
    only('Ternak Pintar', 'Tani Maju', 'SawahKu', 'Panen Kita', 'Pasar Ikan'),
  )
  await page.goto('/proposal?sektor=F%26B')
  await expectRows(page, only('Kopi Rakyat'))
})

test('DSB-14 tanggapan splits responded from not yet responded', async ({
  page,
}) => {
  await page.goto('/proposal?tanggapan=sudah')
  await expectRows(page, only('Panen Kita', 'AplikasiX'))
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Panen Kita' })
      .getByText('Undang', { exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'AplikasiX' })
      .getByText('Arsipkan', { exact: true }),
  ).toBeVisible()

  await page.goto('/proposal?tanggapan=belum')
  await expectRows(
    page,
    ALL.filter((name) => !['Panen Kita', 'AplikasiX'].includes(name)),
  )
})

test('DSB-15 luar fokus lists only Tidak cocok proposals with a high quality score', async ({
  page,
}) => {
  await page.goto('/proposal?luarFokus=1')
  await expectRows(page, only('Kopi Rakyat'))
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Kopi Rakyat' })
      .getByText('Berkualitas, di luar fokus', { exact: true }),
  ).toBeVisible()
})

test('DSB-16 search matches part of the name, ignoring case and outer spaces', async ({
  page,
}) => {
  await page.goto('/proposal?q=tani')
  await expectRows(page, only('Tani Maju'))
  await page.goto('/proposal?q=TANI')
  await expectRows(page, only('Tani Maju'))
  await page.goto('/proposal?q=%20%20pasar%20')
  await expectRows(page, only('Pasar Ikan'))
  await page.goto('/proposal?q=zzz-tidak-ada')
  await expect(
    page.getByText('Tidak ada proposal yang cocok dengan filter ini.'),
  ).toBeVisible()
  await expect(
    page.getByText('Menampilkan 0 dari 14 proposal.', { exact: true }),
  ).toBeVisible()
})

test('DSB-17 an unknown URL value is no filter, never an error', async ({
  page,
}) => {
  await page.goto(
    '/proposal?kategori=hebat&status=selesai&tanggapan=mungkin&luarFokus=ya',
  )
  await expectRows(page, ALL)
  await expect(page.getByLabel('Kategori efektif')).toHaveValue('')
  await expect(page.getByLabel('Status')).toHaveValue('')
  await expect(page.getByLabel('Tanggapan')).toHaveValue('')

  await page.goto(`/proposal?q=${'x'.repeat(121)}`)
  await expectRows(page, ALL)

  // A repeated parameter takes its first value.
  await page.goto('/proposal?kategori=kurang_cocok&kategori=cocok')
  await expectRows(page, only('BelajarYuk'))

  // A sector nobody has is a real filter with nothing in it.
  await page.goto('/proposal?sektor=antariksa')
  await expectRows(page, [])
})

test('DSB-18 the filter form combines filters into a shareable URL, and Reset clears it', async ({
  page,
}) => {
  await page.goto('/proposal')
  await page.getByLabel('Kategori efektif').selectOption('Tidak cocok')
  await page.getByLabel('Tanggapan').selectOption('Belum ditanggapi')
  await page.getByRole('button', { name: 'Terapkan' }).click()

  await expect(page).toHaveURL(/kategori=tidak_cocok/u)
  await expect(page).toHaveURL(/tanggapan=belum/u)
  await expectRows(page, only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista'))

  // The URL alone reproduces the view.
  await page.reload()
  await expectRows(page, only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista'))
  await expect(page.getByLabel('Kategori efektif')).toHaveValue('tidak_cocok')

  await page.getByRole('link', { name: 'Reset' }).click()
  await expect(page).toHaveURL(/\/proposal$/u)
  await expectRows(page, ALL)
})
