import { type Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import {
  accountStatusLabel,
  accountVerificationLabel,
} from '@/lib/auth/account.contract'
import { getAccount } from '@/lib/auth/account.repo'
import { requireCapability } from '@/lib/auth/guards'
import { can, ROLE_LABEL } from '@/lib/auth/rbac'
import { formatDate, formatTime } from '@/lib/format/date'
import { cn } from '@/lib/utils'
import { Page } from '@/components/shell/page-container'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { AccountStateActions } from '../_components/account-state-actions'
import {
  AccountNameForm,
  AccountRoleForm,
} from '../_components/account-profile-forms'
import { ResetPasswordPanel } from '../_components/reset-password-panel'
import { ACCOUNTS_PATH } from '../search-params'

export const metadata: Metadata = {
  title: 'Detail akun',
}

interface AccountDetailPageProps {
  // Next 16: `params` is a Promise.
  params: Promise<{ uid: string }>
}

/** One labelled fact about the account. */
function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

/**
 * One account, and every mutation an administrator may perform on it — a
 * canonical full page at its own URL, reachable by click, by direct load, by
 * reload and by a shared link alike.
 *
 * ── THE TWO CAPABILITIES, AND WHY THE PAGE HOLDS THE WEAKER ONE ─────────────
 * The page gates on `admin:users:read` — reading one account is the same
 * authority as reading the directory it came from. The MUTATION panels are
 * rendered only when the session also holds `admin:users:manage`, which
 * `rbac.ts` keeps deliberately distinct: a read-only helpdesk can find an
 * account and read its state without being able to hand out or take away access.
 * A deployment that grants only the read capability therefore gets a working
 * detail page with no controls, rather than a 403 or a page full of buttons that
 * only ever refuse.
 *
 * ── IMPERSONATION ───────────────────────────────────────────────────────────
 * Every account mutation refuses an impersonated actor server-side
 * (`requireRealAdministrator`), so the controls are withheld here rather than
 * left to be clicked and refused: a control that can only produce a refusal
 * should not be on screen. The page itself stays readable, because reading is
 * not the thing being refused.
 *
 * ── ABSENCE VS OUTAGE ───────────────────────────────────────────────────────
 * `getAccount` returns null ONLY for a definitive Firebase answer and THROWS for
 * anything else, so a missing account gets an explicit in-context notice while
 * an unreachable directory reaches the error boundary. A 404-shaped answer for
 * an outage would tell an administrator the account is gone.
 */
export default async function AccountDetailPage({
  params,
}: AccountDetailPageProps) {
  const session = await requireCapability('admin:users:read')
  const { uid } = await params
  const account = await getAccount(uid)

  const canManage = can(session, 'admin:users:manage') && !session.impersonator

  if (!account) {
    return (
      <Page.Root className="w-full max-w-2xl">
        <Page.Header
          eyebrow="Admin"
          title="Akun tidak ditemukan"
          description="Tidak ada akun dengan pengenal ini. Akun mungkin sudah dihapus di Firebase Console."
        />
        <Link
          href={ACCOUNTS_PATH}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ArrowLeft />
          Kembali ke direktori
        </Link>
      </Page.Root>
    )
  }

  const lastSignIn = account.lastSignInAt
    ? new Date(account.lastSignInAt)
    : null
  const isSelf = account.uid === session.uid

  return (
    <Page.Root className="w-full max-w-2xl">
      <Page.Header
        eyebrow="Admin"
        title={account.email ?? account.uid}
        description={account.displayName ?? 'Tanpa nama tampilan'}
      >
        <Link
          href={ACCOUNTS_PATH}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ArrowLeft />
          Direktori
        </Link>
      </Page.Header>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label="Peran">
              {/* ROLE_LABEL in rbac.ts is the one place a role is spelled. */}
              <Badge
                variant={account.role === 'admin' ? 'default' : 'secondary'}
              >
                {ROLE_LABEL[account.role]}
              </Badge>
            </Fact>
            <Fact label="Status">
              <Badge variant={account.disabled ? 'destructive' : 'outline'}>
                {accountStatusLabel(account)}
              </Badge>
            </Fact>
            <Fact label="Verifikasi email">
              {accountVerificationLabel(account)}
            </Fact>
            <Fact label="Masuk terakhir">
              {lastSignIn ? (
                `${formatDate(lastSignIn)} ${formatTime(lastSignIn)}`
              ) : (
                <span className="text-muted-foreground">Belum pernah</span>
              )}
            </Fact>
            <Fact label="UID">
              <span className="font-mono text-xs break-all">{account.uid}</span>
            </Fact>
          </dl>
        </CardContent>
      </Card>

      {!canManage ? (
        <Alert>
          <AlertDescription>
            {session.impersonator
              ? 'Perubahan akun tidak tersedia selama Anda meng-impersonate pengguna lain. Akhiri impersonasi terlebih dahulu.'
              : 'Anda dapat melihat akun ini, tetapi tidak memiliki izin untuk mengubahnya.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {isSelf ? (
            <Alert>
              <AlertDescription>
                Ini akun Anda sendiri. Menurunkan peran atau menonaktifkannya
                akan ditolak — aplikasi harus selalu punya administrator aktif.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Profil</CardTitle>
              <CardDescription>
                Email bersifat permanen di modul ini dan tidak dapat diubah.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <AccountNameForm account={account} />
              <div className="border-t border-border pt-6">
                <AccountRoleForm account={account} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Akses</CardTitle>
              <CardDescription>
                Menonaktifkan akun dan mengakhiri sesinya adalah dua keputusan
                yang berbeda, jadi keduanya dipisah.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountStateActions account={account} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Setel ulang kata sandi</CardTitle>
              <CardDescription>
                Menerbitkan kata sandi sementara baru yang ditampilkan satu
                kali, dan mewajibkan pemiliknya menggantinya saat masuk
                berikutnya.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResetPasswordPanel account={account} />
            </CardContent>
          </Card>
        </>
      )}
    </Page.Root>
  )
}
