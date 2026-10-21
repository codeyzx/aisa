import type { Session } from '@/lib/auth/session'
import { createLogger } from '@/lib/log'

/**
 * The audit sink — a DEDICATED logger fixed at the lowest threshold, NOT the
 * process `log`. An audit line is a compliance record, not a diagnostic: it must
 * survive `LOG_LEVEL=warn`/`error` in production, or a deployment could silently
 * turn the audit trail off. A `debug` threshold means every audit line always
 * emits, independent of the process log level. Same JSON sink (stdout).
 */
const auditLog = createLogger({ level: 'debug' })

/**
 * Thin audit seam. Emits one structured JSON line per audited action so the
 * logging implementation stays consistent without leaking into call sites.
 *
 * WHAT THIS IS NOT. This is an application audit event STREAM, not durable,
 * tamper-evident audit STORAGE. The line goes to stdout and the app's
 * responsibility ends there: nothing here retains it, nothing signs it, nothing
 * can prove it was not edited or dropped after the fact, and a container that is
 * replaced without its logs being shipped somewhere has lost the trail. Whoever
 * deploys this owns transport and retention — see the operations contract
 * (docs/reference/contracts/operations.md, "Logs"). Calling stdout an audit log
 * without saying that is the lie this comment exists to prevent.
 *
 * The account-administration trail is a DIFFERENT thing and deliberately so:
 * `lib/audit/account-audit.repo.ts` writes those events to Firestore as records
 * with their own read surface, because a compliance question about who disabled
 * an account must be answerable from the product, not from log retention.
 */
export function audit(
  session: Session,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
): void {
  auditLog.info('[audit] action', {
    ...meta,
    type: 'audit',
    action,
    target,
    uid: session.uid,
    // `uid` is the subject; `actor` is the human behind it. Set AFTER `...meta`
    // and UNCONDITIONALLY, so a caller cannot forge `actor` through `meta` on an
    // ordinary session — when there is no impersonator this is `undefined`, which
    // overrides any forged value and is dropped from the JSON line.
    actor: session.impersonator?.uid,
  })
}
