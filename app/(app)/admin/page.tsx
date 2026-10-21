import { type Metadata } from 'next'
import Link from 'next/link'
import { ScrollText, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'

import { UserPicker } from './_components/user-picker'
import { loadAdminSearchParams } from './search-params'

export const metadata: Metadata = {
  title: 'Admin',
}

interface AdminPageProps {
  // Next 16: `searchParams` is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Admin surface — the ONE impersonation picker, a full page.
 *
 * Every navigation mode lands here: a soft click from the user dropdown, a
 * direct load, a refresh, a shared link, a no-JS client. There is no second
 * surface to keep in sync — an intercepted `@modal/(.)admin` variant used to
 * shadow this on soft navigation and was deleted, because a modal cannot be
 * server-rendered (its portal resolves its container in a layout effect) and
 * so could never answer a JS-off request at all.
 *
 * While impersonating, `can(session, 'admin:access')` is false, so this page
 * answers /403 — which is why the exit lives in the shell banner, not here. See
 * docs/reference/contracts/impersonation.md.
 *
 * Gated on the CAPABILITY rather than an exact-role check, so the page and the
 * start action it hosts cannot diverge: the action gates on the same
 * `admin:access`, and `auth.md` prefers capability checks. The guard runs BEFORE
 * any user record is read.
 */
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await requireCapability('admin:access')
  const params = loadAdminSearchParams(await searchParams)

  return (
    <Page.Root className="w-full max-w-2xl">
      <Page.Header
        title="Admin"
        description="Area khusus admin — non-admin dialihkan ke /403."
      />
      {/* The account directory is its own URL, not a tab or a slot on this page:
          one surface per URL, and the directory does its own paging and its own
          exact-email lookup off `?email`/`?pageToken`. Sharing this page would
          mean two lists reading the same two params and two `listUsers` calls
          per render. `prefetch={false}` for the same reason the picker's pager
          links carry it — prefetching would run the directory read early. */}
      {can(session, 'admin:users:read') ? (
        <Card>
          <CardHeader>
            <CardTitle>Kelola akun</CardTitle>
            <CardDescription>
              Direktori akun Firebase Authentication: buat akun, ubah nama dan
              peran, aktifkan atau nonaktifkan, akhiri sesi, dan setel ulang
              kata sandi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/accounts"
              prefetch={false}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <Users />
              Buka direktori akun
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* Its own URL for the same reason the directory has one. The link is
          rendered only for a session that actually holds `admin:audit:read`:
          the page enforces it regardless, but an entry that can only produce a
          /403 is a control that lies about what the reader may do. */}
      {can(session, 'admin:audit:read') ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat administrasi</CardTitle>
            <CardDescription>
              Peristiwa tersimpan untuk setiap perubahan akun dan setiap
              impersonasi, lengkap dengan aktor asli, aktor efektif, target, dan
              hasilnya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/audit"
              prefetch={false}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <ScrollText />
              Buka riwayat
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {can(session, 'impersonation:start') ? (
        <Card>
          <CardHeader>
            <CardTitle>Impersonate pengguna</CardTitle>
            <CardDescription>
              Lihat aplikasi persis seperti yang dilihat pengguna lain — tanpa
              kata sandi mereka, dan tanpa keluar dari sesi Anda sendiri. Akun
              yang dapat membuka area admin tidak dapat di-impersonate, begitu
              pula Anda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserPicker
              adminUid={session.uid}
              email={params.email ?? undefined}
              pageToken={params.pageToken ?? undefined}
            />
          </CardContent>
        </Card>
      ) : null}
    </Page.Root>
  )
}
