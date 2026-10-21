import { CORRELATION_ID_HEADER } from '@/lib/api/cid'
import { attachmentDisposition } from '@/lib/http/content-disposition'

/** A download can be sent progressively or from a completed in-memory document. */
export type DownloadBody = ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>

export interface DownloadOptions {
  contentType: string
  filename: string
  /**
   * REQUIRED, like the envelope's. `cid.ts` says every route echoes the cid, and
   * a download is the one response where it matters MOST: bytes cannot carry an
   * envelope, so a file that arrives wrong has nothing else to correlate to a
   * server log. Resolve it with `resolveCorrelationId(request)` and, for a
   * streamed body, pass the SAME value to the stream so a truncated file and its
   * response header name one id.
   */
  correlationId: string
}

/**
 * Successful binary download response. Route failures still use `apiFail`.
 *
 * The header itself comes from `lib/http/content-disposition.ts` and is NOT
 * built here: a presigned storage URL carries the same header as a
 * `response-content-disposition` parameter (`lib/storage/s3.ts`), and the two
 * layers spelling it separately is how one download starts forcing a save while
 * the other quietly opens inline.
 */
export function downloadResponse(
  body: DownloadBody,
  { contentType, filename, correlationId }: DownloadOptions,
): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': attachmentDisposition(filename),
      [CORRELATION_ID_HEADER]: correlationId,
    },
  })
}
