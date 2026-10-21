/** A CSV cell: quoted when it carries a comma, quote or newline. */
export function csvCell(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** The CSV text with a BOM, so Excel reads non-ASCII letters correctly. */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/** Download rows as `<filename>.csv` from the browser. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }),
  )
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `${filename}.csv`,
  })
  a.click()
  URL.revokeObjectURL(url)
}
