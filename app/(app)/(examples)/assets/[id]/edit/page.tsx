import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { updateAssetFormAction } from '@/features/asset/asset.action'
import { assetFormValues } from '@/features/asset/asset.form-opts'
import { requireCapability } from '@/lib/auth/guards'
import { safeInternalPath } from '@/lib/safe-path'
import { getAsset } from '@/features/asset/asset.repo'
import { Page } from '@/components/shell/page-container'

import { AssetForm } from '../../_components/asset-form'
import { loadAssetFormSearchParams } from '../../search-params'

/**
 * Example edit page — the ONE edit surface, for every navigation mode: a row's
 * Edit link, a shared link, a reload, a JS-off client. An intercepted
 * `@modal/(.)[id]/edit` variant used to shadow this on soft navigation and was
 * deleted for the same reason as the create page's intercepted variant — a
 * modal cannot serve a JS-off request at all — and it also carried a dev-only
 * quirk where the first soft nav to an uncompiled dynamic intercept
 * hard-navigated anyway.
 *
 * Gate on the write capability FIRST, load the asset (404 if gone), then render
 * the form — passing the asset's current values as `defaultValues` and a
 * `updateAssetFormAction` with `id` bound. The bound action still re-checks authz
 * server-side — the real boundary.
 */
interface EditItemPageProps {
  // Next 16: `params` and `searchParams` are Promises — await before reading.
  params: Promise<{ id: string }>
  // `?returnTo` — the list URL to return to after a save; validated here and
  // re-validated in the action.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The one page whose title is worth deriving. `Edit · AISA` on every row
 * makes a tab useless the moment two are open, which is exactly when a title is
 * for.
 *
 * The second `getAsset` is free: the repo wraps it in React `cache()`, so this
 * and the page below dedupe to ONE read per render pass. That is the reason
 * `cache()` is on the repo — this is the call site that collects on it.
 *
 * No `notFound()` here. Metadata resolves BEFORE the page renders, so throwing
 * would 404 the route from the title, and the page below already owns that
 * decision. A deleted row falls back to the plain noun.
 */
export async function generateMetadata({
  params,
}: EditItemPageProps): Promise<Metadata> {
  // Guard BEFORE the read. Metadata resolves before the page renders, so without
  // this an unauthorized visitor's request would still read the asset here — the
  // repo uses the Admin SDK, which bypasses auth — even though the page below
  // redirects. The session is cache()d, so the page's own guard dedupes.
  await requireCapability('asset:write')
  const { id } = await params
  const item = await getAsset(id)
  return { title: item ? `Ubah ${item.name}` : 'Ubah aset' }
}

export default async function EditItemPage({
  params,
  searchParams,
}: EditItemPageProps) {
  await requireCapability('asset:write')

  const { id } = await params
  const item = await getAsset(id)
  if (!item) notFound()

  const { returnTo } = loadAssetFormSearchParams(await searchParams)
  // Off-site or malformed `?returnTo` falls back to `/assets`. Page-side guard;
  // the action re-checks the POSTed value independently.
  const safeReturnTo = safeInternalPath(returnTo, '/assets')

  return (
    <Page.Root className="w-full max-w-2xl">
      {/* The row's own name, not "Edit asset" — the reader already knows what
          they clicked; what they need confirmed is WHICH one. Same reason
          generateMetadata above titles the tab with it. */}
      <Page.Header eyebrow="Ubah" title={item.name} />
      <AssetForm
        action={updateAssetFormAction.bind(null, id, item.attachmentKey)}
        assetId={id}
        defaultValues={assetFormValues(item)}
        submitLabel="Simpan perubahan"
        returnTo={safeReturnTo}
        cancelHref={safeReturnTo}
      />
    </Page.Root>
  )
}
