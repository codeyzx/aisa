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

const PAGE_SIZE = 12

/**
 * The list as the URL in hand shows it, every page: the page holds twelve
 * rows, so a longer set is read across "Halaman berikutnya". Specs that assert
 * an order load the list with `urut=masuk` (newest first); the default order is
 * the score.
 */
async function expectRows(page: Page, names: string[]) {
  const links = page.locator('tbody').getByRole('link')
  const footer = page.getByText(
    names.length
      ? `Menampilkan 1–${Math.min(names.length, PAGE_SIZE)} dari ${names.length} proposal`
      : '0 proposal',
    { exact: true },
  )
  await expect(footer).toBeVisible()
  await expect(links).toHaveText(names.slice(0, PAGE_SIZE))
  if (names.length > PAGE_SIZE) {
    await page.getByRole('button', { name: 'Halaman berikutnya' }).click()
    await expect(links).toHaveText(names.slice(PAGE_SIZE))
    await expect(
      page.getByText(
        `Menampilkan ${PAGE_SIZE + 1}–${names.length} dari ${names.length} proposal`,
        { exact: true },
      ),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Halaman sebelumnya' }).click()
  }
}

const row = (page: Page, name: string) =>
  page.locator('tbody tr').filter({ hasText: name })

test.beforeEach(async ({ page }) => {
  await signInAs(page)
})

test('DSB-10 the unfiltered list shows every proposal, newest first', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk')
  await expectRows(page, ALL)
  // Select-all names the page it reaches, visibly, as its accessible name.
  const scope = `Pilih semua ${PAGE_SIZE} proposal di halaman ini`
  await expect(page.getByText(scope, { exact: true })).toBeVisible()
  await expect(
    page.getByRole('checkbox', { name: scope, exact: true }),
  ).toBeVisible()
})

test('DSB-11 kategori filters the kategori efektif, so a correction moves the row', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk&kategori=sangat_cocok')
  await expectRows(page, only('Tani Maju'))

  // Pasar Ikan scored Kurang cocok and was corrected up to Cocok; Panen Kita
  // scored Sangat cocok and was corrected down to Cocok.
  await page.goto('/proposal?urut=masuk&kategori=cocok')
  await expectRows(
    page,
    only('SawahKu', 'Klinik Desa', 'Dana UMKM', 'Panen Kita', 'Pasar Ikan'),
  )
  const pasarIkan = row(page, 'Pasar Ikan')
  await expect(pasarIkan.getByText('Cocok', { exact: true })).toBeVisible()
  await expect(pasarIkan.getByText('dikoreksi', { exact: true })).toBeVisible()

  await page.goto('/proposal?urut=masuk&kategori=kurang_cocok')
  await expectRows(page, only('BelajarYuk'))

  await page.goto('/proposal?urut=masuk&kategori=tidak_cocok')
  await expectRows(
    page,
    only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista', 'AplikasiX'),
  )

  // "Sangat cocok + cocok" is both top categories at once.
  await page.goto('/proposal?urut=masuk&kategori=atas')
  await expectRows(
    page,
    only(
      'Tani Maju',
      'SawahKu',
      'Klinik Desa',
      'Dana UMKM',
      'Panen Kita',
      'Pasar Ikan',
    ),
  )
})

test('DSB-12 status separates perlu dicek manual and antre from scored proposals', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk&status=perlu_dicek_manual')
  await expectRows(page, only('Bengkel Online', 'Rumah Belajar'))
  for (const name of ['Bengkel Online', 'Rumah Belajar']) {
    const tr = row(page, name)
    await expect(
      tr.getByText('Perlu dicek manual', { exact: true }),
    ).toBeVisible()
    // No score and no category: the Skor cell is a dash.
    await expect(tr.getByRole('cell').last()).toHaveText('—')
  }

  await page.goto('/proposal?urut=masuk&status=antre')
  await expectRows(page, only('Logistik Nusantara'))

  await page.goto('/proposal?urut=masuk&status=dinilai')
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
  await page.getByRole('combobox', { name: 'Sektor', exact: true }).click()
  // One display label per sector, the same one the table and detail show.
  for (const sector of [
    'Agritech',
    'Edtech',
    'F&B',
    'Fashion',
    'Fintech',
    'Healthtech',
  ]) {
    await expect(
      page.getByRole('option', { name: sector, exact: true }),
    ).toHaveCount(1)
  }
  await page.keyboard.press('Escape')

  await page.goto('/proposal?urut=masuk&sektor=agritech')
  await expectRows(
    page,
    only('Ternak Pintar', 'Tani Maju', 'SawahKu', 'Panen Kita', 'Pasar Ikan'),
  )
  await page.goto('/proposal?urut=masuk&sektor=F%26B')
  await expectRows(page, only('Kopi Rakyat'))
})

