// TEMPLATE — copy-me starter for a new entity's EDIT surface. See
// `_template.schema.ts` for the token legend. Copy to
// `app/(app)/<entities>/[id]/edit/page.tsx`, beside the list and create copies
// of the two sibling route templates.
//
// The `./__entity__.*` imports are relative here so the copy compiles beside its
// generated siblings; once this file sits under `app/` none of them resolve —
// repoint every one at `@/features/<entity>/…`.
//
// ONE edit surface, for every way a reader arrives: a row's Ubah link, a shared
// link, a reload. Do NOT add an intercepted `@modal/(.)[id]/edit` variant that
// shadows it — two surfaces answering one URL drift into two behaviours, and
// `scripts/structure/checks/one-surface-per-url.ts` refuses it.
//
// Same form component as the create page: it takes the bound update action and
// the stored values, and knows nothing about which of the two it is serving.
//
// EXCLUDED from typecheck by the `_template.*` name.

import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireCapability } from '@/lib/auth/guards'
import { safeInternalPath } from '@/lib/safe-path'
import { Page } from '@/components/shell/page-container'

import { update__Entity__FormAction } from './__entity__.action'
import { __ENTITY___WRITE } from './__entity__.capability'
import { __Entity__Form } from './__entity__.form'
import { __entity__FormValues } from './__entity__.form-opts'
import { get__Entity__ } from './__entity__.repo'
import { load__Entity__FormSearchParams } from './__entity__.search-params'

interface Edit__Entity__PageProps {
  // Next 16: `params` and `searchParams` are both Promises — await before
  // reading either.
  params: Promise<{ id: string }>
  // `?returnTo` — the list URL to return to after a save; validated here and
  // re-validated in the action.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The one title worth deriving. The same static word on every row makes a tab
 * useless the moment two are open, which is exactly when a title earns its keep.
 *
 * The second `get__Entity__` costs nothing: the repo wraps it in React `cache()`,
 * so this and the page below dedupe to ONE read per render pass. This is the
 * call site that collects on that `cache()`.
 *
 * NO `notFound()` here. Metadata resolves BEFORE the page renders, so throwing
 * would 404 the route from the title and take the page's own decision away from
 * it. A deleted row falls back to the plain noun.
 */
export async function generateMetadata({
  params,
}: Edit__Entity__PageProps): Promise<Metadata> {
  // The gate BEFORE the read, and it is not redundant with the page's. Metadata
  // resolves first, so without this an unauthorized visitor's request would
  // still read the document here — the repo uses the Admin SDK, which bypasses
  // Firestore rules — even though the page below redirects them. The session is
  // `cache()`d, so the page's guard costs nothing extra.
  await requireCapability(__ENTITY___WRITE)
  const { id } = await params
  const item = await get__Entity__(id)
  return { title: item ? `Ubah ${item.name}` : 'Ubah __entity__' }
}

export default async function Edit__Entity__Page({
  params,
  searchParams,
}: Edit__Entity__PageProps) {
  // The WRITE capability, before the read. The action re-checks server-side —
  // that is the real boundary; this one keeps a reader out of a form they could
  // never submit.
  //
  // The capability comes from `__entity__.capability.ts`, which will not compile
  // until you declare it in `lib/auth/rbac.ts` — see that file.
  await requireCapability(__ENTITY___WRITE)

  const { id } = await params
  const item = await get__Entity__(id)
  // A 404, not an empty form. `get__Entity__` answers `null` for a row that was
  // never there and for one deleted a moment ago; rendering a blank form for
  // either would invite the reader to re-create it under a URL that no longer
  // means anything.
  if (!item) notFound()

  const { returnTo } = load__Entity__FormSearchParams(await searchParams)
  // An off-site or malformed `?returnTo` falls back to the list — the page-side
  // half of the open-redirect guard; the action re-checks the POSTed value
  // independently. The fallback repeats the address `LIST_PATH` owns in
  // `__entity__.search-params.ts`; a route rename has to touch both.
  const safeReturnTo = safeInternalPath(returnTo, '/__entities__')

  return (
    <Page.Root className="w-full max-w-2xl">
      {/* The row's own name, not "Ubah __entity__": the reader knows what they
          clicked — what they need confirmed is WHICH one. Same reason
          `generateMetadata` titles the tab with it. */}
      <Page.Header eyebrow="Ubah" title={item.name} />
      {/* `.bind(null, id)` fixes the first parameter of
          `update__Entity__FormAction`, so the form still posts the `(prev,
          formData)` pair `useActionState` expects and the id never has to be
          rendered as a field. `__entity__FormValues` is the ONE stored-values →
          controlled-inputs projection, shared by every edit surface — the form
          itself takes an action it cannot inspect, so it is not a boundary and
          the action re-validates everything it receives. */}
      <__Entity__Form
        action={update__Entity__FormAction.bind(null, id)}
        defaultValues={__entity__FormValues(item)}
        submitLabel="Simpan perubahan"
        returnTo={safeReturnTo}
        cancelHref={safeReturnTo}
      />
    </Page.Root>
  )
}
