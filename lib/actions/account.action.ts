'use server'

/**
 * Account administration server actions — the ONLY way a browser can change a
 * Firebase Auth account in this application.
 *
 * ── THE ORDER IS THE FEATURE ─────────────────────────────────────────────────
 * Every mutation below runs the same ordered sequence, and each step is there
 * because skipping it produces a specific, named failure:
 *
 *  1. AUTHORIZE — `runAction('admin:users:manage')`. A server action is a public
 *     POST endpoint; the UI that renders the button gates nothing.
 *  2. REFUSE AN IMPERSONATED SESSION. An overlay makes the acting identity the
 *     TARGET, so an account mutation performed under one is attributed to the
 *     person being impersonated. Account administration is the one family where
 *     "who really did this" cannot be allowed to blur, so it is refused outright
 *     rather than merely annotated.
 *  3. PARSE with Zod at the boundary. The schemas live in `account.contract.ts`.
 *  4. RE-READ THE TARGET LIVE. The client's view of an account can be minutes
 *     old — the person may have been disabled, promoted, or deleted since the row
 *     rendered — and every refusal below is a statement about the account as it
 *     IS, not as the caller last saw it.
 *  5. TAKE THE FINAL-ADMIN LEASE, for demotion and disablement only, and re-count
 *     administrators INSIDE it. A live count alone does not help: two admins
 *     demoting each other simultaneously each see two and each conclude their own
 *     demotion is safe. See `admin-lease.ts`.
 *  6. REFUSE self-demotion, self-disable, and removal of the final administrator.
 *  7. OPEN THE DURABLE AUDIT EVENT BEFORE MUTATING. A Firebase Auth call and a
 *     Firestore write cannot be made atomic, so the event is written first as
 *     `started`; a process that dies mid-operation leaves a visible record rather
 *     than none. See `account-audit.contract.ts`.
 *  8. ADVANCE THE REVOCATION MARKER FIRST, then mutate, then revoke Firebase
 *     refresh tokens, then reconcile the marker with Firebase's own cutoff.
 *     Marker-first because it is the only step that fails CLOSED: between it and
 *     the Auth call, the target has already lost server access, Firestore Rules
 *     access, and its client listeners. Doing it last would leave a window where
 *     authority had changed but every enforcement point still said yes.
 *  9. SETTLE the audit event as `succeeded` / `failed` / `reconciliation_required`.
 * 10. REVALIDATE the admin surface.
 *
 * ── THE TEMPORARY PASSWORD ───────────────────────────────────────────────────
 * `createAccountAction` and `resetAccountPasswordAction` return a temporary
 * password in the action RESULT, exactly once. It is never persisted, never
 * logged, and never put in a URL. It structurally CANNOT enter the audit trail:
 * `AccountStateSchema` is a strict, closed object of three fields, so there is no
 * shape for it to ride in on. Do not add a field to that schema to "record what
 * was issued".
 *
 * ── WHAT IS NOT HERE ─────────────────────────────────────────────────────────
 * No account deletion, no email change, and no way to clear `mustChangePassword`.
 * The last one is deliberate and load-bearing: only the dedicated,
 * proof-carrying password-transition path may clear that claim, or an admin
 * action would become a way to bypass a mandatory password change.
 */
import 'server-only'

import { revalidatePath } from 'next/cache'

import { newCorrelationId } from '@/lib/api/cid'
import {
  AccountTargetSchema,
  CreateAccountSchema,
  ResetAccountPasswordSchema,
  UpdateAccountNameSchema,
  UpdateAccountRoleSchema,
  type AccountSummary,
  type CreateAccountInput,
} from '@/lib/auth/account.contract'
import {
  countAdmins,
  createAccount,
  deleteAccountForFailedCreate,
  getAccount,
  resetAccountPassword,
  revokeAccountRefreshTokens,
  setAccountDisabled,
  updateAccountProfile,
  updateAccountRole,
} from '@/lib/auth/account.repo'
import {
  assertLeaseHeld,
  LeaseLostError,
  withAdminLease,
  type AdminLease,
} from '@/lib/auth/admin-lease'
import { isRetainedAdministrator, type Role } from '@/lib/auth/rbac'
import { advanceRevokedAfterEpoch } from '@/lib/auth/revocation'
import { revocationCutoff } from '@/lib/auth/revocation.contract'
import type { Session } from '@/lib/auth/session'
import {
  auditFailureCode,
  type AccountAuditAction,
  type AccountState,
} from '@/lib/audit/account-audit.contract'
import {
  settleAccountAudit,
  startAccountAudit,
} from '@/lib/audit/account-audit.repo'
import { runAction, type ActionResult } from '@/lib/data/action-result'
import {
  AdminLockoutError,
  ConflictError,
  ForbiddenError,
  LeaseUnavailableError,
  NotFoundError,
  ReconciliationRequiredError,
} from '@/lib/data/domain-error'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { log } from '@/lib/log'

