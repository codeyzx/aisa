import { type Metadata } from 'next'

import { Page } from '@/components/shell/page-container'
import { requireReadySession } from '@/lib/auth/guards'
import { ROLE_LABEL } from '@/lib/auth/rbac'

export const metadata: Metadata = {
  title: 'Beranda',
}

/**
 * Authenticated landing. The `(app)` layout already gated the session;
 * `requireReadySession` re-reads it (deduped by the DAL's React cache) to greet
 * the signed-in user. It repeats the layout's guard rather than trusting it: a
 * page that authorizes only via its layout is one route-tree change away from
 * being ungated.
 */
export default async function DashboardPage() {
  const session = await requireReadySession()

  return (
    <Page.Root>
      <Page.Header
        title="Beranda"
        description={`Selamat datang, ${session.email ?? 'Pengguna'}. Anda login sebagai ${ROLE_LABEL[session.role]}.`}
      />
    </Page.Root>
  )
}
