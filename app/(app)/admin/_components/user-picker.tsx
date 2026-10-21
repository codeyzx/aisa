import Form from 'next/form'
import Link from 'next/link'
import { SearchIcon } from 'lucide-react'
import type { UserRecord } from 'firebase-admin/auth'

import { cn } from '@/lib/utils'
import { toAccountSummary } from '@/lib/auth/account.contract'
import { isDefinitiveLookupMiss } from '@/lib/auth/account.repo'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { sessionFromUserRecord } from '@/lib/auth/session'
import { adminAuth } from '@/lib/firebase/admin-auth'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { ImpersonateRow, type PickerUser } from './impersonate-row'
import { adminPageHref } from '../search-params'

/**
 * The impersonation picker — ONE Server Component behind the single canonical
 * `/admin` page. It reads the Firebase Auth roster ITSELF (never the layout), so
 * opening the surface is what loads users — the dropdown that links here stays a
 * cheap `<Link prefetch={false}>`.
 *
 * It holds its OWN guard, `admin:users:read`, rather than inheriting the page's
 * `admin:access`. Those are different authorities (see `rbac.ts`): opening the
 * admin surface is not permission to enumerate the directory. Because the guard
 * lives on the component that performs the read, a future surface that renders
 * this picker cannot forget to bring it.
 *
 * TWO modes off the URL:
 *  - LOOKUP (`?email=`): an EXACT-email `getUserByEmail`, one row or a not-found
 *    notice. No substring search — a partial directory search is user management,
 *    a separate concern from a deliberate auth bypass.
 *  - BROWSE (default): `listUsers(25, pageToken)`, forward-only. A "Berikutnya"
 *    link appears only when the SDK hands back a next page token; there is no
 *    Previous token to fabricate and no totals — browser back and "Kembali ke
 *    awal" are the only backward affordances.
 *
 * Every record is mapped to a SAFE `PickerUser` DTO here, server-side, before it
 * can reach `ImpersonateRow` (a client component). A raw `UserRecord` carries
 * password hashes, custom claims, provider data, phone, MFA and tokens — none of
 * which may cross to the client, and none of which a picker row needs.
 */
const PAGE_SIZE = 25

/**
 * The picker's directory read failed for a reason that is NOT a definitive answer
 * about the input — the Admin SDK could not be reached. Shown as an explicit
 * unavailable state, never as an empty list or a "no such user" notice: an outage
 * that reads as "no results" is a lie the admin would act on. This is the picker's
 * half of the same fail-safe rule the impersonation overlay uses
 * (lib/auth/session.ts) — unless we are SURE, we do not report absence.
 */
const DIRECTORY_UNAVAILABLE =
  'Direktori pengguna sedang tidak dapat dihubungi. Coba lagi sebentar lagi.'

/** The one styled notice box the picker shows for every empty / miss / error state. */
function PickerNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/**
 * `isDefinitiveLookupMiss` — a DEFINITIVE Admin-Auth answer to an exact-email
 * lookup (the email is malformed, or no account has it) as opposed to an outage —
 * is imported from `lib/auth/account.repo.ts`, which asks the same question of
 * the same SDK. One predicate on purpose: a second copy of a fail-safe rule is a
 * second place for it to be relaxed by half, and an outage read as "no such user"
 * is the failure this whole distinction exists to prevent.
 */

/** A stale/hand-edited browse cursor — the one definitive `listUsers` bad input. */
function isInvalidPageToken(error: unknown): boolean {
  return firebaseErrorCode(error) === 'auth/invalid-page-token'
}

interface UserPickerProps {
  /** The acting admin's uid — the self-impersonation refusal reads it. */
  adminUid: string
  /** Exact-email lookup term (`?email=`); absent means browse. */
  email?: string
  /** Forward-only browse cursor (`?pageToken=`). */
  pageToken?: string
}

/**
 * Eligibility is DISPLAY ONLY — recomputed live at start in the action, never
 * trusted from this flag. Order matters: self first (an admin cannot impersonate
 * themselves at all), then disabled, then admin-capable. `sessionFromUserRecord`
 * returns null for a disabled account, but disabled is already caught above it,
 * and `can(null, …)` is false regardless, so the admin check is null-safe.
 */
function eligibilityOf(
  record: UserRecord,
  adminUid: string,
): { eligible: boolean; reason: string | null } {
  if (record.uid === adminUid) {
    return {
      eligible: false,
      reason: 'Anda tidak dapat meng-impersonate diri sendiri',
    }
  }
  if (record.disabled) {
    return { eligible: false, reason: 'Akun dinonaktifkan' }
  }
  if (can(sessionFromUserRecord(record), 'admin:access')) {
    return { eligible: false, reason: 'Akun admin tidak dapat di-impersonate' }
  }
  return { eligible: true, reason: null }
}

