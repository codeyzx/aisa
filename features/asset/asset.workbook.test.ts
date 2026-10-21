import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import type { Asset } from './asset.schema'

import { ASSET_EXPORT_HEADER, toAssetCsvCells } from './asset.columns'
import { buildAssetWorkbook } from './asset.workbook'

const createdAt = new Date('2026-07-16T11:30:00.000Z')

const items: Asset[] = [
  {
    id: 'asset-1',
    code: 'AST-0001',
    name: 'Widget, large',
    description: 'A description',
    value: 1_500_000,
    status: 'active',
    searchPrefixes: ['wid'],
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'asset-2',
    code: 'AST-0002',
    name: '=1+1',
    value: 0,
    status: 'retired',
    searchPrefixes: ['1'],
    createdAt,
    updatedAt: createdAt,
  },
]

/** Read a workbook back out of the bytes the builder produced. */
async function readBack(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet('Aset')
  if (!sheet) throw new Error('no Aset sheet')
  return sheet
}

describe('buildAssetWorkbook', () => {
  it('writes createdAt as a real date cell, not a string', async () => {
    // THE ENTIRE JUSTIFICATION FOR THE exceljs DEPENDENCY. A date
    // written as text sorts alphabetically — "01 Aug" before "16 Jul" — which is
    // the defect that makes an xlsx a CSV in a trenchcoat. Asserting the TYPE
    // read back out of the bytes is what falsifies it; asserting the rendered
    // string would pass on a build that wrote text.
    const sheet = await readBack(await buildAssetWorkbook(items))
    const cell = sheet
      .getRow(2)
      .getCell(ASSET_EXPORT_HEADER.indexOf('Dibuat') + 1)

    expect(cell.value).toBeInstanceOf(Date)
    expect((cell.value as Date).toISOString()).toBe(createdAt.toISOString())
  })

  it('reads status through ASSET_STATUS_LABEL rather than re-spelling the enum', async () => {
    // `Aktif`, not `active` — the one word that proves the label map was read
    // (the enum member is `active`; the human label is Bahasa Indonesia).
    const sheet = await readBack(await buildAssetWorkbook(items))
    const column = ASSET_EXPORT_HEADER.indexOf('Status') + 1

    expect(sheet.getRow(2).getCell(column).value).toBe('Aktif')
    expect(sheet.getRow(3).getCell(column).value).toBe('Nonaktif')
  })

  it('writes a header row and one row per asset', async () => {
    const sheet = await readBack(await buildAssetWorkbook(items))

    // rowCount = 1 header + 2 assets. A workbook that silently dropped a row
    // would still open fine, which is why this is asserted rather than eyeballed.
    expect(sheet.rowCount).toBe(3)
    expect(sheet.getRow(1).getCell(2).value).toBe('Nama')
  })

  it('does NOT need the CSV formula guard, because a cell is never a formula here', async () => {
    // `=1+1` is a plain string cell in xlsx: exceljs writes a formula only for an
    // explicit {formula} value. So the CSV escaper is deliberately absent from
    // this path — applying it would print a literal apostrophe in the cell.
    const sheet = await readBack(await buildAssetWorkbook(items))

    expect(sheet.getRow(3).getCell(2).value).toBe('=1+1')
  })
})

describe('ASSET_EXPORT_COLUMNS — the shared column contract', () => {
  it('gives CSV and Excel the same columns in the same order', () => {
    // The invariant this list exists for: two formats, one set. If they drift,
    // two files that claim to be the same export describe different things.
    expect(toAssetCsvCells(items[0]!)).toHaveLength(ASSET_EXPORT_HEADER.length)
  })

  it('hands CSV a string for every column, including the date', () => {
    // CSV has no types; the escaper's contract is strings. A Date leaking
    // through would stringify to the host zone and contradict the screen.
    for (const cell of toAssetCsvCells(items[0]!)) {
      expect(typeof cell).toBe('string')
    }
  })

  it('renders an absent description as an empty cell rather than dropping it', () => {
    // A dropped cell shifts every column after it — the file parses and lies.
    expect(
      toAssetCsvCells(items[1]!)[ASSET_EXPORT_HEADER.indexOf('Deskripsi')],
    ).toBe('')
  })
})
