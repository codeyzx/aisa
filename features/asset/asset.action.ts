'use server'

/**
 * Asset server actions — ONE entry per operation (see
 * docs/reference/contracts/data.md), all grouped by entity in this file. Two entry KINDS,
 * distinguished by naming:
 *
 *   - `<verb><Entity>FormAction` — a FORM entry. FormData in, redirect / form
 *     state out. Wraps `runFormAction` (the form counterpart to `runAction`).
 *     Progressive enhancement: submits without JS. For form-triggered mutations.
 *   - `<verb><Entity>Action` — a PROGRAMMATIC entry. Typed args in, an
 *     `ActionResult<T>` out; never throws across the RSC boundary, never
 *     redirects. Wraps `runAction`. For button / imperative mutations.
 *
 * Both wrappers do the same thing (auth-gate -> validate -> repo write -> audit
 * -> revalidate); they differ only in auth behavior (redirect vs envelope) and
 * output. The repo owns the transaction. Never expose one operation through both
 * kinds. (Shared form field config lives in `asset.form-opts.ts`.)
 */
import 'server-only'

import { revalidatePath } from 'next/cache'
import { createServerValidate } from '@tanstack/react-form-nextjs'
import * as z from 'zod'

import { runAction, type ActionResult } from '@/lib/data/action-result'
import { NotFoundError } from '@/lib/data/domain-error'
import { toFormErrors } from '@/lib/data/form-validation'
import { runFormAction } from '@/lib/data/form-action'
import { audit } from '@/lib/data/audit'
import {
  createAsset,
  deleteAsset,
  deleteAssets,
  getAsset,
  updateAsset,
} from './asset.repo'
import {
  ASSET_BULK_DELETE_MAX,
  AssetCreateSchema,
  type Asset,
  type AssetCreate,
  type AssetFormValues,
} from './asset.schema'
import { presignDownload } from '@/lib/storage/s3'
import { safeInternalPath } from '@/lib/safe-path'

import {
  promoteAttachment,
  reapAttachment,
  reapPromotionOnFailedWrite,
  requireFreshStagingAttachment,
  requireValidAttachmentUpdate,
} from '@/lib/storage/attachment-lifecycle'
import { assetFormOpts } from './asset.form-opts'

/**
 * The audit tag an orphaned asset object is recorded under when its reap fails.
 * The generic lifecycle in `lib/storage/attachment-lifecycle.ts` takes this per
 * entity, so each entity's orphans are attributed to itself.
 */
const ASSET_ATTACHMENT_ORPHAN = 'asset.attachment.orphan'

/**
 * The ONE form-values → AssetCreate projection, shared by the server validator
 * and BOTH mutations — so adding a field is a one-line change here instead of
 * three copies that silently desync (the bug that once dropped `value` on save).
 *
 * `'' → undefined` for the optional fields: an empty-string sentinel on the doc
 * would make cleanup call `deleteObject({ key: '' })`. `value` is left as POSTed
 * so `AssetCreateSchema`'s `z.coerce.number` can turn the string into a number.
 */
function assetFormInput(values: AssetFormValues) {
  return {
    name: values.name,
    description: values.description || undefined,
    value: values.value,
    status: values.status,
    attachmentKey: values.attachmentKey || undefined,
  }
}

/**
 * Parse the form values into a validated `AssetCreate` for the write. Called in a
 * mutation `run`, where `runFormAction` has ALREADY validated, so `.parse` will
 * not throw — its job is to apply the schema's COERCIONS (notably `value`: the
 * POSTed string becomes a number) so the repo persists real types, never the raw
 * FormData strings.
 */
function toAssetInput(values: AssetFormValues): AssetCreate {
  return AssetCreateSchema.parse(assetFormInput(values))
}

/**
 * Server-side validation for the asset forms — runs even without JS (zod is the
 * source of truth). Failures merge back into the client form via `mergeForm`.
 *
 * Each issue is scoped to the FIELD it came from. Returning a bare string here
 * would land it as a FORM-level error instead: TanStack decides which it is by
 * the mere presence of a `fields` key (`isGlobalFormValidationError`), so a
 * string makes `formState.errors` non-empty and the message renders TWICE —
 * once under the input (from the client validator) and once in the form-level
 * alert. Issues with no path are genuinely form-level and go to `form`.
 */
const validateAssetForm = createServerValidate({
  ...assetFormOpts,
  onServerValidate: ({ value }) =>
    toFormErrors<keyof typeof value & string>(
      AssetCreateSchema.safeParse(assetFormInput(value)),
    ),
})

