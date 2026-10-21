/**
 * The URL-state contract for /admin/audit — declared ONCE, and the only place a
 * link to this page is built.
 *
 * Client-safe by construction: `nuqs/server` is isomorphic and
 * `account-audit.contract` is a pure contract module (zod + two label maps), so
 * nothing here drags `firebase-admin` toward a browser bundle. Never import
 * `account-audit.repo` from this file — it is `server-only`.
 */
import {
  createLoader,
  createSerializer,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

import {
  ACCOUNT_AUDIT_ACTIONS,
  ACCOUNT_AUDIT_RESULTS,
} from '@/lib/audit/account-audit.contract'
import { parseAsStrictSingle } from '@/lib/search-param'

/** The viewer's canonical path — one spelling, read by every href here. */
export const AUDIT_PATH = '/admin/audit'

/**
 * The filter value sets: the contract's own closed enums, WIDENED by one
 * `'all'` member for "not filtering on this field".
 *
 * Derived from `ACCOUNT_AUDIT_ACTIONS` / `ACCOUNT_AUDIT_RESULTS` rather than
 * re-listed, for the reason `state.md` states as a MUST: a hand-copied list is a
 * parallel taxonomy that goes stale in silence, and here it would go stale in the
 * direction that matters — a newly auditable action would be unfilterable while
 * every type still checked.
 *
 * Closing the set at the URL boundary is also what keeps the composite-index
 * bill honest: `?action=` can only ever hold a value some declared index covers,
 * so a hand-typed URL cannot ask Firestore for a shape production would refuse.
 */
export const AUDIT_ACTION_FILTER_VALUES = [
  'all',
  ...ACCOUNT_AUDIT_ACTIONS,
] as const
export type AuditActionFilterValue = (typeof AUDIT_ACTION_FILTER_VALUES)[number]

export const AUDIT_RESULT_FILTER_VALUES = [
  'all',
  ...ACCOUNT_AUDIT_RESULTS,
] as const
export type AuditResultFilterValue = (typeof AUDIT_RESULT_FILTER_VALUES)[number]

/**
 * How many events one page shows. A FIXED constant, not a `?pageSize` param:
 * every row is a billed document read, and unlike the assets list nobody has
 * asked to re-window this one. Adding the param later is a closed string-literal
 * set (see `/assets`), never `parseAsInteger`.
 */
export const AUDIT_PAGE_SIZE = 25

export const auditSearchParams = {
  action: parseAsStrictSingle(
    parseAsStringLiteral(AUDIT_ACTION_FILTER_VALUES),
  ).withDefault('all'),
  result: parseAsStrictSingle(
    parseAsStringLiteral(AUDIT_RESULT_FILTER_VALUES),
  ).withDefault('all'),
  /**
   * An EXACT uid, never a search. The durable event stores uids and nothing else
   * about an identity, and Firestore has no substring predicate — a box that
   * looked like a search and answered only exact matches would lie about what it
   * does. The viewer's rows link their uids here, which is how a reader gets one
   * without typing it.
   */
  targetUid: parseAsStrictSingle(parseAsString).withDefault(''),
  // No default: `cursor` has no meaningful "first page" value — its absence IS
  // the first page. The token encodes its own nav direction (next/prev), so one
  // `?cursor` param drives Previous and Next alike.
  cursor: parseAsStrictSingle(parseAsString),
}

/** RSC-side reader. Scalar parameters reject repeated-key input. */
export const loadAuditSearchParams = createLoader(auditSearchParams)

/** Everything /admin/audit reads from the URL. */
export interface AuditQuery {
  action: AuditActionFilterValue
  result: AuditResultFilterValue
  targetUid: string
  cursor: string | null
}

const serialize = createSerializer(auditSearchParams)

/**
 * The NEXT (or PREVIOUS) page of the query in hand. Every filter rides along
 * untouched — a cursor is only meaningful against the query that produced it.
 */
export function auditPageHref(query: AuditQuery, cursor: string): string {
  return serialize(AUDIT_PATH, { ...query, cursor })
}

/**
 * A DIFFERENT ANSWER to the question the viewer is asking: another action,
 * another result, another target, or (with an empty `next`) the same one from
 * the top.
 *
 * THE CURSOR IS DROPPED, AND NOT BY REMEMBERING TO. `next` cannot name it —
 * `Partial<Omit<AuditQuery, 'cursor'>>` is what makes "page 3 of a different
 * filter" unspellable, so no reader can reach that URL by clicking. The literal
 * `cursor: null` does the actual dropping; the type only narrows the ask.
 *
 * Belt AND braces: `paginate` independently refuses a token minted under another
 * scope (`accountAuditScope`), which is the guarantee that also holds for
 * hand-typed URLs and stale bookmarks. This only keeps a wrong link from being
 * OFFERED.
 */
export function auditViewHref(
  query: AuditQuery,
  next: Partial<Omit<AuditQuery, 'cursor'>>,
): string {
  return serialize(AUDIT_PATH, { ...query, ...next, cursor: null })
}

/**
 * The viewer, filtered to one account's history — the link every uid in a row
 * points at. Built here rather than at the three cells that need it so a uid
 * link can never forget to drop the cursor it is navigating away from.
 */
export function auditForAccountHref(uid: string): string {
  return serialize(AUDIT_PATH, {
    action: 'all',
    result: 'all',
    targetUid: uid,
    cursor: null,
  })
}
