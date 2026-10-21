import 'server-only'

/**
 * The durable account-audit writer AND reader. Three write operations matching
 * the two-step protocol in `account-audit.contract.ts` — open an event before
 * the mutation, settle it after, read one back — plus the one paginated query
 * the admin viewer runs.
 *
 * This is the Firestore-owned half the PostgreSQL fork replaces with a table;
 * the contract, the protocol, and every caller are shared.
 *
 * The list arrived WITH its screen (`app/(app)/admin/audit/`), deliberately and
 * not as tidiness: a query written before something drives it is a query whose
 * composite index nobody has exercised — the exact trap `AGENTS.md` warns about,
 * where the emulator serves happily and production answers FAILED_PRECONDITION
 * at render. Every filter combination `listAccountAuditEvents` can produce is
 * driven by `test/integration/account-audit.test.ts` so `pnpm indexes:check`
 * SEES it; that script only knows about query shapes that actually ran.
 */
import { FieldValue, type Query } from 'firebase-admin/firestore'

import { withDeadline } from '@/lib/data/deadline'
import { type Page } from '@/lib/data/pagination.contract'
import { paginate } from '@/lib/data/pagination.firestore'
import { typedCollection } from '@/lib/firebase/collections'

import {
  AccountAuditEventSchema,
  accountAuditEventId,
  type AccountAuditAction,
  type AccountAuditEvent,
  type AccountAuditResult,
  type AccountState,
} from './account-audit.contract'
import { ACCOUNT_AUDIT_COLLECTION } from './account-audit.path'

const accountAuditCollection = () =>
  typedCollection(ACCOUNT_AUDIT_COLLECTION, AccountAuditEventSchema)

export interface StartAccountAuditInput {
  action: AccountAuditAction
  /** Per-attempt id, minted by the caller. Makes the event id deterministic. */
  operationId: string
  /** The REAL administrator, even if they were impersonating. */
  actorUid: string
  /** Who the actor was acting AS, when impersonating. */
  effectiveActorUid?: string
  targetUid: string
  /** State before the mutation, for the operations that change one. */
  before?: AccountState
  reason?: string
  correlationId: string
}

/**
 * Open the event, BEFORE the mutation runs, and return its id.
 *
 * Throws on failure, and the caller must let it: an audit that could not be
 * opened means the mutation would run untraceable, and a silent skip is how an
 * account change ends up with no history at all. The one operation allowed to
 * proceed past this is impersonation STOP, which must never trap the
 * administrator — see the module handoff.
 */
export async function startAccountAudit(
  input: StartAccountAuditInput,
): Promise<string> {
  const id = accountAuditEventId(
    input.action,
    input.targetUid,
    input.operationId,
  )
  await withDeadline(
    accountAuditCollection()
      .doc(id)
      .set({
        id,
        action: input.action,
        result: 'started',
        actorUid: input.actorUid,
        ...(input.effectiveActorUid && {
          effectiveActorUid: input.effectiveActorUid,
        }),
        targetUid: input.targetUid,
        ...(input.before && { before: input.before }),
        ...(input.reason && { reason: input.reason }),
        correlationId: input.correlationId,
        // Server time, not the caller's clock: a request from a machine with a
        // skewed clock must not be able to place itself in the audit's past.
        startedAt: FieldValue.serverTimestamp() as unknown as Date,
      }),
    `start account audit ${id}`,
  )
  return id
}

export interface SettleAccountAuditInput {
  result: Exclude<AccountAuditResult, 'started'>
  after?: AccountState
  /** SHORT machine code. Never an error message — see the contract. */
  failureCode?: string
}

/**
 * Settle an open event.
 *
 * A MERGE, not a replace: the `started` write already recorded who did what to
 * whom, and re-sending it here would let a bug at the settle site quietly
 * rewrite the facts the event was opened with.
 *
 * Its own failure is reported to the caller rather than swallowed. An operation
 * whose mutation succeeded but whose audit could not be settled is exactly a
 * `reconciliation_required` situation, and the caller is the only one that knows
 * whether the mutation landed.
 */
export async function settleAccountAudit(
  id: string,
  input: SettleAccountAuditInput,
): Promise<void> {
  await withDeadline(
    accountAuditCollection()
      .doc(id)
      .set(
        {
          result: input.result,
          ...(input.after && { after: input.after }),
          ...(input.failureCode && { failureCode: input.failureCode }),
          settledAt: FieldValue.serverTimestamp() as unknown as Date,
        },
        { merge: true },
      ),
    `settle account audit ${id}`,
  )
}

/** Read one event back. Used by tests and, later, the viewer's detail view. */
export async function getAccountAuditEvent(id: string) {
  const snap = await accountAuditCollection().doc(id).get()
  return snap.data() ?? null
}