/** The one surface these mutations change. Revalidated by every one of them. */
const ADMIN_SURFACE_PATH = '/admin'

/**
 * Step 2. Refuse an impersonated actor.
 *
 * `runAction` has already denied a session whose overlay could not be VERIFIED
 * (`can()` fails closed on `impersonationUnavailable`); this refuses the ones
 * that verified fine. Both must be refused, for different reasons — the first
 * because we do not know who is acting, the second because we do, and it is not
 * the admin.
 */
function requireRealAdministrator(session: Session): void {
  if (session.impersonator) {
    throw new ForbiddenError(
      'account mutations are refused while impersonating another user',
    )
  }
}

/**
 * Refuse an operation an administrator aimed at their OWN account through the
 * admin surface. `role`-changing and `disable` already have their own self-guards
 * expressed as `admin_lockout` (they are about the administrator FLOOR); this one
 * is about not letting the actor destroy the session or credential they are
 * acting with — a different rule, so it answers `forbidden`, and its remedy is a
 * separate personal flow rather than "wait and retry".
 *
 * `session.uid` is the acting identity (an impersonated caller is already refused
 * by `requireRealAdministrator`), so this is a true self-comparison.
 */
function refuseSelfTarget(session: Session, uid: string, what: string): void {
  if (uid === session.uid) {
    throw new ForbiddenError(
      `an administrator may not ${what} from the admin surface`,
    )
  }
}

/** Step 4. The live target, or a typed `not_found` the caller can render. */
async function requireLiveTarget(uid: string): Promise<AccountSummary> {
  const target = await getAccount(uid)
  if (!target) throw new NotFoundError(`account ${uid} not found`)
  return target
}

/** The audit-safe projection of an account: the three fields that may be stored. */
function auditState(account: AccountSummary): AccountState {
  return {
    role: account.role,
    displayName: account.displayName,
    disabled: account.disabled,
  }
}

/**
 * Settle an event without letting the settle's own failure replace the outcome
 * being reported. Used only on paths that are ALREADY unwinding: the caller has
 * an error to surface and this one would mask it. An event that cannot be
 * settled stays `started`, which is a visible, queryable state by design.
 */
async function settleQuietly(
  auditId: string,
  input: Parameters<typeof settleAccountAudit>[1],
): Promise<void> {
  try {
    await settleAccountAudit(auditId, input)
  } catch (error) {
    log.error('[account] audit event could not be settled', { auditId, error })
  }
}

interface AccountMutationPlan<T> {
  session: Session
  action: AccountAuditAction
  /** The LIVE target, already re-read. Its state becomes the audit `before`. */
  target: AccountSummary
  reason?: string
  /**
   * Whether this operation must end the target's sessions. True for anything that
   * changes what the account may do or how it authenticates — role, disable,
   * password reset, explicit sign-out. FALSE for a display-name change, which
   * carries no authority: signing everyone out to fix a typo would be a denial of
   * service dressed as security.
   */
  revokesSessions: boolean
  /** Held only by operations that can remove administrator capability. */
  lease?: AdminLease
  /** The external Firebase Auth call. Everything before it is reversible. */
  mutate: () => Promise<{ value: T; after?: AccountState }>
}

/**
 * Steps 7–10 for an EXISTING target, in order, once.
 *
 * The single most important line in this function is the comment marking where
 * the Auth mutation has landed. Before it, a failure is a clean `failed`: nothing
 * changed and the caller may retry. After it, a failure is
 * `reconciliation_required` and MUST NOT be reported as either success or
 * failure — the account has already changed while the sessions that change was
 * meant to end may still be alive, and a caller told "failed" would retry into a
 * state that no longer needs it.
 */
