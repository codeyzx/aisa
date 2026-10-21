import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

import { resolveCorrelationId } from '@/lib/api/cid'
import { apiFail, apiFailFromDenial } from '@/lib/api/response'
import { authorizeSession } from '@/lib/auth/guards'
import { log } from '@/lib/log'
import { toCsvStream } from '@/lib/export/csv'
import { downloadResponse } from '@/lib/export/download'
import {
  assetDatasetFilename,
  resolveAssetDataset,
} from '@/features/asset/asset.dataset'
import {
  ASSET_EXPORT_HEADER,
  toAssetCsvCells,
} from '@/features/asset/asset.columns'
import type { Asset } from '@/features/asset/asset.schema'

/**
 * Stream the filtered asset list as CSV — a filtered query streamed as a route.
 *
 * GATE: `export:read`, and NOT `asset:read`. The line is BULK EGRESS, not file
 * format: this hands over the WHOLE collection in one click, while
 * `/api/export/assets/[id]/pdf` hands over one document and stays `asset:read`.
 * `ROLE_CAPABILITIES.user` is `['asset:read', 'storage:read']`, so reusing
 * `asset:read` here would hand every signed-in user the entire collection — the
 * more permissive, more dangerous choice. Without this comment the two routes
 * read as an inconsistency and the next reader "fixes" the wrong one.
 *
 * `authorizeSession()` + `apiFail`, never `requireCapability`: that guard `redirect()`s, and
 * a 307 to /login saved as `assets.csv` is a login page with a spreadsheet's
 * name, not a refusal. Same reasoning as `app/api/storage/upload-url/route.ts`,
 * whose header spells it out.
 */
export async function GET(request: Request): Promise<Response> {
  // One gate, four boundaries: `authorizeSession` also refuses a session owing a
  // mandatory password change, which a hand-written `getSession` + `can()` pair
  // here silently would not.
  const auth = await authorizeSession('export:read')
  if (!auth.ok) return apiFailFromDenial(request, auth.denial)

  const dataset = resolveAssetDataset(request)
  if (!dataset) return apiFail(request, 'INVALID_ARGUMENT')

  /*
    `.stream()` — a Node stream of typed snapshots through the collection's
    converter — NOT `.get()` and NOT `paginate()`. `.get()` would buffer the
    whole collection in memory before writing a byte; `paginate` caps a page,
    and an export that stops at a page is a lie about the set it names.

    The cast is real work, not decoration: the Admin SDK types `stream()` as
    `NodeJS.ReadableStream`, which erases the element type its own doc comment
    promises ("A stream of QueryDocumentSnapshot"). This is the one boundary
    where that type is re-asserted; `snap.data()` is `Asset` from here on because
    the converter really does hydrate through `AssetSchema`.
  */
  const snapshots = dataset.query.stream() as AsyncIterable<
    QueryDocumentSnapshot<Asset>
  >

  /*
    One cid for the header AND the truncation row. `.stream()` can fail after
    the 200 and the header row are already on the wire — a Firestore read error
    ten thousand rows in — and no envelope can retract that. So the failure is
    made observable in the only two places left: the file ends with a
    `__EXPORT_TRUNCATED__` row carrying this id, and the response carries the
    same id on `x-correlation-id`. Resolved ONCE so the file and the header
    cannot name different requests.
  */
  const correlationId = resolveCorrelationId(request)
  const body = toCsvStream(
    snapshots,
    ASSET_EXPORT_HEADER,
    (snapshot) => toAssetCsvCells(snapshot.data()),
    {
      correlationId,
      onError: (error) => {
        log
          .child({ cid: correlationId })
          .error('[export] csv stream failed mid-flight', { error })
      },
    },
  )

  /*
    Bytes + Content-Disposition, not the envelope: `apiOk` returns
    `Response.json` and structurally cannot carry a stream. Failure above still
    goes through `apiFail`, because a plain `<a download>` navigation saves
    whatever the server sends — an error must be a real status code.

    `charset=utf-8` is load-bearing, not boilerplate: asset names are free text
    (1–120 chars, no character class), and a non-ASCII name read as latin-1 is
    mojibake in the one column a human reads.
  */
  return downloadResponse(body, {
    contentType: 'text/csv; charset=utf-8',
    filename: assetDatasetFilename(dataset.status, 'csv'),
    correlationId,
  })
}
