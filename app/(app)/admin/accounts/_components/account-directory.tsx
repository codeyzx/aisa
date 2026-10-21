import Form from 'next/form'
import Link from 'next/link'
import { SearchIcon } from 'lucide-react'

import {
  accountStatusLabel,
  accountVerificationLabel,
  type AccountSummary,
} from '@/lib/auth/account.contract'
import {
  findAccountByEmail,
  isDefinitiveLookupMiss,
  listAccounts,
} from '@/lib/auth/account.repo'
import { requireCapability } from '@/lib/auth/guards'
import { ROLE_LABEL } from '@/lib/auth/rbac'
import { formatDate, formatTime } from '@/lib/format/date'
import { cn } from '@/lib/utils'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'

import {
  ACCOUNTS_PATH,
  accountDetailHref,
  accountsPageHref,
} from '../search-params'

/**
 * The account directory — a Server Component that reads Firebase Auth itself and
 * renders one row per account.
 *
 * It holds its OWN `admin:users:read` guard rather than inheriting the page's,
 * for the same reason `user-picker.tsx` does: the guard belongs to the component
 * that performs the READ, so a future surface that renders this list cannot
 * forget to bring it. Opening the admin area is not permission to enumerate the
 * directory (`rbac.ts` keeps `admin:access` and `admin:users:read` distinct).
 *
 * TWO modes off the URL, the same two the impersonation picker offers, and
 * neither is a substring search:
 *  - LOOKUP (`?email=`) — an EXACT-email `findAccountByEmail`, one row or a
 *    not-found notice.
 *  - BROWSE (default) — `listAccounts`, forward-only. Firebase Auth's
 *    `listUsers` has no backward cursor and no total, so none is fabricated
 *    here: browser Back and "Kembali ke awal" are the only backward moves.
 *
 * ABSENCE VS OUTAGE is enforced at every read. `account.repo.ts` returns `null`
 * ONLY for a definitive Firebase answer and THROWS for anything else, and the
 * two are rendered as different things — an unreachable directory is an explicit
 * unavailable notice, never an empty list. An outage that reads as "no accounts"
 * is a lie an administrator would act on.
 *
 * Every value crossing to the browser is an `AccountSummary`, mapped inside the
 * repo. No `UserRecord`, no raw claims bag, no provider data — see
 * `account.contract.ts`.
 */

/** The picker's wording, verbatim: one outage says one thing across the admin area. */
const DIRECTORY_UNAVAILABLE =
  'Direktori pengguna sedang tidak dapat dihubungi. Coba lagi sebentar lagi.'

/** One page of the directory. 25 matches the impersonation picker's page size. */
const PAGE_SIZE = 25

/** A stale or hand-edited browse cursor — the one definitive `listUsers` bad input. */
function isInvalidPageToken(error: unknown): boolean {
  return firebaseErrorCode(error) === 'auth/invalid-page-token'
}

/** The one styled notice box for every miss / outage / bad-cursor state. */
function DirectoryNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** The exact-email lookup — a GET form, so it works with JavaScript disabled. */
function LookupForm({ email }: { email: string }) {
  return (
    <search className="contents">
      <Form action={ACCOUNTS_PATH} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="account-lookup"
            className="text-xs font-medium text-muted-foreground"
          >
            Cari berdasarkan email persis
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="account-lookup"
              name="email"
              type="email"
              defaultValue={email}
              placeholder="user@example.com"
              className="pl-8"
            />
          </div>
        </div>
        <Button type="submit" size="sm" variant="outline">
          Cari
        </Button>
        {/* A real <Link>, so clearing the lookup also works no-JS. */}
        {email ? (
          <Link
            href={ACCOUNTS_PATH}
            prefetch={false}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            Bersihkan
          </Link>
        ) : null}
      </Form>
    </search>
  )
}

/**
 * Last sign-in, as a date and a time, or an explicit "never". `lastSignInAt` is
 * an ISO string on the DTO (a `Date` would survive the RSC boundary but an
 * invalid one becomes a silent `Invalid Date`), so it is parsed here and only
 * here.
 */
function LastSignIn({ at }: { at: string | null }) {
  if (!at) return <span className="text-muted-foreground">Belum pernah</span>
  const when = new Date(at)
  return (
    <span className="whitespace-nowrap">
      {formatDate(when)} {formatTime(when)}
    </span>
  )
}

/**
 * The columns. Every label comes from a canonical map — `ROLE_LABEL` in
 * `rbac.ts` owns how a role is spelled, and `accountStatusLabel` /
 * `accountVerificationLabel` in `account.contract.ts` own the other two — so the
 * row and the detail page cannot describe the same account differently.
 *
 * No `sortField` on any column: Firebase Auth's `listUsers` returns accounts in
 * its own order and offers no sort at all, so a clickable header would be a
 * control that cannot work. See `components.md` — sortability is opt-in and
 * costed, never implied.
 */
