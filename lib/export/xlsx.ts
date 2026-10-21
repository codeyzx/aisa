import 'server-only'

import ExcelJS from 'exceljs'

export interface XlsxColumn<T> {
  header: string
  width: number
  value: (item: T) => string | number | Date
  numberFormat?: string
}

export interface BuildWorkbookInput<T> {
  sheetName: string
  items: readonly T[]
  columns: readonly XlsxColumn<T>[]
}

/** Build an in-memory typed workbook for a feature-owned export dataset. */
export async function buildWorkbook<T>({
  sheetName,
  items,
  columns,
}: BuildWorkbookInput<T>): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.columns = columns.map(({ header, width }) => ({ header, width }))
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true }

  for (const item of items) {
    const values = columns.map((column) => column.value(item))
    const row = sheet.addRow(values)
    for (const [index, column] of columns.entries()) {
      if (column.numberFormat)
        row.getCell(index + 1).numFmt = column.numberFormat
    }
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
}
