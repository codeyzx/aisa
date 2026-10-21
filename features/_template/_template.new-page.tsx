// TEMPLATE — copy-me starter for a new entity's CREATE surface. See
// `_template.schema.ts` for the token legend. Copy to
// `app/(app)/<entities>/new/page.tsx`, beside the list and edit copies of the
// two sibling route templates.
//
// The `./__entity__.*` imports are relative here so the copy compiles beside its
// generated siblings; once this file sits under `app/` none of them resolve —
// repoint every one at `@/features/<entity>/…`.
//
// ONE create surface, for every way a reader arrives: a click from the list, a
// shared link, a reload. Do NOT add an intercepted `@modal/(.)new` variant that
// shadows it — two surfaces answering one URL drift into two behaviours, and
// `scripts/structure/checks/one-surface-per-url.ts` refuses it.
//
// The form is a client island; this page is not. What stays on the server is the
// capability gate and the `?returnTo` validation — both boundaries, and neither
// safe to move into a component the browser owns.
//
// EXCLUDED from typecheck by the `_template.*` name.

import { type Metadata } from 'next'

import { requireCapability } from '@/lib/auth/guards'
import { safeInternalPath } from '@/lib/safe-path'
import { Page } from '@/components/shell/page-container'

import { create__Entity__FormAction } from './__entity__.action'
import { __ENTITY___WRITE } from './__entity__.capability'
import { __Entity__Form } from './__entity__.form'
import { load__Entity__FormSearchParams } from './__entity__.search-params'

export const metadata: Metadata = {
  title: '__Entity__ baru',
}

interface New__Entity__PageProps {
  // Next 16: `searchParams` is a Promise. `?returnTo` carries the list URL to
  // return to after a save — validated to a same-origin path here, and
  // re-validated in the action before it is used as a redirect target.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function New__Entity__Page({
  searchParams,
}: New__Entity__PageProps) {
  // The WRITE capability, and it comes first — a read-only reader must not reach
  // a form they cannot submit. This is not the security boundary: the action
  // re-checks server-side, because a form action is reachable without ever
  // rendering this page.
  //
  // The capability comes from `__entity__.capability.ts`, which will not compile
  // until you declare it in `lib/auth/rbac.ts` — see that file.
  await requireCapability(__ENTITY___WRITE)

  const { returnTo } = load__Entity__FormSearchParams(await searchParams)
  // An off-site or malformed `?returnTo` (`//evil.example`, `/\evil`, a bare
  // word) falls back to the list. Without this, the value a reader controls
  // becomes a redirect target — an open redirect. The fallback repeats the
  // address `LIST_PATH` owns in `__entity__.search-params.ts`; a route rename
  // has to touch both.
  const safeReturnTo = safeInternalPath(returnTo, '/__entities__')

  return (
    // `max-w-2xl`, left-aligned, NOT centred: a full-bleed header above a narrow
    // column reads as a record inside an app rather than a sign-up card.
    // `w-full` is load-bearing — see `Page.Root`, where auto margins on a flex
    // child otherwise shrink the box to fit-content and the max-width never
    // applies.
    <Page.Root className="w-full max-w-2xl">
      <Page.Header
        title="__Entity__ baru"
        description="Ganti deskripsi ini dengan apa yang perlu diketahui pembaca sebelum mengisi."
      />
      {/* `cancelHref` and `returnTo` get the SAME value, so abandoning and
          saving land in the same place — the list the reader opened this form
          from. `returnTo` POSTs as a hidden field, which is what carries it
          through a submit made before the bundle hydrates. */}
      <__Entity__Form
        action={create__Entity__FormAction}
        returnTo={safeReturnTo}
        cancelHref={safeReturnTo}
      />
    </Page.Root>
  )
}
