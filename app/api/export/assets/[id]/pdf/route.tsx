import { AssetDocument } from '@/features/asset/asset.document'
import { pdfRouteHandler } from '@/lib/export/pdf'
import { getAsset } from '@/features/asset/asset.repo'

/**
 * Serve one asset as its printable card (a PDF).
 *
 * THIS FILE IS THE INTEGRATION POINT. It is the whole of what a new printable
 * document costs: a `load`, a `render`, a `filename`, and a path.
 * Everything repeatable — the gate, the params, the 404, the buffer, the
 * `Content-Disposition` — lives in `lib/export/pdf.ts` and is not restated here.
 * Adding a document is adding a route, which every Next developer already knows
 * how to do; there is no map to remember to extend.
 *
 * GATE: `asset:read`, NOT `export:read`, and the difference is deliberate.
 * `export:read` is about BULK EGRESS, not file format: `/csv` and
 * `/xlsx` hand over the whole collection and are admin-only, while this hands
 * over ONE document — the same set `/assets` already shows any signed-in user.
 * Gating it on `export:read` would refuse a `user` the very row they are looking
 * at. Without this comment the two routes read as an inconsistency and the next
 * reader "fixes" one of them.
 */
export const GET = pdfRouteHandler({
  capability: 'asset:read',
  load: getAsset,
  render: (asset) => <AssetDocument item={asset} />,
  // The server-minted CODE, not the name: a name is untrusted user input (1–120
  // chars, no character class) and would put a `/` or a quote straight into a
  // response header. `Content-Disposition` owns the filename, so it must not be
  // built from what a user types — the code (`AST-0026`) is safe and meaningful.
  filename: (asset) => `asset-${asset.code}.pdf`,
})
