/**
 * The DURABLE account-administration audit event: what is recorded, what may be
 * recorded, and the two-step protocol every account mutation follows.
 *
 * This is NOT the same thing as `lib/data/audit.ts`. That is a structured stdout
 * stream for runtime operations — useful, but it lives wherever the container's
 * logs go, and "who changed this user's role last month" is not a question a log
 * shipper can be trusted to answer. This is the queryable admin history.
 *
 * It is application audit history, and the docs must keep saying so: a Firestore
 * collection the Admin SDK writes is not tamper-evident compliance storage, and
 * describing it as such would be the most dangerous sentence in this module.
 *
 * ── WHY THE PROTOCOL IS TWO STEPS ────────────────────────────────────────────
 * A Firebase Auth mutation and a Firestore write cannot be made atomic. So
 * instead of pretending, the event is written BEFORE the mutation with result
 * `started`, and finalized after. Every reachable outcome is then visible:
 *
 *  - `started` that never finalized → the process died mid-operation. The event
 *    is still there, still queryable, and says so.
 *  - `succeeded` / `failed` → the mutation settled and we know which.
 *  - `reconciliation_required` → the mutation PARTIALLY landed (Auth changed but
 *    revocation or a follow-up did not), and a human must look.
 *
 * The alternative — write the audit after a successful mutation — makes the one
 * state you most need to see, the crash in the middle, the one state that leaves
 * no trace at all.
 *
 * ── WHY `before`/`after` ARE A CLOSED SHAPE ──────────────────────────────────
 * They are NOT a free-form metadata bag. A bag is how a password, a reset link,
 * a raw provider error, or a whole request body ends up in durable storage — not
 * because anyone decided to put it there, but because someone spread an object
 * that happened to contain one. `AccountStateSchema` names the only three fields
 * these mutations change, so nothing else CAN be written. Widening it is a
 * deliberate edit with this paragraph attached.
 */
import * as z from 'zod'

import { TimestampSchema } from '@/lib/data/timestamp'
import { ROLES } from '@/lib/auth/rbac'
import { firebaseErrorCode } from '@/lib/firebase/error-code'

/**
 * The closed vocabulary of auditable account operations. Deliberately named for
 * the USER-FACING act, not the function that performs it, so a refactor cannot
 * silently rename history.
 */
export const ACCOUNT_AUDIT_ACTIONS = [
  'user.create',
  'user.name.update',
  'user.role.update',
  'user.enable',
  'user.disable',
  'user.password.reset',
  'user.password.change',
  'user.sessions.revoke',
  'impersonation.start',
  'impersonation.stop',
] as const
export type AccountAuditAction = (typeof ACCOUNT_AUDIT_ACTIONS)[number]

/**
 * How an operation ended. `started` is a real, queryable state rather than an
 * absence — see the protocol note above.
 */
export const ACCOUNT_AUDIT_RESULTS = [
  'started',
  'succeeded',
  'failed',
  'reconciliation_required',
] as const
export type AccountAuditResult = (typeof ACCOUNT_AUDIT_RESULTS)[number]

/**
 * Human labels, in Bahasa Indonesia — the ONE place a result is spelled for a
 * reader, and `Record<AccountAuditResult, string>` makes adding a result a
 * compile error here until it has a label. Same trick as `ASSET_STATUS_LABEL`.
 */
export const ACCOUNT_AUDIT_RESULT_LABEL: Record<AccountAuditResult, string> = {
  started: 'Sedang berjalan',
  succeeded: 'Berhasil',
  failed: 'Gagal',
  reconciliation_required: 'Perlu rekonsiliasi',
}

export const ACCOUNT_AUDIT_ACTION_LABEL: Record<AccountAuditAction, string> = {
  'user.create': 'Buat akun',
  'user.name.update': 'Ubah nama tampilan',
  'user.role.update': 'Ubah peran',
  'user.enable': 'Aktifkan akun',
  'user.disable': 'Nonaktifkan akun',
  'user.password.reset': 'Setel ulang kata sandi',
  'user.password.change': 'Ganti kata sandi sendiri',
  'user.sessions.revoke': 'Keluarkan semua sesi',
  'impersonation.start': 'Mulai impersonasi',
  'impersonation.stop': 'Akhiri impersonasi',
}