/** FORM entry (create). See `runFormAction` for the auth/validate/redirect flow. */
export async function createAssetFormAction(
  _prev: unknown,
  formData: FormData,
) {
  return runFormAction({
    capability: 'asset:write',
    formData,
    validate: validateAssetForm,
    // The list URL the form was opened from, POSTed as a hidden field so it
    // survives a no-JS submit. Re-validated to a same-origin relative path HERE
    // — a SECOND time, after the page already validated the `?returnTo` it read —
    // because a POST body is attacker-controllable and the redirect target must
    // never be trusted straight off the wire. An absent or off-site value falls
    // back to `/assets`.
    redirectTo: safeInternalPath(
      formData.get('returnTo')?.toString(),
      '/assets',
    ),
    run: async (session, values) => {
      const input = toAssetInput(values)
      requireFreshStagingAttachment(input.attachmentKey, session.uid)
      const promotion = await promoteAttachment(input.attachmentKey)
      let item
      try {
        item = await createAsset({
          ...input,
          attachmentKey: promotion.attachmentKey,
        })
      } catch (error) {
        await reapPromotionOnFailedWrite(
          session,
          error,
          promotion,
          ASSET_ATTACHMENT_ORPHAN,
        )
        throw error
      }
      audit(session, 'asset.create', item.id)
      revalidatePath('/assets')
    },
  })
}

/**
 * FORM entry (edit). Same shape as create, but `id` is bound by the edit page
 * (`updateAssetFormAction.bind(null, id)`) and it writes via `updateAsset`. Reuses
 * the create validator — the edit form submits the same full field set.
 */
export async function updateAssetFormAction(
  id: string,
  expectedAttachmentKey: string | undefined,
  _prev: unknown,
  formData: FormData,
) {
  return runFormAction({
    capability: 'asset:write',
    formData,
    validate: validateAssetForm,
    // Same second-line validation as create: the returnTo rides in the POST body,
    // so it is re-checked against `safeInternalPath` here rather than trusted, and
    // falls back to `/assets` when absent or off-site.
    redirectTo: safeInternalPath(
      formData.get('returnTo')?.toString(),
      '/assets',
    ),
    run: async (session, values) => {
      const input = toAssetInput(values)
      requireValidAttachmentUpdate(
        input.attachmentKey,
        session.uid,
        expectedAttachmentKey,
      )
      const promotion = await promoteAttachment(input.attachmentKey)
      let result
      try {
        result = await updateAsset(
          id,
          {
            ...input,
            attachmentKey: promotion.attachmentKey,
          },
          expectedAttachmentKey,
        )
      } catch (error) {
        await reapPromotionOnFailedWrite(
          session,
          error,
          promotion,
          ASSET_ATTACHMENT_ORPHAN,
        )
        throw error
      }
      audit(session, 'asset.update', result.asset.id)
      // Reap the object the TRANSACTION actually replaced (doc first, object
      // second). Using the tx-current previous key — not a separate pre-read — a
      // replaced ('' -> undefined) or swapped attachment's old object is cleaned
      // up without this update's cleanup ever targeting a key a concurrent edit
      // already moved.
      const oldKey = result.previousAttachmentKey
      if (oldKey && oldKey !== promotion.attachmentKey) {
        await reapAttachment(session, oldKey, ASSET_ATTACHMENT_ORPHAN)
      }
      revalidatePath('/assets')
    },
  })
}

/**
 * PROGRAMMATIC entry (download an asset's attachment). Requires `asset:read` —
 * the SAME gate `/assets` uses, because reading the asset is what authorizes
 * reading its file. Resolves to a short-lived presigned GET URL.
 *
 * THE ID IS THE INPUT, NEVER THE KEY, and that is the whole authz argument.
 * The storage demo's `presignDownloadAction` takes a key from the
 * client and re-scopes it to the uploader's uid — correct for the demo, where
 * an object belongs to whoever uploaded it. WRONG here: an asset has no owner
 * field (`deleteAssetsAction` says so — "no per-row ownership check"), so admin B
 * must be able to download a file admin A attached to a shared asset. So the
 * client sends an asset id, the server reads `attachmentKey` OFF THE DOC, and a
 * key never crosses the wire inward. The read gate on the asset IS the gate on
 * its attachment — an untrusted key would need a scoping rule; a key you looked
 * up does not.
 *
 * This reuses `lib/storage/s3:presignDownload` — the general capability. What it
 * declines to reuse is the storage example's authz DECISION, which was never
 * general. Reuse the lib, not the demo's policy.
 *
 * A missing asset or an asset with no attachment is the SAME opaque `not found`:
 * the failure does not confirm which, exactly as the demo's does not confirm an
 * object's existence.
 */
