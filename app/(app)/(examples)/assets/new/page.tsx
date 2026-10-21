import { type Metadata } from 'next'

import { createAssetFormAction } from '@/features/asset/asset.action'
import { requireCapability } from '@/lib/auth/guards'
import { safeInternalPath } from '@/lib/safe-path'
import { Page } from '@/components/shell/page-container'

import { AssetForm } from '../_components/asset-form'
import { loadAssetFormSearchParams } from '../search-params'

export const metadata: Metadata = {
  title: 'Aset baru',
}

/**
 * Example create page — the ONE create surface, for every navigation mode: a soft
 * click from the list, a shared link, a reload, a JS-off client. An intercepted
 * `@modal/(.)new` variant used to shadow this on soft navigation and was
 * deleted: a modal cannot serve a JS-off request at all, so the intercepted
 * route could never answer one. See
 * `scripts/structure/checks/one-surface-per-url.ts` for the full argument.
 *
 * Gate on the write capability FIRST (so read-only users never reach a form they
 * cannot submit), then render the client form. The action re-checks authz
 * server-side anyway.
 */
interface NewItemPageProps {
  // Next 16: `searchParams` is a Promise. `?returnTo` is the list URL to return
  // to after a save — validated to a same-origin path here, and re-validated in
  // the action before it is ever used as a redirect target.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function NewItemPage({ searchParams }: NewItemPageProps) {
  await requireCapability('asset:write')

  const { returnTo } = loadAssetFormSearchParams(await searchParams)
  // Off-site or malformed `?returnTo` (`//evil.com`, `/\evil`, a bare word) falls
  // back to `/assets`. This is the guard on the PAGE; the action re-checks the
  // POSTed value independently.
  const safeReturnTo = safeInternalPath(returnTo, '/assets')

  return (
    // `Page.Root`, like every other page in the shell — these two form pages were
    // the only ones hand-rolling their own heading, which is most of why they
    // read as unfinished next to the list they came from.
    //
    // `max-w-2xl`, left-aligned, NOT centred: the header sits full-bleed above a
    // narrow column, which is what makes it read as a record inside an app
    // rather than a sign-up card. `w-full` is load-bearing — see Page.Root.
    <Page.Root className="w-full max-w-2xl">
      <Page.Header
        title="Aset baru"
        description="Buat entitas contoh. Nama dan nilai wajib diisi."
      />
      <AssetForm
        action={createAssetFormAction}
        returnTo={safeReturnTo}
        cancelHref={safeReturnTo}
      />
    </Page.Root>
  )
}
