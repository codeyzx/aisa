'use server'

/**
 * The self-service password transition — the ONE action that may clear
 * `mustChangePassword`, and the only account mutation whose actor is the
 * account's own user rather than an administrator.
 *
 * ── WHY IT IS NOT `runAction` ────────────────────────────────────────────────
 * `runAction` takes a CAPABILITY, and `authorizeSession` refuses a session
 * carrying `mustChangePassword` before it ever looks at one (`denial:
 * 'password_change_required'`). So every legitimate caller of this action — a
 * user who owes a password change and is trying to make it — would be refused by
 * construction. A capability gate here is not merely unnecessary, it is the bug.
 *
 * That is exactly the bar `rules/action-export-wraps-run-action.yml` sets for a
 * suppression: the export IS gated, and the gate CANNOT be a capability. The
 * gate is a three-part proof, and no part is redundant:
 *
 *  1. a verified session cookie — so this is a protected entry point and not a
 *     public password-reset RPC anyone on the internet may POST to;
 *  2. a FRESH Firebase ID token, minted seconds ago by re-entering the CURRENT
 *     password in the browser — so a live cookie on an unattended laptop is not
 *     enough to take the account over;
 *  3. that token's uid matching the session's, and its `mustChangePassword`
 *     claim being set — so the proof cannot be borrowed from another account and
 *     the transition cannot be used as a general claim-clearing endpoint.
 *
 * ── WHY THE CLAIM CANNOT BE CLEARED ANYWHERE ELSE ────────────────────────────
 * `lib/actions/account.action.ts` has no path to clear it; `account.repo.ts`
 * exports no `clearMustChangePassword`, only `changeAccountPassword`, which
 * clears the claim as a CONSEQUENCE of the password write in the same call. So a
 * client that wanted the claim gone without choosing a password has no export to
 * call — the guarantee is structural, not a rule someone has to remember.
 *
 * ── THE ORDER, AND WHY IT MATCHES THE ADMIN MUTATIONS ────────────────────────
 * Audit opened first, revocation marker advanced BEFORE the Auth call, mutate,
 * revoke refresh tokens, reconcile the marker, settle the audit. The reasoning
 * is `lib/actions/account.action.ts`'s header verbatim, and it is written out
 * there rather than restated here — what matters is that this path does not get
 * a second, subtly different sequence just because its actor is not an admin.
 */
import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { newCorrelationId } from '@/lib/api/cid'
import {
  ChangeOwnPasswordSchema,
  type AccountSummary,
} from '@/lib/auth/account.contract'
import {
  changeAccountPassword,
  getAccount,
  revokeAccountRefreshTokens,
} from '@/lib/auth/account.repo'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { IMPERSONATION_COOKIE } from '@/lib/auth/impersonation'
import { mustChangePasswordFromClaims } from '@/lib/auth/rbac'
import { isReauthenticationFresh } from '@/lib/auth/reauth'
import { advanceRevokedAfterEpoch } from '@/lib/auth/revocation'
import { revocationCutoff } from '@/lib/auth/revocation.contract'
import { getSession } from '@/lib/auth/session'
import { isDefinitiveTokenRejection } from '@/lib/auth/token-rejection'
import {
  settleAccountAudit,
  startAccountAudit,
} from '@/lib/audit/account-audit.repo'
import { actionError, type ActionResult } from '@/lib/data/action.contract'
import {
  DomainError,
  ReconciliationRequiredError,
} from '@/lib/data/domain-error'
import { adminAuth } from '@/lib/firebase/admin-auth'
import { firebaseErrorCode } from '@/lib/firebase/error-code'
import { log } from '@/lib/log'

/**
 * A SHORT machine code for the durable audit event — never a message.
 *
 * Deliberately a second copy of `account.action.ts`'s helper rather than a
 * shared import: both files are `'use server'`, where every export must be an
 * async function, so neither can export a sync helper to the other. The shared
 * home would be `lib/audit/`, which this slice does not own. If a third copy
 * ever appears, that is the signal to move all three into the audit module
 * instead of adding one more.
 */
