import 'server-only'

/**
 * The staging → durable attachment lifecycle, shared by every entity that
 * persists an uploaded object. An upload lands in the STAGING prefix
 * (`lib/storage/keys.ts`) and is TTL-reaped by the bucket unless a submit
 * PROMOTES it into the durable prefix — so any entity that keeps an upload must
 * run this on save, or the object vanishes. The `asset` feature is the worked
 * example (`features/asset/asset.action.ts`).
 *
 * This lives in `lib/storage/` — not inside a feature — because it is generic
 * storage machinery with no entity-specific logic: the storage contract already
 * names "the staging → durable promotion" as its own (`docs/reference/contracts/
 * storage.md`), and it must survive deleting the `assets` example. The one thing
 * each entity owns — the name its orphan audit is recorded under — is passed in
 * as `orphanAuditTag`, so a reap is attributed to the entity that triggered it.
 */
import type { Session } from '@/lib/auth/session'
import { audit } from '@/lib/data/audit'
import { DeadlineExceededError } from '@/lib/data/deadline'
import { log } from '@/lib/log'
import { isStorageKeyForOwner, promoteKey, STAGING_PREFIX } from './keys'
import { deleteObject, moveObject } from './s3'

export interface AttachmentPromotion {
  attachmentKey: string | undefined
  moved: boolean
}

/** A create can reference only the fresh upload produced for that submission. */
export function requireFreshStagingAttachment(
  key: string | undefined,
  ownerId: string,
): void {
  if (key && !isStorageKeyForOwner(key, STAGING_PREFIX, ownerId)) {
    throw new Error('attachment must be a freshly uploaded staging key')
  }
}

/** An edit may retain its loaded durable key or submit a fresh owner-scoped upload. */
export function requireValidAttachmentUpdate(
  key: string | undefined,
  ownerId: string,
  expectedAttachmentKey: string | undefined,
): void {
  if (!key || key === expectedAttachmentKey) return
  requireFreshStagingAttachment(key, ownerId)
}

/**
 * Promote an attachment before its document write. Durable keys pass through for
 * edits that keep their existing attachment, and `moved` records whether this
 * write owns a compensating cleanup if it fails.
 *
 * A promotion whose copy landed but whose staging delete did not is a SUCCESS
 * with a leftover, not a failure — `moveObject` owns that distinction and the
 * argument for it. Reporting it as a failure here would be a defect: this
 * runs BEFORE the document write and outside the caller's compensating catch, so
 * a throw at this point abandons a durable object nobody holds a reference to,
 * and the reaper covers only the staging prefix. The leftover itself is
 * TTL-reaped; it is logged because a failing delete is worth knowing about.
 */
export async function promoteAttachment(
  key: string | undefined,
): Promise<AttachmentPromotion> {
  if (!key) return { attachmentKey: undefined, moved: false }

  const attachmentKey = promoteKey(key)
  const moved = attachmentKey !== key
  if (moved) {
    const { sourceDeleted } = await moveObject({
      sourceKey: key,
      destKey: attachmentKey,
    })
    if (!sourceDeleted) {
      log.warn(
        '[storage] promoted attachment but could not delete the source',
        {
          sourceKey: key,
          attachmentKey,
        },
      )
    }
  }
  return { attachmentKey, moved }
}

/**
 * Reap an unreferenced object without rewriting a completed document mutation as
 * a failure. The audit record — under the caller's `orphanAuditTag` — is the
 * durable signal for later orphan recovery.
 */
export async function reapAttachment(
  session: Session,
  key: string,
  orphanAuditTag: string,
): Promise<void> {
  try {
    await deleteObject({ key })
  } catch {
    audit(session, orphanAuditTag, key)
  }
}

/**
 * Compensate only a move made for this attempted write. A deadline bounds the
 * await, not Firestore itself, so it may still commit and must keep its object.
 */
export async function reapPromotionOnFailedWrite(
  session: Session,
  error: unknown,
  promotion: AttachmentPromotion,
  orphanAuditTag: string,
): Promise<void> {
  if (
    promotion.moved &&
    promotion.attachmentKey &&
    !(error instanceof DeadlineExceededError)
  ) {
    await reapAttachment(session, promotion.attachmentKey, orphanAuditTag)
  }
}