async function runAccountMutation<T>(plan: AccountMutationPlan<T>): Promise<T> {
  const targetUid = plan.target.uid
  // Per-attempt id. It makes the audit event id deterministic, so a retry
  // settles the event it opened rather than leaving a `started` orphan beside a
  // `succeeded` twin — and two different operations on one target never collide.
  const operationId = crypto.randomUUID()

  // `actorUid` is unconditionally the session uid and there is no
  // `effectiveActorUid`: `requireRealAdministrator` has already refused every
  // impersonated caller, so the two can never differ on this path.
  const auditId = await startAccountAudit({
    action: plan.action,
    operationId,
    actorUid: plan.session.uid,
    targetUid,
    before: auditState(plan.target),
    ...(plan.reason && { reason: plan.reason }),
    correlationId: newCorrelationId(),
  })

  // MARKER FIRST — see the header. Deliberately outside the try below: if this
  // fails, nothing has been mutated and the ordinary `failed` path applies.
  if (plan.revokesSessions) {
    try {
      await advanceRevokedAfterEpoch(targetUid, revocationCutoff(Date.now()))
    } catch (error) {
      await settleQuietly(auditId, {
        result: 'failed',
        failureCode: auditFailureCode(error),
      })
      throw error
    }
  }

  // The lease, immediately before the external call. A lease held three network
  // round trips ago is not a lease held now.
  if (plan.lease) {
    try {
      await assertLeaseHeld(plan.lease)
    } catch {
      await settleQuietly(auditId, {
        result: 'failed',
        failureCode: 'lease_lost_before_mutation',
      })
      // NOT reconciliation: the Auth call has provably not run. The marker may
      // already have advanced, which over-revokes the target's sessions — a safe
      // direction (they sign in again) and never a partial mutation.
      throw new LeaseUnavailableError(
        'the account-mutation lease was lost before any Auth call was made',
      )
    }
  }

  let outcome: { value: T; after?: AccountState }
  try {
    outcome = await plan.mutate()
  } catch (error) {
    await settleQuietly(auditId, {
      result: 'failed',
      failureCode: auditFailureCode(error),
    })
    throw error
  }

  // ─── PAST THIS LINE THE AUTH MUTATION HAS LANDED ───────────────────────────
  // Revalidate here rather than at the end: a change that landed must show on
  // the surface even when a follow-up step fails and the caller is told to
  // reconcile. A stale screen after a real change is how an admin retries an
  // operation that already succeeded.
  revalidatePath(ADMIN_SURFACE_PATH)

  try {
    // The lease again, AFTER the mutation: it is what proves this operation was
    // still the serialized one while it ran, rather than a stalled process that
    // woke up inside somebody else's lock.
    if (plan.lease) await assertLeaseHeld(plan.lease)

    if (plan.revokesSessions) {
      const cutoff = await revokeAccountRefreshTokens(targetUid)
      // A null cutoff means Firebase gave back no parseable `tokensValidAfterTime`
      // — there is nothing to reconcile the marker WITH. The marker already holds
      // our own cutoff from before the mutation, and it is monotonic, so leaving
      // it alone is correct; writing a zero would be the one thing that lowers it.
      if (cutoff !== null) await advanceRevokedAfterEpoch(targetUid, cutoff)
    }

    await settleAccountAudit(auditId, {
      result: 'succeeded',
      ...(outcome.after && { after: outcome.after }),
    })
  } catch (error) {
    // The one line `runAction` will not write for us: it returns a typed
    // DomainError's code WITHOUT logging, which is right for `not_found` and
    // wrong for this — a partial state is exactly what an operator must see.
    log.error('[account] mutation landed but a follow-up failed', {
      action: plan.action,
      targetUid,
      auditId,
      error,
    })
    await settleQuietly(auditId, {
      result: 'reconciliation_required',
      failureCode:
        error instanceof LeaseLostError
          ? 'lease_lost_after_mutation'
          : auditFailureCode(error),
    })
    throw new ReconciliationRequiredError(
      `${plan.action} applied to ${targetUid} but revocation or audit settlement did not complete`,
    )
  }

  return outcome.value
}