export async function presignAssetAttachmentAction(
  id: string,
): Promise<ActionResult<string>> {
  return runAction('asset:read', async () => {
    const item = await getAsset(id)
    if (!item?.attachmentKey)
      throw new NotFoundError('asset attachment not found')
    return presignDownload({ key: item.attachmentKey })
  })
}

/**
 * PROGRAMMATIC entry (read one). Requires `asset:read`. The id is the input; the
 * gate resolves the caller and re-checks the capability server-side.
 *
 * It earns a slot for a reason the list reads do not: it is the read an AI tool
 * delegates to (`app/(app)/(examples)/ai/_actions.ts`). A tool's `execute` calls
 * THIS gated action rather than `getAsset` (the repo) directly, so a model-driven
 * read crosses the same `asset:read` boundary a human read would — the doctrine
 * in docs/reference/contracts/ai.md. A missing asset is a typed `not_found`.
 */
export async function getAssetAction(id: string): Promise<ActionResult<Asset>> {
  return runAction('asset:read', async () => {
    const item = await getAsset(id)
    if (!item) throw new NotFoundError('asset not found')
    return item
  })
}

/** PROGRAMMATIC entry (delete). Requires `asset:write`. Revalidates `/assets`. */
export async function deleteAssetAction(
  id: string,
): Promise<ActionResult<void>> {
  return runAction('asset:write', async (session) => {
    const attachmentKey = await deleteAsset(id)
    audit(session, 'asset.delete', id)
    if (attachmentKey)
      await reapAttachment(session, attachmentKey, ASSET_ATTACHMENT_ORPHAN)
    revalidatePath('/assets')
  })
}

/**
 * What a bulk delete is allowed to be handed. `.min(1)` because an empty bulk
 * delete is a bug at the call site, not a no-op worth succeeding at — and a
 * `ZodError` here collapses to `code:'invalid'` via `runAction`.
 *
 * `.max(ASSET_BULK_DELETE_MAX)` is the PRODUCT cap — the same limit the selection
 * UI enforces, so the schema max matches exactly what the reader is allowed to
 * accumulate. A larger array can only reach here from a caller bypassing the UI,
 * and for that it is a loud validation error (`code:'invalid'`), never a partial
 * delete. The repo separately guards Firestore's batch ceiling as a hard floor,
 * so this product cap can be lowered without weakening that infrastructure limit.
 */
const AssetIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(
    ASSET_BULK_DELETE_MAX,
    `Cannot delete more than ${ASSET_BULK_DELETE_MAX} at once`,
  )

/**
 * PROGRAMMATIC entry (bulk delete). Requires `asset:write`. Revalidates
 * `/assets`. Resolves to the number deleted, which is what the toast reports.
 *
 * ⚠️ THE AUTHZ HERE IS THE POINT, AND IT IS THE SAME GATE AS THE SINGLE DELETE —
 * `runAction('asset:write')` resolves the session and re-checks the capability
 * SERVER-SIDE on every call. The bulk bar's existence gates nothing: it is
 * client code, so a caller can invoke this action with any id array regardless
 * of what the UI rendered (UI gating is never trusted).
 *
 * Be precise about what that gate does and does not buy, because "re-checks
 * authz" is easy to over-read. It is capability-level: a signed-in principal
 * holding `asset:write` may delete ANY asset id it names, including ids it
 * never saw. There is no per-row ownership check — this entity has no owner
 * field to check one against. That is not a hole this action opened; it is
 * exactly the reach `deleteAssetAction` already has one id at a time, and bulk
 * changes the count, not the boundary. An entity with per-row rules would have
 * to enforce them INSIDE the loop, and a batch cannot short-circuit for it.
 */
export async function deleteAssetsAction(
  ids: string[],
): Promise<ActionResult<number>> {
  return runAction('asset:write', async (session) => {
    const parsed = AssetIdsSchema.parse(ids)
    const deleted = await deleteAssets(parsed)
    // One entry per document, under the SAME action name the single delete
    // audits with. A bulk-specific event would fork the audit trail: the same
    // fact ("this asset was deleted") would have to be searched for two ways.
    for (const { id } of deleted) audit(session, 'asset.delete', id)
    // Reap every attached object AFTER the docs are gone. `reapAttachment` never
    // throws, so `Promise.all` cannot reject — a bucket hiccup on one object
    // does not abandon the rest or fail the batch; each orphan announces itself.
    await Promise.all(
      deleted.map(({ attachmentKey }) =>
        attachmentKey
          ? reapAttachment(session, attachmentKey, ASSET_ATTACHMENT_ORPHAN)
          : undefined,
      ),
    )
    revalidatePath('/assets')
    return deleted.length
  })
}
