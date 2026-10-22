/**
 * Aturan penilaian → Kalibrasi against the shard's emulator. The expected numbers are
 * recounted here from `proposals`, with the rule the section states on screen:
 * a proposal is "ditinjau manajer" when it has a tanggapan or a koreksi, and the
 * AI agrees unless the koreksi moved it to another kategori.
 *
 * The seed (`scripts/_seed-aisa.ts`) gives 3 reviewed — Panen Kita (undang,
 * corrected Sangat cocok → Cocok), AplikasiX (arsipkan, no koreksi) and Pasar
 * Ikan (corrected Kurang cocok → Cocok) — so 1 of 3 agreed, one koreksi each way.
 */
import { PROPOSALS_COLLECTION } from '../../features/aisa/aisa.path.ts'
import { emulatorDb, expect, signInAs, test } from './fixtures.ts'
import { card, fact } from './locators.ts'

const SCALE = ['sangat_cocok', 'cocok', 'kurang_cocok', 'tidak_cocok']
const LABEL: Record<string, string> = {
  sangat_cocok: 'Sangat cocok',
  cocok: 'Cocok',
  kurang_cocok: 'Kurang cocok',
  tidak_cocok: 'Tidak cocok',
}
const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const score = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const day = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

interface Row {
  id: string
  name: string
  category: string
  corrected: string
  reason: string
  at: Date
  score: number
}

async function recount() {
  const snap = await emulatorDb().collection(PROPOSALS_COLLECTION).get()
  let reviewed = 0
  const rows: Row[] = []
  for (const doc of snap.docs) {
    const p = doc.data()
    if (p.response == null && p.correction == null) continue
    reviewed += 1
    if (p.correction == null || p.correction.category === p.category) continue
    rows.push({
      id: doc.id,
      name: p.name,
      category: p.category,
      corrected: p.correction.category,
      reason: p.correction.reason,
      at: p.correction.at.toDate(),
      score: p.assessment.score,
    })
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime())
  const up = (r: Row) => SCALE.indexOf(r.corrected) < SCALE.indexOf(r.category)
  return {
    reviewed,
    rows,
    agreed: reviewed - rows.length,
    naik: rows.filter(up).length,
    turun: rows.filter((r) => !up(r)).length,
  }
}

test('DSB-99 Kalibrasi counts manager reviews and lists every koreksi', async ({
  page,
}) => {
  const want = await recount()
  // The seed must give the section something to show in both directions.
  expect(want).toMatchObject({ reviewed: 3, agreed: 1, naik: 1, turun: 1 })
  expect(want.rows).toHaveLength(2)

  await signInAs(page)
  await page.goto('/aturan')
  const kalibrasi = card(page, 'Kalibrasi')

  await expect(
    kalibrasi.getByText(/^Proposal dihitung ditinjau manajer bila/u),
  ).toBeVisible()
  await expect(fact(kalibrasi, 'Ditinjau manajer')).toHaveText(
    String(want.reviewed),
  )
  await expect(fact(kalibrasi, 'Dikoreksi')).toHaveText(
    String(want.rows.length),
  )
  await expect(fact(kalibrasi, 'Arah koreksi')).toHaveText(
    `Naik kategori ${want.naik} · Turun kategori ${want.turun}`,
  )
  await expect(
    kalibrasi.getByText(
      `AI sepakat dengan manajer pada ${want.agreed} dari ${want.reviewed} proposal yang ditinjau (${percent.format((want.agreed / want.reviewed) * 100)}%).`,
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    kalibrasi.getByText(/Belum ada proposal yang ditinjau manajer/u),
  ).toHaveCount(0)

  const table = kalibrasi.getByRole('table', {
    name: 'Koreksi kategori oleh manajer',
  })
  const body = table.locator('tbody')
  await expect(body.getByRole('row')).toHaveCount(want.rows.length)
  for (const [i, row] of want.rows.entries()) {
    const direction =
      SCALE.indexOf(row.corrected) < SCALE.indexOf(row.category)
        ? 'naik'
        : 'turun'
    const tr = body.getByRole('row').nth(i)
    await expect(tr.getByRole('cell')).toHaveText([
      row.name,
      LABEL[row.category]!,
      `${LABEL[row.corrected]} (${direction})`,
      row.reason,
      day.format(row.at),
      score.format(row.score),
    ])
    await expect(tr.getByRole('link', { name: row.name })).toHaveAttribute(
      'href',
      `/proposal/${row.id}`,
    )
  }

  // The analyst calibration is a separate, still-empty sub-section.
  await expect(
    kalibrasi.getByText('belum ada data', { exact: true }),
  ).toBeVisible()
  await expect(
    kalibrasi.getByText(/10–20 proposal lama dinilai 2–3\s+analis/u),
  ).toBeVisible()

  // A row's link opens that proposal's detail.
  const first = want.rows[0]!
  await body.getByRole('link', { name: first.name }).click()
  await expect(page).toHaveURL(`/proposal/${first.id}`)
  await expect(
    // The shell owns the page's h1 ("Proposal"); the proposal's name is the h2.
    page.getByRole('heading', { level: 2, name: first.name }),
  ).toBeVisible()
})