function failureCodeOf(error: unknown): string {
  const firebase = firebaseErrorCode(error)
  if (firebase) return firebase.slice(0, 100)
  if (error instanceof Error) return error.name.slice(0, 100)
  return 'unknown'
}

/**
 * Settle an event without letting the settle's own failure replace the outcome
 * being reported. Used only on paths already unwinding — see the twin in
 * `account.action.ts`. An event that cannot be settled stays `started`, which is
 * a visible, queryable state by design.
 */
async function settleQuietly(
  auditId: string,
  input: Parameters<typeof settleAccountAudit>[1],
): Promise<void> {
  try {
    await settleAccountAudit(auditId, input)
  } catch (error) {
    log.error('[password] audit event could not be settled', { auditId, error })
  }
}

/**
 * Steps 1–5 of the transition, in order, once. Throws a typed `DomainError` for
 * the one outcome a caller must not read as either success or failure.
 *
 * The marker advance is deliberately outside the try that owns the Auth call:
 * if it fails, nothing has been mutated and the ordinary `failed` path applies.
 * Past the `changeAccountPassword` line the user's credential HAS changed, so a
 * later failure is `reconciliation_required` — the password is new while the
 * sessions it was meant to end may still be alive.
 */
async function runPasswordTransition(
  target: AccountSummary,
  newPassword: string,
): Promise<void> {
  const uid = target.uid
  const auditId = await startAccountAudit({
    action: 'user.password.change',
    operationId: crypto.randomUUID(),
    // Actor and target are the same human, and there is no `effectiveActorUid`:
    // an impersonated session is refused before this function is reached, so the
    // two can never differ on this path.
    actorUid: uid,
    targetUid: uid,
    before: {
      role: target.role,
      displayName: target.displayName,
      disabled: target.disabled,
    },
    correlationId: newCorrelationId(),
  })

  try {
    await advanceRevokedAfterEpoch(uid, revocationCutoff(Date.now()))
  } catch (error) {
    await settleQuietly(auditId, {
      result: 'failed',
      failureCode: failureCodeOf(error),
    })
    throw error
  }

  try {
    await changeAccountPassword(uid, newPassword)
  } catch (error) {
    await settleQuietly(auditId, {
      result: 'failed',
      failureCode: failureCodeOf(error),
    })
    throw error
  }

  // ─── PAST THIS LINE THE PASSWORD HAS CHANGED ───────────────────────────────
  try {
    const cutoff = await revokeAccountRefreshTokens(uid)
    // A null cutoff means Firebase gave back no parseable `tokensValidAfterTime`
    // — there is nothing to reconcile the monotonic marker WITH, and writing a
    // zero is the one thing that could lower it.
    if (cutoff !== null) await advanceRevokedAfterEpoch(uid, cutoff)
    // No `after`: a password change moves none of the three auditable fields,
    // and the one thing it DID change must never be written.
    await settleAccountAudit(auditId, { result: 'succeeded' })
  } catch (error) {
    log.error('[password] change landed but a follow-up failed', {
      uid,
      auditId,
      error,
    })
    await settleQuietly(auditId, {
      result: 'reconciliation_required',
      failureCode: failureCodeOf(error),
    })
    throw new ReconciliationRequiredError(
      `password for ${uid} was changed but revocation or audit settlement did not complete`,
    )
  }
}

/**
 * Replace the caller's OWN temporary password with a permanent one.
 *
 * Resolves to an `ActionResult` only on REFUSAL. On success it never returns:
 * the session cookie is cleared and the browser is redirected to /login, so the
 * new password is proven by signing in with it rather than asserted by a screen
 * that says "saved". That is the point of ending the sessions — including this
 * one — as part of the transition rather than after it.
 *
 * Refusals are deliberately coarse. A stale or unverifiable proof answers
 * `unauthenticated` (the remedy is to re-enter the current password), and every
 * shape of "you may not do this to this account" answers `forbidden` — a caller
 * probing which of uid-mismatch, missing-claim, or disabled-account it tripped
 * learns nothing it is entitled to know.
 *
 * ⚠️ The suppression below must sit on the line IMMEDIATELY above the export —
 * ast-grep matches by adjacency, so a comment wedged between the two silently
 * does nothing and the rule goes quiet while believing itself satisfied.
 */