/**
 * Run `operation` under the final-admin lease, or refuse.
 *
 * Refuses rather than queues: an administrator waiting on a spinner while
 * another admin's operation completes learns nothing, and a queue would let a
 * request sit past its own usefulness. `lease_unavailable` says "try again in a
 * moment", which is both true and actionable.
 */
async function withFinalAdminGuard<T>(
  operation: (lease: AdminLease) => Promise<T>,
): Promise<T> {
  const outcome = await withAdminLease(crypto.randomUUID(), operation)
  if (!outcome.acquired) {
    throw new LeaseUnavailableError(
      'another administrator holds the account-mutation lease',
    )
  }
  return outcome.value
}

/**
 * Would this role change strip retained-administrator authority from the target?
 * Read through `isRetainedAdministrator` (the `admin:users:manage` holder), never
 * a bare `=== 'admin'`, so the guarantee follows the capability a fork keeps, not
 * a role name a fork renames. See `rbac.ts`.
 */
function isDemotion(current: Role, next: Role): boolean {
  return isRetainedAdministrator(current) && !isRetainedAdministrator(next)
}

/**
 * Step 6's directory half: refuse when `target` is the last administrator who can
 * still sign in.
 *
 * Called ONLY inside the lease, and only when the target is an enabled admin —
 * removing authority from anyone else provably cannot reduce the administrator
 * count, so the full directory scan (`countAdmins` is a paged scan of every
 * account) is skipped rather than paid for nothing.
 *
 * `<= 1` and not `< 1`: the target is still counted at this point, so 1 means
 * "this account is the only one left".
 *
 * DEFENCE IN DEPTH — it does not fire today, and you should not read it as the
 * thing keeping an administrator in the directory. Both callers refuse a SELF
 * target first, and the actor is by definition an enabled administrator, so a
 * non-self enabled-admin target makes the count at least 2. Driven 2026-07-22
 * across every lockout attempt: the refusal a reader actually hits is always the
 * self-guard above this call, never this one.
 *
 * It stays because the invariant it states is the real one and the cost is
 * nothing (the scan is skipped unless the target is an enabled admin). Change a
 * caller — grant this surface to a non-admin actor, allow a self target, or add
 * a third path — and it becomes reachable again. If you ever see this error, the
 * guard above it has a hole.
 */
async function refuseFinalAdminRemoval(what: string): Promise<void> {
  if ((await countAdmins()) <= 1) {
    throw new AdminLockoutError(
      `${what} would leave the application with no enabled administrator`,
    )
  }
}

/**
 * Create an account with a server-generated temporary password.
 *
 * The ONE operation whose audit event cannot be opened before the mutation: the
 * event is keyed on the target uid, and there is no target until Firebase mints
 * one. So the protocol inverts, and the compensation is what replaces it — if the
 * account exists but its history cannot be opened, the account is REMOVED. This
 * is the only deletion in the module, and it only ever names a uid this call
 * created seconds earlier.
 *
 * No revocation: a brand-new account has no sessions to end.
 */
export async function createAccountAction(
  input: CreateAccountInput,
): Promise<ActionResult<{ uid: string; temporaryPassword: string }>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = CreateAccountSchema.parse(input)

    let created: { uid: string; temporaryPassword: string }
    try {
      created = await createAccount(parsed)
    } catch (error) {
      // A taken email is an EXPECTED outcome of a form, not a bug — surfaced as
      // `conflict` (the request conflicts with an account that already exists) so
      // the create form can render a field-level message off the code instead of
      // showing the opaque `internal`. Every other Firebase failure stays
      // unhandled and opaque, which is correct: we do not know what it was.
      if (firebaseErrorCode(error) === 'auth/email-already-exists') {
        throw new ConflictError(`an account already exists for ${parsed.email}`)
      }
      throw error
    }

    revalidatePath(ADMIN_SURFACE_PATH)

    let auditId: string
    try {
      auditId = await startAccountAudit({
        action: 'user.create',
        operationId: crypto.randomUUID(),
        actorUid: session.uid,
        targetUid: created.uid,
        correlationId: newCorrelationId(),
      })
    } catch (error) {
      // COMPENSATE. An account that exists with no history is an account nobody
      // can account for — and unlike every other step here, it is undoable,
      // because we created it and nobody has used it yet.
      await deleteAccountForFailedCreate(created.uid)
      throw error
    }

    try {
      await settleAccountAudit(auditId, {
        result: 'succeeded',
        // The temporary password is structurally absent: `AccountState` is a
        // strict three-field object and has no shape that could carry it.
        after: {
          role: parsed.role,
          displayName: parsed.displayName,
          disabled: false,
        },
      })
    } catch (error) {
      // NOT compensated. The account is real, initialized, and usable; deleting
      // it now would destroy a working account over an incomplete log line. The
      // password is lost with the failed result, so recovery is an admin reset.
      log.error('[account] created account but could not settle its audit', {
        uid: created.uid,
        auditId,
        error,
      })
      throw new ReconciliationRequiredError(
        `account ${created.uid} was created but its audit event could not be settled`,
      )
    }

    return created
  })
}

