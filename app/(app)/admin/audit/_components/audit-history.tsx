import Form from 'next/form'
import Link from 'next/link'
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleDashedIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react'

import {
  ACCOUNT_AUDIT_ACTION_LABEL,
  ACCOUNT_AUDIT_RESULT_LABEL,
  isUnsettled,
  type AccountAuditEvent,
  type AccountAuditResult,
} from '@/lib/audit/account-audit.contract'
import { listAccountAuditEvents } from '@/lib/audit/account-audit.repo'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'
import { formatDate, formatTime } from '@/lib/format/date'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DataTable,
  DataTableCursorNav,
  type DataTableColumn,
} from '@/components/ui/data-table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'

import { accountDetailHref } from '../../accounts/search-params'
import {
  AUDIT_ACTION_FILTER_VALUES,
  AUDIT_PAGE_SIZE,
  AUDIT_PATH,
  AUDIT_RESULT_FILTER_VALUES,
  auditForAccountHref,
  auditPageHref,
  type AuditQuery,
} from '../search-params'

/**
 * The durable account-administration history — a Server Component that reads the
 * audit collection through the Admin SDK and renders one row per event.
 *
 * It holds its OWN `admin:audit:read` guard rather than inheriting the page's,
 * the same way `account-directory.tsx` does: the guard belongs to the component
 * that performs the READ, so a future surface rendering this list cannot forget
 * to bring it.
 *
 * ── WHY THE READ IS SERVER-SIDE, AND MUST STAY THERE ────────────────────────
 * There is no client-readable Firestore rule for `accountAuditEvents` and there
 * must never be one. A read carve-out scoped to "signed-in" would hand the whole
 * administrative history — every role change, every disablement, every
 * impersonation, for every account — to any browser with a login, because Rules
 * cannot express `admin:audit:read`. This component is the only door, and the
 * guard above is the only lock.
 *
 * ── UNSETTLED EVENTS ARE ROWS, NOT NOISE ────────────────────────────────────
 * `started` and `reconciliation_required` are rendered LOUDER than success, not
 * filtered out. An operation that crashed mid-flight is the single thing this
 * history exists to make visible; hiding it would make the trail's most
 * important state its least visible one.
 */

/** One page's worth of events. */
const PAGE_SIZE = AUDIT_PAGE_SIZE

/**
 * How each outcome is DRAWN. A closed `Record<AccountAuditResult, …>`, so adding
 * a result to the contract is a compile error here until it has a treatment —
 * the same trick `ACCOUNT_AUDIT_RESULT_LABEL` uses for its words.
 *
 * The two open states share the amber treatment of the impersonation banner
 * deliberately: in this app amber already means "something is mid-flight and a
 * human should notice". `succeeded` is the quietest row on the screen, because a
 * trail where every line shouts has no way left to shout.
 */
const RESULT_STYLE: Record<
  AccountAuditResult,
  { icon: typeof CheckIcon; className: string }
> = {
  started: {
    icon: CircleDashedIcon,
    className:
      'border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100',
  },
  succeeded: { icon: CheckIcon, className: 'border-border text-foreground' },
  failed: {
    icon: XIcon,
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  reconciliation_required: {
    icon: AlertTriangleIcon,
    className:
      'border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100',
  },
}

/** The outcome, spelled ONLY from `ACCOUNT_AUDIT_RESULT_LABEL`. */
function ResultBadge({ event }: { event: AccountAuditEvent }) {
  const style = RESULT_STYLE[event.result]
  const Icon = style.icon
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="outline" className={cn('gap-1', style.className)}>
        <Icon aria-hidden className="size-3" />
        {ACCOUNT_AUDIT_RESULT_LABEL[event.result]}
      </Badge>
      {/* A SHORT machine code by construction (`auditFailureCode`), never a
          message — safe to render, and the first thing an operator needs when
          reconciling. */}
      {event.failureCode ? (
        <span className="font-mono text-[11px] break-all text-muted-foreground">
          {event.failureCode}
        </span>
      ) : null}
    </div>
  )
}