// ast-grep-ignore: action-export-wraps-run-action
export async function changeOwnPasswordAction(input: {
  idToken: string
  newPassword: string
}): Promise<ActionResult<never>> {
  // Part 1 of the gate: a verified session. This is the exempted `getSession`
  // call — `requireReadySession` cannot be used here (it redirects sessions
  // owing a password change straight back to the screen that calls this), and
  // `requireSession` would redirect where an action must return an envelope.
  const session = await getSession()
  if (!session) return actionError('unauthenticated')
  // An administrator behind an impersonation overlay cannot produce the target's
  // reauthentication proof — and must never be able to set another human's
  // password even if they somehow could. Refused before anything is read.
  if (session.impersonator) return actionError('forbidden')

  const parsed = ChangeOwnPasswordSchema.safeParse(input)
  if (!parsed.success) return actionError('invalid')

  // Part 2: the FRESH proof. `checkRevoked = true` so a token minted before an
  // administrator revoked this account's sessions cannot be replayed here.
  let decoded
  try {
    decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true)
  } catch (error) {
    // Only a DEFINITIVE rejection means the proof is bad. `checkRevoked = true`
    // forces a network round trip, so this can also fail because Google was
    // unreachable — and answering `unauthenticated` there would tell a valid user
    // to re-authenticate against the provider that is down, on the one screen
    // that clears their mandatory-password gate. See `lib/auth/token-rejection.ts`.
    if (isDefinitiveTokenRejection(error)) return actionError('unauthenticated')
    return actionError('unavailable')
  }

  // Part 3: the proof must belong to THIS session's account…
  if (decoded.uid !== session.uid) return actionError('forbidden')
  // …the account must actually owe a password change (this action is the
  // mandatory transition, not a general password-setting endpoint)…
  if (!mustChangePasswordFromClaims(decoded)) return actionError('forbidden')
  // …and the reauthentication must be RECENT and not in the FUTURE. The whole
  // freshness rule — too old, malformed, or dated after now — lives in the pure
  // `isReauthenticationFresh` so it can be exhaustively unit-tested; every
  // non-fresh case fails closed. See `lib/auth/reauth.ts`.
  if (!isReauthenticationFresh(decoded.auth_time, Date.now())) {
    return actionError('unauthenticated')
  }

  // The LIVE account, re-read after the gate: the decoded token is a snapshot of
  // the moment it was minted, and the audit `before` must describe the account
  // as it IS. A disabled account is refused here even though Firebase would have
  // refused the sign-in that produced the proof — the two checks are seconds
  // apart and this is the one that is current.
  const target = await getAccount(session.uid)
  if (!target) return actionError('not_found')
  if (target.disabled) return actionError('forbidden')

  try {
    await runPasswordTransition(target, parsed.data.newPassword)
  } catch (error) {
    // A typed domain failure is EXPECTED and carries its own code — most
    // importantly `reconciliation_required`, which the screen renders as neither
    // success nor failure. Anything else is a bug and stays opaque.
    if (error instanceof DomainError) return actionError(error.code)
    log.error('[password] unhandled error in the password transition', {
      uid: session.uid,
      error,
    })
    return actionError('internal')
  }

  // The password has changed and every refresh token is revoked. Clear THIS
  // browser's cookie too — the transition is not finished while the session that
  // authenticated with the old password is still usable. The impersonation
  // ticket goes with it for the same reason logout clears it: it is bound to an
  // admin uid and would otherwise resume on the next sign-in.
  const jar = await cookies()
  jar.delete({ name: SESSION_COOKIE, path: '/' })
  jar.delete(IMPERSONATION_COOKIE)

  // Outside every try above: `redirect` signals by throwing, and a catch that
  // swallowed it would turn a completed transition into an `internal` error on a
  // screen whose password has already changed.
  redirect('/login')
}
