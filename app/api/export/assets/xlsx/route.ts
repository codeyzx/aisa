import { resolveCorrelationId } from '@/lib/api/cid'
import { apiFail, apiFailFrom, apiFailFromDenial } from '@/lib/api/response'
import { authorizeSession } from '@/lib/auth/guards'
import { downloadResponse } from '@/lib/export/download'
import {
  assetDatasetFilename,
  resolveAssetDataset,
} from '@/features/asset/asset.dataset'
import { buildAssetWorkbook } from '@/features/asset/asset.workbook'

/**
 * Serve the filtered asset list as an Excel workbook.
 *
 * GATE: `export:read`, same as `/csv` and for the same reason — this is the
 * same bulk egress in a different container, and the line is BULK EGRESS, NOT
 * FILE FORMAT. `/api/export/assets/[id]/pdf` is the other side of that line and
 * stays `asset:read`. See `./csv/route.ts` for the full reasoning; it is
 * spelled once there rather than twice, but the gate itself is spelled here
 * because a route is a public HTTP endpoint and its boundary must be legible in
 * the file that answers.
 *
 * WHY THIS IS NOT A CSV IN A TRENCHCOAT, i.e. why `exceljs` is on disk:
 * `createdAt` lands as a real DATE CELL a spreadsheet can sort and filter as a
 * date, and that is the one thing CSV structurally cannot do. `lib/export/xlsx.ts`
 * carries the argument. If that ever stops being true, drop the dependency.
 *
 * SCOPE, STATED SO IT DOES NOT READ AS UNFINISHED: export only. An Excel round
 * trip — a validated template, filled in and uploaded back — is deliberately out
 * of scope. It is a write path across another boundary and belongs in its own
 * work item. A validated template with nothing to read it back is fiction.
 */
export async function GET(request: Request): Promise<Response> {
  // One gate, four boundaries: `authorizeSession` also refuses a session owing a
  // mandatory password change, which a hand-written `getSession` + `can()` pair
  // here silently would not.
  const auth = await authorizeSession('export:read')
  if (!auth.ok) return apiFailFromDenial(request, auth.denial)

  const dataset = resolveAssetDataset(request)
  if (!dataset) return apiFail(request, 'INVALID_ARGUMENT')

  try {
    /*
      `.get()`, not `.stream()` — and this is the one place the two dataset
      routes legitimately differ. exceljs builds the workbook in memory and
      hands back a finished buffer regardless, so there is no streaming to give
      up here: a `.stream()` would be reassembled into the same array one line
      later. The CSV route streams because CSV genuinely can — a row is a row.

      That bounds this route by memory where CSV is bounded by nothing, which is
      the honest trade of the format, not an oversight. If an asset collection
      ever outgrows a workbook, the answer is CSV (or exceljs's own streaming
      writer), not a cast.
    */
    const snapshot = await dataset.query.get()
    const buffer = await buildAssetWorkbook(
      snapshot.docs.map((doc) => doc.data()),
    )

    /*
      Bytes + Content-Disposition, not the envelope. The MIME type is
      the OOXML one; `application/vnd.ms-excel` is the legacy .xls type and
      makes Excel warn that the contents do not match the extension.
    */
    return downloadResponse(new Uint8Array(buffer), {
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: assetDatasetFilename(dataset.status, 'xlsx'),
      correlationId: resolveCorrelationId(request),
    })
  } catch (error) {
    /*
      The whole workbook is built before a byte is sent, so an unexpected throw
      can still become a clean status here — unlike the CSV route, where headers
      are already on the wire by the time a row fails. `apiFailFrom` logs the raw
      error keyed by cid and answers the code only; internals never cross the
      boundary.
    */
    return apiFailFrom(request, error)
  }
}
