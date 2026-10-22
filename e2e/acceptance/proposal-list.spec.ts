/**
 * The Proposal list's filters against the seed. Each expected row set is worked
 * out from the seed's proposals (`scripts/_seed-aisa.ts`), newest first, with
 * the filter's meaning from the overview and GLOSSARY: "kategori" filters the
 * EFFECTIVE grade (a corrected proposal is listed under its correction),
 * "luarFokus" the fit check, and an unknown URL value — an old-scale kategori
 * among them — means "no filter", never an error page.
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
 * the grade, then in-focus before out-of-focus, then the score.
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

test('DSB-11 kategori filters the effective grade, so a correction moves the row', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk&kategori=sangat_layak')
  await expectRows(page, only('Tani Maju', 'Kopi Rakyat', 'Dana UMKM'))

  // Panen Kita scored Layak bersyarat and was corrected down to Perlu
  // penyesuaian; Pasar Ikan scored Risiko tinggi and was corrected up to it.
  await page.goto('/proposal?urut=masuk&kategori=layak_bersyarat')
  await expectRows(page, only('Klinik Desa'))

  await page.goto('/proposal?urut=masuk&kategori=perlu_penyesuaian')
  await expectRows(page, only('SawahKu', 'Panen Kita', 'Pasar Ikan'))
  const pasarIkan = row(page, 'Pasar Ikan')
  await expect(
    pasarIkan.getByText('Perlu penyesuaian', { exact: true }),
  ).toBeVisible()
  await expect(
    pasarIkan.getByText('Sesuaikan dulu sebelum lanjut', { exact: true }),
  ).toBeVisible()
  await expect(pasarIkan.getByText('dikoreksi', { exact: true })).toBeVisible()

  await page.goto('/proposal?urut=masuk&kategori=risiko_tinggi')
  await expectRows(page, only('BelajarYuk'))

  await page.goto('/proposal?urut=masuk&kategori=tidak_layak')
  await expectRows(page, only('Ternak Pintar', 'Fashionista', 'AplikasiX'))
  await expect(
    row(page, 'AplikasiX').getByText('Sebaiknya ditolak', { exact: true }),
  ).toBeVisible()

  // "Sangat layak + Layak bersyarat" is both top grades at once.
  await page.goto('/proposal?urut=masuk&kategori=atas')
  await expectRows(
    page,
    only('Tani Maju', 'Klinik Desa', 'Kopi Rakyat', 'Dana UMKM'),
  )
})

test('DSB-11b the default order is grade, then in focus, then score', async ({
  page,
}) => {
  await page.goto('/proposal')
  // Kopi Rakyat scores 85 but is out of focus, so it follows the in-focus
  // Sangat layak pair; Panen Kita (81,3) leads its corrected grade on score.
  await expect(page.locator('tbody').getByRole('link')).toHaveText([
    'Tani Maju',
    'Dana UMKM',
    'Kopi Rakyat',
    'Klinik Desa',
    'Panen Kita',
    'SawahKu',
    'Pasar Ikan',
    'BelajarYuk',
    'AplikasiX',
    'Ternak Pintar',
    'Fashionista',
    /.+/u,
  ])
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
    row(page, 'Panen Kita').getByText('Disetujui', { exact: true }),
  ).toBeVisible()
  await expect(
    row(page, 'AplikasiX').getByText('Ditolak', { exact: true }),
  ).toBeVisible()
  // Every tab names its count, over the same filters as the table.
  await expect(page.getByRole('tab')).toHaveText([
    /^Semua\s*14$/u,
    /^Belum ditanggapi\s*12$/u,
    /^Sudah ditanggapi\s*2$/u,
    /^Disetujui\s*1$/u,
    /^Ditolak\s*1$/u,
  ])

  await page.goto('/proposal?urut=masuk&tanggapan=belum')
  await expectRows(
    page,
    ALL.filter((name) => !['Panen Kita', 'AplikasiX'].includes(name)),
  )

  // One decision at a time, as the Disetujui / Ditolak tabs show it.
  await page.goto('/proposal?urut=masuk&tanggapan=setuju')
  await expectRows(page, only('Panen Kita'))
  await page.goto('/proposal?urut=masuk&tanggapan=tolak')
  await expectRows(page, only('AplikasiX'))
  await expect(
    page.getByRole('tab', { name: /^Ditolak/u, selected: true }),
  ).toBeVisible()

  // A saved link with a decision of the earlier scale shows Semua, not an
  // error and not an empty table.
  for (const old of ['undang', 'pantau', 'arsipkan']) {
    await page.goto(`/proposal?urut=masuk&tanggapan=${old}`)
    await expectRows(page, ALL)
    await expect(
      page.getByRole('tab', { name: /^Semua/u, selected: true }),
    ).toBeVisible()
  }
})

test('DSB-15 the focus filter splits proposals that fit the focus from those that do not', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk&luarFokus=1')
  await expectRows(page, only('Ternak Pintar', 'Kopi Rakyat', 'Fashionista'))
  const kopi = row(page, 'Kopi Rakyat')
  // The grade stays Sangat layak; out of focus is a second label beside it.
  await expect(kopi.getByText('Sangat layak', { exact: true })).toBeVisible()
  const badge = kopi.getByRole('button', { name: 'Di luar fokus' })
  await badge.hover()
  const why = page.getByRole('dialog')
  await expect(why).toContainText('Prioritas rendah')
  await expect(why).toContainText('Sektor: F&B di luar sektor fokus')

  // "Sesuai fokus" is a passed fit check: no unscored proposal is listed.
  await page.goto('/proposal?urut=masuk&luarFokus=0')
  await expectRows(
    page,
    only(
      'Tani Maju',
      'SawahKu',
      'Klinik Desa',
      'Dana UMKM',
      'BelajarYuk',
      'Panen Kita',
      'Pasar Ikan',
      'AplikasiX',
    ),
  )
  await expect(
    page.getByRole('combobox', { name: 'Fokus investasi', exact: true }),
  ).toHaveText('Sesuai fokus')
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
    page.getByRole('combobox', { name: 'Grade', exact: true }),
  ).toHaveText('Semua grade')
  await expect(
    page.getByRole('combobox', { name: 'Fokus investasi', exact: true }),
  ).toHaveText('Semua fokus')
  await expect(
    page.getByRole('combobox', { name: 'Status', exact: true }),
  ).toHaveText('Semua status')
  await expect(
    page.getByRole('tab', { name: /^Semua/u, selected: true }),
  ).toBeVisible()

  // A kategori of the old four-step scale is no filter either.
  await page.goto('/proposal?urut=masuk&kategori=cocok')
  await expectRows(page, ALL)

  // A repeated parameter takes its first value.
  await page.goto(
    '/proposal?urut=masuk&kategori=risiko_tinggi&kategori=sangat_layak',
  )
  await expectRows(page, only('BelajarYuk'))

  // A sector nobody has is a real filter with nothing in it.
  await page.goto('/proposal?urut=masuk&sektor=antariksa')
  await expectRows(page, [])
})

test('DSB-18 the filters combine into a shareable URL, and Reset filter clears them', async ({
  page,
}) => {
  await page.goto('/proposal?urut=masuk')
  await page.getByRole('combobox', { name: 'Grade', exact: true }).click()
  await page.getByRole('option', { name: 'Tidak layak', exact: true }).click()
  await page.getByRole('tab', { name: /^Belum ditanggapi/u }).click()

  await expect(page).toHaveURL(/kategori=tidak_layak/u)
  await expect(page).toHaveURL(/tanggapan=belum/u)
  await expectRows(page, only('Ternak Pintar', 'Fashionista'))

  // The URL alone reproduces the view.
  await page.reload()
  await expectRows(page, only('Ternak Pintar', 'Fashionista'))
  await expect(
    page.getByRole('combobox', { name: 'Grade', exact: true }),
  ).toHaveText('Tidak layak')

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