/**
 * The ONLY account fields that may appear in a durable before/after. Every field
 * is already visible to an administrator on the account surface; none is a
 * secret, a token, or a provider blob. See the header for why this is a closed
 * object and not a record.
 */
export const AccountStateSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    displayName: z.string().max(200).nullable().optional(),
    disabled: z.boolean().optional(),
  })
  // STRICT, not merely closed. Zod's default is to STRIP an unknown key, which
  // would keep the secret out of storage but say nothing — and this repo's rule
  // is to reject at the boundary rather than silently drop, because a silent
  // drop makes the audit trail lie about what it was asked to record.
  .strict()
export type AccountState = z.infer<typeof AccountStateSchema>

/**
 * A stored audit event.
 *
 * `actorUid` is the REAL human. `effectiveActorUid` is set only when the actor
 * was impersonating, and carries the identity they were acting AS — the fact an
 * ordinary log line loses, and the one an auditor most needs.
 *
 * `failureCode` is a SHORT machine code, never a message: a caught error's
 * `.message` can carry a document path, an email, or a provider's own prose, and
 * durable storage is exactly where that must not land.
 */
export const AccountAuditEventSchema = z
  .object({
    /** Deterministic — see `accountAuditEventId`. A retry finalizes, never duplicates. */
    id: z.string().min(1),
    action: z.enum(ACCOUNT_AUDIT_ACTIONS),
    result: z.enum(ACCOUNT_AUDIT_RESULTS),
    /** The real administrator, even when they were impersonating. */
    actorUid: z.string().min(1),
    /** Who the actor was acting AS. Absent on an ordinary session. */
    effectiveActorUid: z.string().min(1).optional(),
    targetUid: z.string().min(1),
    before: AccountStateSchema.optional(),
    after: AccountStateSchema.optional(),
    /** Required by the operations that demand one (admin password reset). */
    reason: z.string().max(500).optional(),
    /** Short machine code. NEVER an error message — see the field note above. */
    failureCode: z.string().max(100).optional(),
    /** Joins this event to the server logs for the same request. */
    correlationId: z.string().min(1),
    startedAt: TimestampSchema,
    settledAt: TimestampSchema.optional(),
  })
  // Strict for the same reason `AccountStateSchema` is: an unknown field on an
  // audit event is either a leak or a drift, and both must be loud.
  .strict()
export type AccountAuditEvent = z.infer<typeof AccountAuditEventSchema>

/**
 * The event id, derived rather than random.
 *
 * Determinism is what makes the protocol idempotent: a retried operation
 * finalizes the event it already started instead of leaving a `started` orphan
 * beside a `succeeded` twin. `operationId` is the caller's per-attempt id, so
 * two DIFFERENT operations on the same target never collide.
 *
 * Firestore document ids may not contain `/`, and the three inputs are a uid, an
 * action from the closed enum, and a server-minted uuid — none of which can.
 */
export function accountAuditEventId(
  action: AccountAuditAction,
  targetUid: string,
  operationId: string,
): string {
  return `${action}__${targetUid}__${operationId}`
}

/** Whether an event is still open — the state a reconciliation view looks for. */
export function isUnsettled(event: AccountAuditEvent): boolean {
  return event.result === 'started'
}

/**
 * The SHORT machine code for a caught error — the only thing `failureCode` may
 * ever hold.
 *
 * It lives beside the field it feeds rather than in whichever action needed it
 * first, because every writer must answer this question identically: a caught
 * error's `.message` can carry an email, a document path, a temporary password
 * echoed by a provider, or a whole stack, and durable storage is exactly where
 * that must not land. A Firebase string code (`auth/user-not-found`) is already a
 * code; for anything else the CLASS NAME is used, which is chosen by us and
 * carries no runtime data. `unknown` for a non-Error throw — a thrown string
 * IS caller data and must not be copied through.
 *
 * The 100-character slice matches `AccountAuditEventSchema.failureCode`, so a
 * pathological code fails the length bound here instead of at the write.
 */
export function auditFailureCode(error: unknown): string {
  const firebase = firebaseErrorCode(error)
  if (firebase) return firebase.slice(0, 100)
  if (error instanceof Error) return error.name.slice(0, 100)
  return 'unknown'
}