/**
 * A uid, linked to the account detail page — but ONLY for a reader who holds
 * `admin:users:read`. Kept as a uid rather than resolved to an email because the
 * event stores only a uid — resolving would cost one Firebase Auth read per cell,
 * and would silently fail for an account that has since been deleted, which is
 * exactly the account whose history matters most.
 *
 * A compliance-only reader (`admin:audit:read` without `admin:users:read`) may
 * read this trail but not the account directory, so the detail link would only
 * 403 for them — it is rendered as plain text instead, a control that does not
 * lie about where it goes. The intra-audit "Riwayat akun ini" link stays for
 * everyone; it never leaves the audit viewer.
 */
function ActorLink({
  uid,
  canReadAccounts,
}: {
  uid: string
  canReadAccounts: boolean
}) {
  return (
    <span className="flex flex-col items-start">
      {canReadAccounts ? (
        <Link
          href={accountDetailHref(uid)}
          prefetch={false}
          className="font-mono text-xs break-all text-foreground underline-offset-4 hover:underline"
        >
          {uid}
        </Link>
      ) : (
        <span className="font-mono text-xs break-all text-foreground">
          {uid}
        </span>
      )}
    </span>
  )
}

/** An absent optional field, said once so every column says it identically. */
function NotApplicable() {
  return <span className="text-muted-foreground">—</span>
}

/**
 * The columns, built per render because the actor/target links depend on whether
 * THIS reader holds `admin:users:read` — a fact known only after the guard runs,
 * so the column set cannot be a module constant.
 */
