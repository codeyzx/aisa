'use server'

/**
 * Storage example actions — the DOWNLOAD and DELETE halves of the demo. (Upload
 * is not here: it is a presigned direct PUT, so its entry is the route handler
 * at app/api/storage/upload-url, which the browser calls before talking to
 * storage itself.)
 *
 * These live under the example route group rather than in `lib/actions/` on
 * purpose: `lib/actions/<entity>.action.ts` is the home for ENTITY actions (see
 * docs/reference/contracts/data.md), and storage is not an entity — there is no
 * schema, no collection, no repo. Keeping them here also means the whole demo
 * still deletes in one shot (`trash "app/(app)/(examples)"`) without stranding a
 * storage action in the shared action layer.
 *
 * Both are PROGRAMMATIC entries (`<verb>Action` + `runAction`): they are button
 * -triggered and the caller stays on the page, so they return an `ActionResult`
 * envelope rather than redirecting.
 */
import * as z from 'zod'

import { runAction, type ActionResult } from '@/lib/data/action-result'
import { isStorageKeyForOwner, STAGING_PREFIX } from '@/lib/storage/keys'
import { deleteObject, presignDownload } from '@/lib/storage/s3'

/**
 * A key arriving from the client is UNTRUSTED — it is a path, and the caller
 * could send someone else's. Reads/deletes are therefore re-scoped to the
 * session uid below; this schema only enforces the coarse shape.
 */
const ObjectKeySchema = z.string().min(1).max(1024)

/**
 * Presign a short-lived download URL for one object.
 *
 * The ownership check is the whole point: `presignDownload` will happily sign
 * ANY key, so without this an authenticated user could read every other user's
 * uploads by editing the key. The session uid — never a client-supplied id — is
 * the tenant boundary, exactly as it is when the key is minted.
 */
export async function presignDownloadAction(
  key: string,
): Promise<ActionResult<string>> {
  return runAction('storage:read', async (session) => {
    const parsed = ObjectKeySchema.parse(key)
    if (!isStorageKeyForOwner(parsed, STAGING_PREFIX, session.uid)) {
      // Same opaque failure as a missing object: do not confirm existence.
      throw new Error('not found')
    }
    return presignDownload({ key: parsed })
  })
}

/** Delete one object, scoped to the caller's own namespace. */
export async function deleteObjectAction(
  key: string,
): Promise<ActionResult<null>> {
  return runAction('storage:write', async (session) => {
    const parsed = ObjectKeySchema.parse(key)
    if (!isStorageKeyForOwner(parsed, STAGING_PREFIX, session.uid)) {
      throw new Error('not found')
    }
    await deleteObject({ key: parsed })
    return null
  })
}