/**
 * The ONE field the history is ever ordered by, and the ONE direction.
 *
 * `startedAt` rather than `settledAt`: an unsettled event has no `settledAt` at
 * all, and Firestore drops documents missing the ordered field from the result
 * entirely — ordering on it would make a crashed operation INVISIBLE, which is
 * the precise opposite of what the two-step protocol exists to guarantee.
 *
 * Newest-first is not a default anyone may change from a URL, and that is a COST
 * decision, not taste: every sortable field multiplies the composite-index bill
 * by the filters it can combine with (see docs/reference/contracts/data.md). One
 * field in one direction with three optional equality filters already costs
 * FOURTEEN declared indexes (see `accountAuditQuery`). Offering an ascending
 * option would double that to answer a question nobody reading an audit trail
 * asks.
 */
const AUDIT_ORDER_FIELD = 'startedAt'
const AUDIT_ORDER_DIRECTION = 'desc' as const

/** The three equality filters the viewer offers. Every one is optional. */
export interface AccountAuditFilter {
  /** The account the operation was performed ON. */
  targetUid?: string
  action?: AccountAuditAction
  result?: AccountAuditResult
}

/**
 * The ONE place the audit history's filter is spelled. Exported so a future
 * `count()` (or the viewer, if it ever needs a raw query) narrows identically
 * rather than rebuilding the `where` clauses beside it.
 *
 * Every filter is an EQUALITY on a field the schema owns, combined with the
 * `orderBy` that `paginate` applies — so each non-empty combination needs its own
 * composite index in `firestore.indexes.json`. That is the whole reason the
 * filter set is three named fields and not an open `Record<string, string>`: an
 * arbitrary field could name a shape no index covers, which the emulator serves
 * and production refuses.
 *
 * ⚠️ THE BILL IS FOURTEEN INDEXES, NOT SEVEN. Three optional filters give seven
 * non-empty combinations, and each needs BOTH directions — `paginate`'s prev
 * branch is `endBefore` + `limitToLast`, which Firestore serves by reversing the
 * query, so the same filter set that needs `startedAt DESCENDING` going forward
 * needs `startedAt ASCENDING` coming back. Verified against the emulator's
 * `indexUsage`, not assumed: driving forward only reported seven and left every
 * "Previous" click a production FAILED_PRECONDITION. A FOURTH filter would
 * double the whole table again — which is why the set is argued and closed.
 */
export function accountAuditQuery(
  filter: AccountAuditFilter,
): Query<AccountAuditEvent> {
  let query: Query<AccountAuditEvent> = accountAuditCollection()
  if (filter.targetUid) query = query.where('targetUid', '==', filter.targetUid)
  if (filter.action) query = query.where('action', '==', filter.action)
  if (filter.result) query = query.where('result', '==', filter.result)
  return query
}

/**
 * The opaque identity of an audit RESULT SET, stamped into every cursor token.
 *
 * A cursor is a POSITION in one ordered, filtered set (see
 * `lib/data/pagination.contract.ts`). Carry a token from the unfiltered history
 * into `?result=failed` and nothing throws — `startAfter` resumes the failed set
 * from an offset counted through the whole one, handing back a plausible page of
 * rows belonging to neither answer. Naming the set is what closes that.
 *
 * `'all'` is a real value for "not filtered on this field", never the empty
 * string: absence must be a name like any other, or two differently-filtered sets
 * could mint indistinguishable tokens.
 */
export function accountAuditScope(filter: AccountAuditFilter): string {
  return `target=${filter.targetUid ?? 'all'}&action=${filter.action ?? 'all'}&result=${filter.result ?? 'all'}`
}

export interface ListAccountAuditEventsArgs extends AccountAuditFilter {
  limit: number
  cursor?: string | null
}

/**
 * One page of the durable account-administration history, newest first.
 *
 * UNSETTLED EVENTS ARE ORDINARY ROWS HERE. There is no `where('result','!=',
 * 'started')` and there must never be one: a `started` event that never settled
 * is a crashed operation, and the protocol's entire claim is that it stays
 * queryable rather than vanishing. The viewer marks it; the query does not hide
 * it.
 *
 * TIES ARE NOT A HAZARD, because `paginate` orders by `__name__` as well as
 * `startedAt`. Several events genuinely can share one `startedAt` — a fast
 * operation, or two writes landing in the same server-timestamp resolution
 * window — and a cursor anchored on the timestamp ALONE would either skip the
 * rest of the tie or repeat it. The tiebreaker is the reason the cursor carries
 * `docId`, and it is why nothing here hand-rolls one.
 */
export function listAccountAuditEvents(
  args: ListAccountAuditEventsArgs,
): Promise<Page<AccountAuditEvent>> {
  return paginate<AccountAuditEvent>(accountAuditQuery(args), {
    limit: args.limit,
    cursor: args.cursor,
    orderByField: AUDIT_ORDER_FIELD,
    direction: AUDIT_ORDER_DIRECTION,
    scope: accountAuditScope(args),
  })
}