const columns: DataTableColumn<AccountSummary>[] = [
  {
    id: 'email',
    header: 'Email',
    cell: (account) => (
      // The row's link target is the DETAIL surface: one URL, one full page,
      // reachable by click, by direct load and by a shared link alike.
      <Link
        href={accountDetailHref(account.uid)}
        prefetch={false}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {account.email ?? account.uid}
      </Link>
    ),
  },
  {
    id: 'displayName',
    header: 'Nama',
    cell: (account) =>
      account.displayName ?? (
        <span className="text-muted-foreground">Tanpa nama</span>
      ),
  },
  {
    id: 'role',
    header: 'Peran',
    cell: (account) => (
      <Badge variant={account.role === 'admin' ? 'default' : 'secondary'}>
        {ROLE_LABEL[account.role]}
      </Badge>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (account) => (
      <Badge variant={account.disabled ? 'destructive' : 'outline'}>
        {accountStatusLabel(account)}
      </Badge>
    ),
  },
  {
    id: 'verification',
    header: 'Verifikasi',
    cell: (account) => (
      <span
        className={cn(
          'text-sm',
          account.emailVerified ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {accountVerificationLabel(account)}
      </span>
    ),
  },
  {
    id: 'lastSignIn',
    header: 'Masuk terakhir',
    align: 'end',
    cell: (account) => <LastSignIn at={account.lastSignInAt} />,
  },
]

function AccountTable({ accounts }: { accounts: AccountSummary[] }) {
  return (
    <DataTable
      data={accounts}
      columns={columns}
      // The table's accessible name — one strategy, owned by `DataTable` (a
      // visually hidden `<caption>`; see `DataTableCaption`). It names the LIST,
      // not the page: `/admin/accounts` renders this same table for a browse
      // page and for a one-row exact-email lookup, and both are "the account
      // directory" — the mode is stated by the lookup form above it, not by a
      // caption that would then have to be branched.
      caption="Daftar akun — email, nama, peran, status, verifikasi, dan waktu masuk terakhir"
      rowKey={(account) => account.uid}
      empty={
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Tidak ada akun di halaman ini</EmptyTitle>
            <EmptyDescription>
              Halaman ini kosong. Kembali ke awal, atau buat akun baru.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  )
}

interface AccountDirectoryProps {
  /** Exact-email lookup term (`?email=`); absent means browse. */
  email?: string
  /** Forward-only browse cursor (`?pageToken=`). */
  pageToken?: string
}

export async function AccountDirectory({
  email,
  pageToken,
}: AccountDirectoryProps) {
  // Before ANY directory read — the guard redirects rather than returning, so an
  // unauthorized render never reaches Firebase Auth at all.
  await requireCapability('admin:users:read')
  const term = email?.trim()

  // ── LOOKUP: exact email only. One row or a not-found notice. No pager. ─────
  if (term) {
    let match: AccountSummary | null
    try {
      match = await findAccountByEmail(term)
    } catch (error) {
      // The repo already collapsed the DEFINITIVE misses to `null`, so anything
      // that reaches here is an outage — unless it is a malformed address, which
      // `isDefinitiveLookupMiss` still recognises for the belt-and-braces case
      // of a future repo change. An outage is never rendered as "no such user".
      if (!isDefinitiveLookupMiss(error)) {
        return (
          <div className="flex flex-col gap-4">
            <LookupForm email={term} />
            <DirectoryNotice>{DIRECTORY_UNAVAILABLE}</DirectoryNotice>
          </div>
        )
      }
      match = null
    }

    return (
      <div className="flex flex-col gap-4">
        <LookupForm email={term} />
        {match ? (
          <AccountTable accounts={[match]} />
        ) : (
          <DirectoryNotice>
            Tidak ada akun dengan email{' '}
            <span className="font-medium text-foreground">{term}</span>.
          </DirectoryNotice>
        )}
      </div>
    )
  }

  // ── BROWSE: 25 per page, forward-only. ────────────────────────────────────
  // Two failure modes, kept apart. A stale or hand-edited `?pageToken` is BAD
  // INPUT and gets a reset-to-first link; anything else is an unreachable
  // directory and says so. Neither is a 500, and neither is an empty list.
  let accounts: AccountSummary[]
  let nextPageToken: string | undefined
  try {
    const page = await listAccounts({
      limit: PAGE_SIZE,
      ...(pageToken && { pageToken }),
    })
    accounts = page.accounts
    nextPageToken = page.nextPageToken
  } catch (error) {
    return (
      <div className="flex flex-col gap-4">
        <LookupForm email="" />
        {isInvalidPageToken(error) ? (
          <DirectoryNotice>
            Token halaman tidak valid.{' '}
            <Link href={ACCOUNTS_PATH} prefetch={false} className="underline">
              Kembali ke awal
            </Link>
            .
          </DirectoryNotice>
        ) : (
          <DirectoryNotice>{DIRECTORY_UNAVAILABLE}</DirectoryNotice>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <LookupForm email="" />
      <AccountTable accounts={accounts} />

      {/* Forward-only paging: a Next link ONLY when Firebase handed back a
          token, and a reset-to-first link ONLY when we are past the first page.
          `prefetch={false}` because prefetching would run `listUsers` early. */}
      {(nextPageToken || pageToken) && (
        <div className="flex items-center justify-between gap-2">
          {pageToken ? (
            <Link
              href={ACCOUNTS_PATH}
              prefetch={false}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              Kembali ke awal
            </Link>
          ) : (
            <span />
          )}
          {nextPageToken ? (
            <Link
              href={accountsPageHref(nextPageToken)}
              prefetch={false}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Berikutnya
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  )
}
