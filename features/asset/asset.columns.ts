import { formatRupiah } from '@/lib/format/currency'
import { formatDate, formatTime } from '@/lib/format/date'
import { type Asset, ASSET_STATUS_LABEL } from './asset.schema'
import { ASSET_FIELD_LABEL } from './asset.display'

/**
 * The ONE place the asset export's columns are spelled — header, CSV value, and
 * Excel value — shared by the CSV route and the workbook builder.
 *
 * Why one list instead of two obvious ones: CSV and XLSX export the SAME set,
 * and the moment they spell their columns separately they drift — a column added
 * to one, a header reworded in the other, and two files that claim to be the
 * same export describe different things. Same invariant `assetsQuery` states for
 * the filter ("they must agree on what matching means"), one layer up.
 *
 * The per-format split is the POINT, not duplication: `csv` is always a string
 * because a CSV has no types, while `xlsx` may hand back a real `Date` or a
 * `number`. That difference IS the reason `exceljs` is on disk — see
 * `xlsx.ts`. Keeping both beside the header makes a drifting column a
 * one-line diff rather than a hunt across two modules.
 */
export interface AssetExportColumn {
  /** Column header, spelled once for both formats. */
  header: string
  /** The CSV cell. Always a string — escaping happens in `csv.ts`. */
  csv: (item: Asset) => string
  /**
   * The Excel cell. `Date`/`number` stay TYPED here rather than being
   * pre-formatted into a string — a date written as text sorts alphabetically,
   * which is the exact defect that makes an xlsx "a CSV in a trenchcoat".
   */
  xlsx: (item: Asset) => string | number | Date
  /** Column width in Excel, in characters. Ignored by CSV. */
  width: number
}

export const ASSET_EXPORT_COLUMNS: readonly AssetExportColumn[] = [
  {
    header: ASSET_FIELD_LABEL.code,
    csv: (item) => item.code,
    xlsx: (item) => item.code,
    width: 12,
  },
  {
    header: ASSET_FIELD_LABEL.name,
    csv: (item) => item.name,
    xlsx: (item) => item.name,
    width: 32,
  },
  {
    header: ASSET_FIELD_LABEL.description,
    // `?? ''` rather than omitting: description is optional, and a missing cell
    // would shift every column after it in the CSV.
    csv: (item) => item.description ?? '',
    xlsx: (item) => item.description ?? '',
    width: 40,
  },
  {
    header: ASSET_FIELD_LABEL.value,
    // CSV gets the rupiah-formatted STRING (a human reads it, and formatRupiah
    // pins `id-ID`); Excel gets the raw NUMBER so the reader can sum and sort it
    // AS a number — the same typed-cell justification as the Created date.
    csv: (item) => formatRupiah(item.value),
    xlsx: (item) => item.value,
    width: 16,
  },
  {
    header: ASSET_FIELD_LABEL.status,
    // ASSET_STATUS_LABEL, never the raw enum — it is "the ONE place a status is
    // spelled for a reader", and an export IS a surface a human reads. A CSV
    // writing `active` while the screen writes `Active` is the drift that map
    // exists to prevent.
    csv: (item) => ASSET_STATUS_LABEL[item.status],
    xlsx: (item) => ASSET_STATUS_LABEL[item.status],
    width: 12,
  },
  {
    header: ASSET_FIELD_LABEL.createdAt,
    // CSV gets WIB-formatted text via lib/format (which pins Asia/Jakarta), NOT
    // an ISO string: a CSV cell is read by a human, and this keeps it identical
    // to what the screen shows.
    csv: (item) =>
      `${formatDate(item.createdAt)} ${formatTime(item.createdAt)}`,
    // Excel gets the real Date. The spreadsheet then owns the rendering, and
    // the reader can sort and filter it AS a date — the whole justification for
    // the exceljs dependency.
    xlsx: (item) => item.createdAt,
    width: 20,
  },
]

/** The header row, in column order — shared by both formats. */
export const ASSET_EXPORT_HEADER: readonly string[] = ASSET_EXPORT_COLUMNS.map(
  (column) => column.header,
)

/** One asset as CSV cells, in column order. Escaping is `csv.ts`'s job. */
export function toAssetCsvCells(item: Asset): readonly string[] {
  return ASSET_EXPORT_COLUMNS.map((column) => column.csv(item))
}