/** Map a live `UserRecord` to the safe DTO the client row receives. */
function toDto(record: UserRecord, adminUid: string): PickerUser {
  return {
    ...toAccountSummary(record),
    ...eligibilityOf(record, adminUid),
  }
}

/** The exact-email lookup — a GET form so it works no-JS (native GET to /admin). */
function LookupForm({ email }: { email: string }) {
  return (
    <search className="contents">
      <Form action="/admin" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="user-lookup"
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
              id="user-lookup"
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
        {/* A real <Link>, so clearing the lookup works no-JS: back to the browse
            list with no token. `prefetch={false}` for the same reason the pager
            links carry it — prefetching /admin would run `listUsers` early. */}
        {email ? (
          <Link
            href="/admin"
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

export async function UserPicker({
  adminUid,
  email,
  pageToken,
}: UserPickerProps) {
  // Before ANY directory read — the guard redirects to /403 rather than returning,
  // so an unauthorized render never reaches `listUsers`/`getUserByEmail` at all.
  const session = await requireCapability('admin:users:read')
  // DISPLAY ONLY, like `eligible`: whether the actor may START an impersonation
  // (`impersonation:start`, DISTINCT from the `admin:users:read` that admits them
  // to the picker). A reader without it can browse the roster but must not be
  // shown a live start control the action would only refuse.
  const canImpersonate = can(session, 'impersonation:start')
  const auth = adminAuth()
  const term = email?.trim()

  // ── LOOKUP: exact email only, one row or a not-found notice. No pager. ──────
  if (term) {
    let match: PickerUser | null = null
    try {
      match = toDto(await auth.getUserByEmail(term), adminUid)
    } catch (error) {
      // Distinguish a DEFINITIVE miss (malformed email / no such account) from an
      // OUTAGE. Only a definitive miss is "no user"; an unreachable directory is
      // shown as explicitly unavailable, never as an empty result — the same
      // fail-safe rule the impersonation overlay uses.
      if (!isDefinitiveLookupMiss(error)) {
        return (
          <div className="flex flex-col gap-4">
            <LookupForm email={term} />
            <PickerNotice>{DIRECTORY_UNAVAILABLE}</PickerNotice>
          </div>
        )
      }
      match = null
    }

    return (
      <div className="flex flex-col gap-4">
        <LookupForm email={term} />
        {match ? (
          <ul className="flex flex-col gap-2">
            <ImpersonateRow user={match} canImpersonate={canImpersonate} />
          </ul>
        ) : (
          <PickerNotice>
            Tidak ada pengguna dengan email{' '}
            <span className="font-medium text-foreground">{term}</span>.
          </PickerNotice>
        )}
      </div>
    )
  }

  // ── BROWSE: 25 per page, forward-only. ─────────────────────────────────────
  // Two failure modes, kept apart. A hand-edited or stale `?pageToken` throws
  // `auth/invalid-page-token` — bad input, shown with a reset-to-first link. Any
  // OTHER throw is an unreachable directory, shown as explicitly unavailable — an
  // outage must never read as a bad token (nor as an empty page). Neither is a 500.
  let users: UserRecord[]
  let nextPageToken: string | undefined
  try {
    const page = await auth.listUsers(PAGE_SIZE, pageToken)
    users = page.users
    nextPageToken = page.pageToken
  } catch (error) {
    return (
      <div className="flex flex-col gap-4">
        <LookupForm email="" />
        {isInvalidPageToken(error) ? (
          <PickerNotice>
            Token halaman tidak valid.{' '}
            <Link href="/admin" prefetch={false} className="underline">
              Kembali ke awal
            </Link>
            .
          </PickerNotice>
        ) : (
          <PickerNotice>{DIRECTORY_UNAVAILABLE}</PickerNotice>
        )}
      </div>
    )
  }
  const rows = users.map((record) => toDto(record, adminUid))

  return (
    <div className="flex flex-col gap-4">
      <LookupForm email="" />

      {rows.length === 0 ? (
        <PickerNotice>Tidak ada pengguna di halaman ini.</PickerNotice>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((user) => (
            <ImpersonateRow
              key={user.uid}
              user={user}
              canImpersonate={canImpersonate}
            />
          ))}
        </ul>
      )}

      {/* Forward-only paging: a Next link ONLY when the SDK returned a token, and
          a reset-to-first link ONLY when we are past the first page. No Previous
          token is fabricated, and no totals or page numbers are shown — browser
          back and "Kembali ke awal" are the only backward moves. */}
      {(nextPageToken || pageToken) && (
        <div className="flex items-center justify-between gap-2">
          {pageToken ? (
            <Link
              href="/admin"
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
              href={adminPageHref(nextPageToken)}
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
