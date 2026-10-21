import * as z from 'zod'

import {
  apiFail,
  apiFailFrom,
  apiFailFromDenial,
  apiOk,
} from '@/lib/api/response'
import { authorizeSession } from '@/lib/auth/guards'
import { buildKey, STAGING_PREFIX } from '@/lib/storage/keys'
import { presignUpload } from '@/lib/storage/s3'
import {
  type UploadUrlResponse,
  UploadUrlRequestSchema,
} from '@/lib/storage/upload.contract'

/**
 * Mint a presigned direct-upload URL. This is the whole security boundary of the
 * default upload flow: after this responds, the browser talks to object storage
 * with no further server involvement, so every constraint on that upload must be
 * baked into the signature HERE.
 *
 * Gating: this is a public POST endpoint, so it re-checks auth server-side and
 * never trusts the caller. It is neither a server action nor a page:
 * - NOT `runAction` — that is for `'use server'` actions and returns an
 *   `ActionResult` envelope over the RSC boundary; an HTTP caller wants a status
 *   code, and `fetch` cannot act on `{ ok: false }` the way a client component
 *   can.
 * - NOT `requireCapability` — guards `redirect()`, and a 307 to /login in
 *   response to `fetch` is useless (the caller sees the login HTML as a 200).
 * So it does what `app/api/auth/session/route.ts` does: resolve the session via
 * the DAL, enforce authz inline, and answer the envelope with 401/403.
 */

export async function POST(request: Request) {
  // One gate, four boundaries: `authorizeSession` also refuses a session owing a
  // mandatory password change, which a hand-written `getSession` + `can()` pair
  // here silently would not.
  const auth = await authorizeSession('storage:write')
  if (!auth.ok) return apiFailFromDenial(request, auth.denial)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail(request, 'INVALID_ARGUMENT')
  }

  const parsed = UploadUrlRequestSchema.safeParse(body)
  if (!parsed.success) {
    // Zod field errors are legitimate `details` (docs/reference/contracts/http-api.md): they
    // are the caller's own input reflected back, not an internal.
    return apiFail(request, 'INVALID_ARGUMENT', z.treeifyError(parsed.error))
  }
  const { filename, contentType, size } = parsed.data

  // The tenant boundary: the key is derived from the VERIFIED session uid, so a
  // caller can only ever be signed into their own namespace. The client does not
  // get to propose a key.
  const key = buildKey({
    // Uploads land in STAGING; a submit promotes the referenced object into the
    // durable prefix (see docs/reference/contracts/storage.md). An object never
    // submitted stays here and is TTL-reaped.
    prefix: STAGING_PREFIX,
    ownerId: auth.session.uid,
    filename,
  })

  try {
    const url = await presignUpload({ key, contentType, contentLength: size })
    const response: UploadUrlResponse = { key, url }
    return apiOk(request, response)
  } catch (error) {
    // `apiFailFrom` logs the raw error keyed by cid and answers the code only,
    // never a hand-rolled console.error + 500 that would leak internals.
    return apiFailFrom(request, error)
  }
}
