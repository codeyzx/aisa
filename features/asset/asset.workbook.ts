import 'server-only'

import { buildWorkbook, type XlsxColumn } from '@/lib/export/xlsx'

import { ASSET_EXPORT_COLUMNS } from './asset.columns'
import { ASSET_FIELD_LABEL } from './asset.display'
import type { Asset } from './asset.schema'

/**
 * Build the asset workbook — the Excel export.
 *
 * WHAT THIS SHIPS, AND WHAT IT DOES NOT: export only. A round-trip Excel flow —
 * download a validated template, fill it in, upload it back — is deliberately
 * NOT here. That upload half is a write path and its own feature (import); it
 * belongs wherever the write path lives, not with this export.
 *
 * ⚠️ A validated template with nothing to read it back is FICTION — the same
 * "documented but unwired" defect to avoid everywhere. Better no template than a
 * decorative one.
 *
 * So `exceljs` has to earn itself on the export alone, and it does: TYPED CELLS.
 * A date written as a real date sorts and filters as a date, which CSV
 * structurally cannot do and which is the actual reason an ERP user asks for
 * xlsx over csv. If that ever stops being true, drop the dependency.
 */

/**
 * How Excel renders the `Date` cells this writes.
 *
 * Set explicitly because a bare `Date` cell defaults to a date-only format and
 * the seeded times would all read as midnight. This is a DISPLAY format only —
 * the cell still holds a real date, so sorting and filtering are unaffected.
 * `dd mmm yyyy hh:mm` mirrors lib/format/date.ts's spelling so the workbook and
 * the screen agree.
 */
const DATE_NUMBER_FORMAT = 'dd mmm yyyy hh:mm'

/**
 * Serialize assets into an .xlsx buffer.
 *
 * Takes the already-loaded rows rather than a query: the route owns the read
 * (off the shared `assetsQuery` filter), this owns the bytes. A workbook is built
 * in memory by exceljs regardless, so there is no streaming to give up here.
 */
export async function buildAssetWorkbook(
  items: readonly Asset[],
): Promise<ArrayBuffer> {
  const columns: XlsxColumn<Asset>[] = ASSET_EXPORT_COLUMNS.map((column) => ({
    header: column.header,
    width: column.width,
    value: column.xlsx,
    numberFormat:
      column.header === ASSET_FIELD_LABEL.createdAt
        ? DATE_NUMBER_FORMAT
        : undefined,
  }))
  return buildWorkbook({ sheetName: 'Aset', items, columns })
}
