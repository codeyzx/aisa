import 'server-only'

import type { ReactElement } from 'react'
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer'

import { resolveCorrelationId } from '@/lib/api/cid'
import { apiFail, apiFailFrom, apiFailFromDenial } from '@/lib/api/response'
import { authorizeSession } from '@/lib/auth/guards'
import { type Capability } from '@/lib/auth/rbac'
import { downloadResponse } from './download'

/**
 * The generic PDF route skeleton — separated from any domain renderer. It owns
 * the parts every printable document repeats — gate, params, load, 404, render,
 * `Content-Disposition` — and knows NOTHING about any entity. Adding a document
 * is adding a route file, not editing this one.
 *
 * This module imports nothing from `lib/schemas/*`, `lib/repos/*`, or
 * `components/pdf/*.document.tsx`, and that is the whole contract — if it ever
 * does, the central requirement is broken and the seam has become a domain
 * module wearing a generic name. The domain arrives through `PdfDocumentConfig`.
 *
 * WHY NOT A REGISTRY: Next's file-system router ALREADY models "a URL → a
 * handler". A `Record<slug, renderer>` is a hand-kept variant of it — the
 * "local variant of what the system already models" the non-negotiables forbid.
 * A registry route tends to collapse the same way: an untyped
 * `RENDERERS: Record<string, ...>` with an options bag union'd across every
 * document, which then breeds MORE parallel maps keyed by the same string (a
 * per-document guard, a per-document id, both `Partial<Record<...>>`), so a
 * missing key is a SILENTLY UNGATED DOCUMENT rather than a type error. That is a
 * safety cost, not a typing preference.
 */

/**
 * What a document module must provide to become a route.
 *
 * Generic in `T` — the loaded entity — so `render` and `filename` are checked
 * against what `load` actually returns. This is the typing the registry shape
 * cannot have: `Record<string, PdfDocument<any>>` needs an existential or an
 * `any`, which erases the check at the exact boundary that parses untrusted
 * input.
 */
export interface PdfDocumentConfig<T> {
  /**
   * The capability required to pull this document.
   *
   * Per-config rather than fixed, because the line is BULK EGRESS, not file
   * format: a one-document PDF stays `asset:read` — the same set
   * `/assets` already hands over — while `/csv` and `/xlsx` take `export:read`.
   */
  capability: Capability
  /** Load the entity by its id. `null` becomes a 404 — see `pdfRouteHandler`. */
  load: (id: string) => Promise<T | null>
  /** Build the react-pdf document element for the loaded entity. */
  render: (data: T) => ReactElement<DocumentProps>
  /** The download filename, derived from the entity. */
  filename: (data: T) => string
}

/**
 * Build a `GET` handler that serves one document as a PDF.
 *
 * THE FAILURE PATH IS THE ENVELOPE; THE SUCCESS PATH IS NOT. A success
 * is bytes plus `Content-Disposition` — `apiOk` returns `Response.json` and
 * cannot carry it, and base64-in-JSON would need client JS to reassemble a file
 * the browser already knows how to save. Failures still go through
 * `apiFail`, because a `<a download>` navigation shows the reader whatever the
 * server sends: an error MUST be a real status code, or a 200 carrying an error
 * page gets saved as a .pdf and opens as garbage.
 *
 * `renderToBuffer`, not `renderToStream`: react-pdf hands back a NODE stream and
 * a Next 16 route answers with a WEB `ReadableStream`, so streaming here would
 * buy a conversion and nothing else. A single document is bounded by definition
 * — this is the division where a PDF is handed an id and CSV is handed a
 * query. The dataset formats stream; the document does not need to.
 */
export function pdfRouteHandler<T>(config: PdfDocumentConfig<T>) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    // Gated inline, server-side — NOT `requireCapability`, which `redirect()`s.
    // A 307 to /login in answer to a download is a login page saved as a .pdf,
    // which reads to the user as a corrupt file rather than as a refusal. Same
    // reasoning as app/api/storage/upload-url/route.ts, whose header spells it
    // out; its raw NextResponse.json body is a pre-envelope shape the response
    // envelope exists to rewire, so it is not copied here.
    const auth = await authorizeSession(config.capability)
    if (!auth.ok) return apiFailFromDenial(request, auth.denial)

    // The fallible body is wrapped: a Firestore error in `load`, a throw in
    // `render` / `renderToBuffer`, or a bad `filename` must become an ENVELOPE
    // with a cid — never Next's framework 500, which a `<a download>` navigation
    // saves as a corrupt .pdf with nothing to correlate in the log.
    try {
      const { id } = await context.params
      const data = await config.load(id)
      if (!data) return apiFail(request, 'NOT_FOUND')

      const buffer = await renderToBuffer(config.render(data))

      // `Uint8Array` view over the Node Buffer: a Response body wants a web
      // BodyInit, and a bare Buffer is only accepted by accident of Buffer
      // extending Uint8Array. Being explicit keeps this honest under a stricter
      // lib.dom.
      return downloadResponse(new Uint8Array(buffer), {
        contentType: 'application/pdf',
        filename: config.filename(data),
        correlationId: resolveCorrelationId(request),
      })
    } catch (error) {
      return apiFailFrom(request, error)
    }
  }
}
