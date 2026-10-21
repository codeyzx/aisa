import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireCapability } from '@/lib/auth/guards'
import { Page } from '@/components/shell/page-container'

import { CreateAccountForm } from '../_components/create-account-form'

export const metadata: Metadata = {
  title: 'Buat akun',
}

/**
 * The ONE account-creation surface — a full page, like every other create form
 * in this repo, and for the reason `one-surface-per-url` enforces repo-wide: an
 * intercepted modal variant cannot server-render at all, so it can never answer
 * a direct load, a reload, or a JavaScript-off request.
 *
 * Gated on `admin:users:manage`, NOT on `admin:users:read`: reading the
 * directory is a helpdesk authority, and minting a credential is not
 * (`rbac.ts` argues the split). Gating here also means a read-only admin never
 * reaches a form they could not submit — the action re-checks regardless.
 *
 * IMPERSONATION is refused before the form is drawn. `createAccountAction` calls
 * `requireRealAdministrator` and would refuse an impersonated caller anyway, so
 * this check exists to keep the UI honest rather than to authorize: a control
 * that only ever produces a refusal is a control that should not be on screen.
 * (Today it is also unreachable — an impersonated session resolves to the
 * TARGET's role, which holds no admin capability — but that is a property of the
 * current `ROLES`, not a guarantee about the next one.)
 */
export default async function NewAccountPage() {
  const session = await requireCapability('admin:users:manage')
  if (session.impersonator) redirect('/403')

  return (
    <Page.Root className="w-full max-w-2xl">
      <Page.Header
        eyebrow="Admin"
        title="Buat akun"
        description="Akun dibuat dengan kata sandi sementara yang ditampilkan satu kali, dan pemiliknya wajib menggantinya saat pertama kali masuk."
      />
      <CreateAccountForm />
    </Page.Root>
  )
}