/**
 * Change the display name. The one mutation here that does NOT revoke sessions:
 * a display name grants nothing, so ending every session over it would be a self
 * -inflicted outage. Email stays immutable in this module by contract.
 */
export async function updateAccountNameAction(input: {
  uid: string
  displayName: string
}): Promise<ActionResult<AccountSummary>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = UpdateAccountNameSchema.parse(input)
    const target = await requireLiveTarget(parsed.uid)

    return runAccountMutation({
      session,
      action: 'user.name.update',
      target,
      revokesSessions: false,
      mutate: async () => {
        const account = await updateAccountProfile(parsed.uid, {
          displayName: parsed.displayName,
        })
        return { value: account, after: auditState(account) }
      },
    })
  })
}

/**
 * Change the role.
 *
 * A PROMOTION takes no lease and needs none — it cannot reduce the number of
 * administrators, so there is nothing for a concurrent operation to race it into.
 * A DEMOTION takes the lease, re-reads the target inside it (the decision to take
 * the lease was made on a read that predates the lock), and only then asks the
 * two refusal questions.
 *
 * Both revoke: the role lives in a custom claim baked into the session cookie, so
 * without revocation the target keeps their OLD authority until the cookie
 * expires — up to five days of an admin who has already been demoted.
 */
export async function updateAccountRoleAction(input: {
  uid: string
  role: Role
}): Promise<ActionResult<AccountSummary>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = UpdateAccountRoleSchema.parse(input)
    const target = await requireLiveTarget(parsed.uid)

    const apply = (account: AccountSummary, lease?: AdminLease) =>
      runAccountMutation({
        session,
        action: 'user.role.update',
        target: account,
        revokesSessions: true,
        ...(lease && { lease }),
        mutate: async () => {
          const updated = await updateAccountRole(parsed.uid, parsed.role)
          return { value: updated, after: auditState(updated) }
        },
      })

    if (!isDemotion(target.role, parsed.role)) return apply(target)

    return withFinalAdminGuard(async (lease) => {
      const live = await requireLiveTarget(parsed.uid)
      if (!isDemotion(live.role, parsed.role)) return apply(live, lease)

      if (live.uid === session.uid) {
        throw new AdminLockoutError(
          'an administrator may not demote their own account',
        )
      }
      if (!live.disabled) await refuseFinalAdminRemoval('this demotion')

      return apply(live, lease)
    })
  })
}

/**
 * Re-enable an account. No lease and no revocation, and both absences are
 * deliberate: enabling can only ADD an administrator, never remove one, and there
 * is no session to end — a disabled account's sessions were already killed when
 * it was disabled. The target signs in again with their existing password.
 */
export async function enableAccountAction(input: {
  uid: string
}): Promise<ActionResult<AccountSummary>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = AccountTargetSchema.parse(input)
    const target = await requireLiveTarget(parsed.uid)

    return runAccountMutation({
      session,
      action: 'user.enable',
      target,
      revokesSessions: false,
      mutate: async () => {
        const account = await setAccountDisabled(parsed.uid, false)
        return { value: account, after: auditState(account) }
      },
    })
  })
}

