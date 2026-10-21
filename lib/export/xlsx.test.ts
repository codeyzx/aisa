import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'

import { buildWorkbook } from './xlsx'

describe('buildWorkbook', () => {
  it('writes typed cells, presentation, and each projector once', async () => {
    const value = vi.fn((item: { createdAt: Date }) => item.createdAt)
    const buffer = await buildWorkbook({
      sheetName: 'Test',
      items: [{ createdAt: new Date('2026-01-01T12:30:00Z') }],
      columns: [
        {
          header: 'Created',
          width: 20,
          value,
          numberFormat: 'dd mmm yyyy hh:mm',
        },
      ],
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Test')
    if (!sheet) throw new Error('missing worksheet')

    expect(value).toHaveBeenCalledTimes(1)
    expect(sheet.columns[0]?.width).toBe(20)
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sheet.getRow(1).font.bold).toBe(true)
    expect(sheet.getRow(2).getCell(1).value).toBeInstanceOf(Date)
    expect(sheet.getRow(2).getCell(1).numFmt).toBe('dd mmm yyyy hh:mm')
  })
})
