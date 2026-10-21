import { type Metadata } from 'next'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'

import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { buttonVariants } from '@/components/ui/button'

import { AccountDirectory } from './_components/account-directory'
import { loadAccountsSearchParams } from './search-params'

export const metadata: Metadata = {
  title: 'Akun',
}

interface AccountsPageProps {
  // Next 16: `searchParams` is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The account directory — ONE canonical full page, for every navigation mode.
 *
 * There is no modal variant and there cannot be one: `structure:check`'s
 * `one-surface-per-url` forbids a parallel slot or an intercepting segment
 * anywhere under `app/`, because a Base UI dialog resolves its portal container
 * in a layout effect and therefore server-renders to the empty string — a modal
 * route can never answer a JavaScript-off request. Every surface in this module
 * is a full page or an inline form for that reason.
 *
 * Gated on `admin:users:read`, the same capability the directory component
 * re-asserts before it reads. The page gate is what keeps a reader without
 * directory authority off the URL entirely; the component gate is what makes the
 * READ safe wherever it is rendered. Neither is redundant.
 *
 * The CREATE entry is offered here rather than on the detail page because it is
 * a directory-level act. It is a `<Link>` to a full page, not a dialog.
 */
export default async function AccountsPage({
  searchParams,
}: AccountsPageProps) {
  const session = await requireCapability('admin:users:read')
  const params = loadAccountsSearchParams(await searchParams)

  return (
    <Page.Root className="w-full">
      <Page.Header
        eyebrow="Admin"
        title="Akun"
        description="Direktori akun Firebase Authentication: peran, status, verifikasi email, dan waktu masuk terakhir."
      >
        {/* A styled <Link>, never <Button render={<Link/>}> — Base UI's Button
            stamps role="button" over the anchor's link role. Rendered only for a
            session that holds `admin:users:manage`: the page's `admin:users:read`
            guard admits a read-only helpdesk reader, but the create action gates
            on manage, so an entry that could only 403 would lie about the reader's
            authority. */}
        {can(session, 'admin:users:manage') ? (
          <Link
            href="/admin/accounts/new"
            prefetch={false}
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            <UserPlus />
            Buat akun
          </Link>
        ) : null}
      </Page.Header>

      <AccountDirectory
        email={params.email ?? undefined}
        pageToken={params.pageToken ?? undefined}
      />
    </Page.Root>
  )
}