/**
 * Disable an account: the single authority on whether it may sign in
 * (`UserRecord.disabled`), with no second Firestore flag to drift from it.
 *
 * Takes the lease unconditionally — every disable is potentially the one that
 * removes the last administrator, and the lease must be held BEFORE the count
 * that would say otherwise. Disabling an account that is already disabled is a
 * recorded success, not an error: what the admin asked for is true afterwards.
 */
export async function disableAccountAction(input: {
  uid: string
}): Promise<ActionResult<AccountSummary>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = AccountTargetSchema.parse(input)
    // Fail fast with a typed `not_found` before taking a lock for an account
    // that does not exist. The authoritative read is the one inside the lease.
    await requireLiveTarget(parsed.uid)

    return withFinalAdminGuard(async (lease) => {
      const live = await requireLiveTarget(parsed.uid)

      if (live.uid === session.uid) {
        throw new AdminLockoutError(
          'an administrator may not disable their own account',
        )
      }
      if (isRetainedAdministrator(live.role) && !live.disabled) {
        await refuseFinalAdminRemoval('disabling this account')
      }

      return runAccountMutation({
        session,
        action: 'user.disable',
        target: live,
        revokesSessions: true,
        lease,
        mutate: async () => {
          const account = await setAccountDisabled(parsed.uid, true)
          return { value: account, after: auditState(account) }
        },
      })
    })
  })
}

/**
 * Replace an account's password with a fresh temporary one and re-arm the
 * mandatory change. A break-glass workflow: it hands a working credential to a
 * human over whatever channel they are on, which is why it demands a REASON and
 * why the reason is the thing that gets recorded — the password never is.
 *
 * The role claim survives, because the claim write goes through the merge helper.
 * Revokes, because `mustChangePassword` does not affect an ALREADY-MINTED session
 * cookie: without revocation the target keeps working on the old password's
 * session until that cookie expires.
 */
export async function resetAccountPasswordAction(input: {
  uid: string
  reason: string
}): Promise<ActionResult<{ temporaryPassword: string }>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = ResetAccountPasswordSchema.parse(input)
    // The admin surface administers OTHER accounts. Resetting your OWN password
    // here would hand you a temporary credential and revoke your live session
    // mid-operation — the boundary refuses it server-side, not just by hiding the
    // button. A personal "reset my password" flow is separate product work (see
    // the 0050 locked decision).
    refuseSelfTarget(session, parsed.uid, 'reset their own password')
    const target = await requireLiveTarget(parsed.uid)

    return runAccountMutation({
      session,
      action: 'user.password.reset',
      target,
      reason: parsed.reason,
      revokesSessions: true,
      mutate: async () => {
        const result = await resetAccountPassword(parsed.uid)
        // No `after`: a password reset changes none of the three auditable
        // fields, and the one thing it DID change must never be written.
        return { value: result }
      },
    })
  })
}

/**
 * End every session for an account without changing anything else about it.
 *
 * Kept separate from disablement on purpose: "sign this person out of the laptop
 * they left on a train" and "this person may no longer use the application" are
 * different decisions, and collapsing them would make the cheap, reversible one
 * cost the expensive, disruptive one.
 *
 * The revocation IS the operation here, so `mutate` is empty — the marker
 * advance, the Firebase revoke, and the reconciliation in `runAccountMutation`
 * are the whole mutation, and they run in exactly the same order as everywhere
 * else rather than in a second hand-written copy of the sequence.
 */
export async function signOutAccountSessionsAction(input: {
  uid: string
}): Promise<ActionResult<void>> {
  return runAction('admin:users:manage', async (session) => {
    requireRealAdministrator(session)
    const parsed = AccountTargetSchema.parse(input)
    // As with a self password reset: signing YOURSELF out from the admin surface
    // would end the very session performing the operation. Refused at the
    // boundary; a personal "sign me out everywhere" flow is separate product work
    // (see the 0050 locked decision).
    refuseSelfTarget(session, parsed.uid, 'revoke their own sessions')
    const target = await requireLiveTarget(parsed.uid)

    await runAccountMutation({
      session,
      action: 'user.sessions.revoke',
      target,
      revokesSessions: true,
      mutate: async () => ({ value: undefined }),
    })
  })
}