test('DSB-14 tanggapan splits responded from not yet responded', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk&tanggapan=sudah')
  await expectRows(page, only('Panen Kita', 'AplikasiX'))
  await expect(
    row(page, 'Panen Kita').getByText('Diundang', { exact: true }),
  ).toBeVisible()
  await expect(
    row(page, 'AplikasiX').getByText('Diarsipkan', { exact: true }),
  ).toBeVisible()

  await page.goto('/proposal?urut=masuk&tanggapan=belum')
  await expectRows(
    page,
    ALL.filter((name) => !['Panen Kita', 'AplikasiX'].includes(name)),
  )

  // One response kind at a time, as the Diundang / Diarsipkan tabs show it.
  await page.goto('/proposal?urut=masuk&tanggapan=undang')
  await expectRows(page, only('Panen Kita'))
  await page.goto('/proposal?urut=masuk&tanggapan=arsipkan')
  await expectRows(page, only('AplikasiX'))
  await expect(
    page.getByRole('tab', { name: /^Diarsipkan/u, selected: true }),
  ).toBeVisible()
})

test('DSB-15 luar fokus lists only Tidak cocok proposals with a high quality score', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk&luarFokus=1')
  await expectRows(page, only('Kopi Rakyat'))
  await expect(
    row(page, 'Kopi Rakyat').getByText('Berkualitas, di luar fokus', {
      exact: true,
    }),
  ).toBeVisible()
})

test('DSB-16 search matches name, founder and one-liner, ignoring case and outer spaces', async ({
  page,
}) => {
  // "tani" is Tani Maju's name and Panen Kita's "petani" one-liner.
  await page.goto('/proposal?urut=masuk&q=tani')
  await expectRows(page, only('Tani Maju', 'Panen Kita'))
  await page.goto('/proposal?urut=masuk&q=TANI')
  await expectRows(page, only('Tani Maju', 'Panen Kita'))
  // "pasar" is Pasar Ikan's name and Panen Kita's "Pasar daring" one-liner.
  await page.goto('/proposal?urut=masuk&q=%20%20pasar%20')
  await expectRows(page, only('Panen Kita', 'Pasar Ikan'))
  await page.goto('/proposal?urut=masuk&q=zzz-tidak-ada')
  await expect(page.getByText('Tidak ada proposal yang cocok')).toBeVisible()
  await expectRows(page, [])
})

test('DSB-17 an unknown URL value is no filter, never an error', async ({
  page,
}) => {
  await page.goto(
    '/proposal?urut=masuk&kategori=hebat&status=selesai&tanggapan=mungkin&luarFokus=ya',
  )
  await expectRows(page, ALL)
  await expect(
    page.getByRole('combobox', { name: 'Kategori', exact: true }),
  ).toHaveText('Semua kategori')
  await expect(
    page.getByRole('combobox', { name: 'Status', exact: true }),
  ).toHaveText('Semua status')
  await expect(
    page.getByRole('tab', { name: /^Semua/u, selected: true }),
  ).toBeVisible()

  // A repeated parameter takes its first value.
  await page.goto('/proposal?urut=masuk&kategori=kurang_cocok&kategori=cocok')
  await expectRows(page, only('BelajarYuk'))

  // A sector nobody has is a real filter with nothing in it.
  await page.goto('/proposal?urut=masuk&sektor=antariksa')
  await expectRows(page, [])
})

test('DSB-18 the filters combine into a shareable URL, and Reset filter clears them', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk')
  await page.getByRole('combobox', { name: 'Kategori', exact: true }).click()
  await page.getByRole('option', { name: 'Tidak cocok', exact: true }).click()
  await page.getByRole('tab', { name: /^Belum ditanggapi/u }).click()

  await expect(page).toHaveURL(/kategori=tidak_cocok/u)
  await expect(page).toHaveURL(/tanggapan=belum/u)
  await expectRows(page, only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista'))

  // The URL alone reproduces the view.
  await page.reload()
  await expectRows(page, only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista'))
  await expect(
    page.getByRole('combobox', { name: 'Kategori', exact: true }),
  ).toHaveText('Tidak cocok')

  // Reset clears the filters; the tab is a view, not a filter, and stays.
  await page.getByRole('button', { name: 'Reset filter' }).first().click()
  await expect(page).not.toHaveURL(/kategori=/u)
  await expectRows(
    page,
    ALL.filter((name) => !['Panen Kita', 'AplikasiX'].includes(name)),
  )
  await page.getByRole('tab', { name: /^Semua/u }).click()
  await expectRows(page, ALL)
})