function buildColumns(
  canReadAccounts: boolean,
): DataTableColumn<AccountAuditEvent>[] {
  return [
    {
      id: 'startedAt',
      header: 'Waktu mulai',
      cell: (event) => (
        <span className="whitespace-nowrap">
          {formatDate(event.startedAt)} {formatTime(event.startedAt)}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Aksi',
      // ACCOUNT_AUDIT_ACTION_LABEL is the ONE place an action is spelled for a
      // reader; the raw code never reaches the screen.
      cell: (event) => (
        <span className="font-medium">
          {ACCOUNT_AUDIT_ACTION_LABEL[event.action]}
        </span>
      ),
    },
    {
      id: 'result',
      header: 'Hasil',
      cell: (event) => <ResultBadge event={event} />,
    },
    {
      id: 'actor',
      header: 'Aktor asli',
      cell: (event) => (
        <ActorLink uid={event.actorUid} canReadAccounts={canReadAccounts} />
      ),
    },
    {
      id: 'effectiveActor',
      header: 'Bertindak sebagai',
      // Present ONLY when the operation ran under an impersonation. Absent is the
      // ordinary case and says so, rather than repeating the real actor — the two
      // being equal and the field being unset are different facts.
      cell: (event) =>
        event.effectiveActorUid ? (
          <ActorLink
            uid={event.effectiveActorUid}
            canReadAccounts={canReadAccounts}
          />
        ) : (
          <NotApplicable />
        ),
    },
    {
      id: 'target',
      header: 'Target',
      cell: (event) => (
        <span className="flex flex-col items-start gap-1">
          <ActorLink uid={event.targetUid} canReadAccounts={canReadAccounts} />
          <Link
            href={auditForAccountHref(event.targetUid)}
            prefetch={false}
            className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
          >
            Riwayat akun ini
          </Link>
        </span>
      ),
    },
    {
      id: 'reason',
      header: 'Alasan',
      // Recorded only by the operations that demand one (the admin password
      // reset). Bounded to 500 characters by the schema, so it cannot blow up a
      // row.
      cell: (event) =>
        event.reason ? (
          <span className="text-sm break-words">{event.reason}</span>
        ) : (
          <NotApplicable />
        ),
    },
  ]
}

/**
 * The filter bar — a GET form, so filtering works with JavaScript disabled.
 *
 * NATIVE `<select>`, not `ChoiceSelect`: that primitive is a `'use client'` Base
 * UI Select, and a filter that cannot be submitted without a bundle is a filter
 * an operator loses at exactly the moment something is wrong. The same reason
 * the impersonation exit is a plain form.
 *
 * It carries no `cursor` field, which is how a filter change drops the cursor
 * here — the structural equivalent of `auditViewHref`'s `cursor: null`, obtained
 * for free because a form submits only the fields it has.
 */
function AuditFilterForm({ query }: { query: AuditQuery }) {
  const selectClass = cn(
    'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs',
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
  )

  return (
    <search className="contents">
      <Form
        action={AUDIT_PATH}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-action"
            className="text-xs font-medium text-muted-foreground"
          >
            Aksi
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={query.action}
            className={selectClass}
          >
            {AUDIT_ACTION_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {value === 'all'
                  ? 'Semua aksi'
                  : ACCOUNT_AUDIT_ACTION_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-result"
            className="text-xs font-medium text-muted-foreground"
          >
            Hasil
          </label>
          <select
            id="audit-result"
            name="result"
            defaultValue={query.result}
            className={selectClass}
          >
            {AUDIT_RESULT_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {value === 'all'
                  ? 'Semua hasil'
                  : ACCOUNT_AUDIT_RESULT_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="audit-target"
            className="text-xs font-medium text-muted-foreground"
          >
            UID target (persis)
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="audit-target"
              name="targetUid"
              defaultValue={query.targetUid}
              placeholder="UID akun"
              className="pl-8 font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="outline">
            Terapkan
          </Button>
          {/* A real <Link>, so clearing the filters also works no-JS. */}
          <Link
            href={AUDIT_PATH}
            prefetch={false}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            Bersihkan
          </Link>
        </div>
      </Form>
    </search>
  )
}

export async function AuditHistory({ query }: { query: AuditQuery }) {
  // Before ANY read — the guard redirects rather than returning, so an
  // unauthorized render never touches the audit collection.
  const session = await requireCapability('admin:audit:read')
  // Whether this reader may also open the account directory. A compliance-only
  // reader holds `admin:audit:read` alone, so the actor/target uid links to
  // `/admin/accounts/[uid]` render as plain text for them (see `ActorLink`).
  const canReadAccounts = can(session, 'admin:users:read')

  const page = await listAccountAuditEvents({
    limit: PAGE_SIZE,
    cursor: query.cursor,
    // `'all'` is the URL's word for "do not filter"; the repo's word is an
    // absent field. Converting here, once, is what keeps `'all'` out of a
    // `where` clause — where it would match nothing and render an empty history
    // that looks exactly like a quiet one.
    ...(query.action !== 'all' && { action: query.action }),
    ...(query.result !== 'all' && { result: query.result }),
    ...(query.targetUid.trim() && { targetUid: query.targetUid.trim() }),
  })

  const unsettled = page.items.filter(isUnsettled).length

  return (
    <div className="flex flex-col gap-4">
      <AuditFilterForm query={query} />

      {unsettled > 0 ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          {unsettled} peristiwa di halaman ini masih berjalan dan belum
          diselesaikan. Peristiwa yang tetap terbuka menandakan operasi yang
          berhenti di tengah jalan — periksa akun targetnya sebelum mengulang.
        </p>
      ) : null}

      {/* No `overflow-x-auto` wrapper here: `DataTable` already draws the frame
          AND owns the horizontal scroller (its `Table` renders one). A second
          scroller around a child that clips itself never scrolls, and it is the
          kind of thing that gets copied — one table, one scroll container. */}
      <DataTable
        data={page.items}
        columns={buildColumns(canReadAccounts)}
        // The table's accessible name — one strategy, owned by `DataTable` (a
        // visually hidden `<caption>`; see `DataTableCaption`). It says
        // "riwayat", not "daftar", because the rows are EVENTS in time and the
        // first column is when each started.
        caption="Riwayat administrasi akun — waktu mulai, aksi, hasil, aktor asli, aktor efektif, target, dan alasan"
        rowKey={(event) => event.id}
        empty={
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Tidak ada peristiwa</EmptyTitle>
              <EmptyDescription>
                Belum ada peristiwa administrasi akun yang cocok dengan filter
                ini.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <DataTableCursorNav
        prevCursor={page.prevCursor}
        nextCursor={page.nextCursor}
        buildHref={(cursor) => auditPageHref(query, cursor)}
      />
    </div>
  )
}
