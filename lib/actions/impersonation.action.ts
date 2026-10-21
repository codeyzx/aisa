'use server'

/**
 * Impersonation server actions — start and stop.
 *
 * Server actions, not a route handler: `app/api/**` is the edge lane's tree and
 * a route would need its own client fetch wrapper next to `lib/auth/client.ts`.
 * The one existing auth ROUTE is a route only because a Firebase ID-token
 * exchange needs a client `fetch` — that reason does not apply here, and every
 * mutation in this repo already goes through `lib/actions/*.action.ts`.
 *
 * Both entries REDIRECT rather than return an envelope, and that is load-bearing
 * rather than stylistic: `getSession` is wrapped in React `cache()`, so the
 * cookie an action sets is invisible to the same request's re-render — the page
 * would render the PRE-impersonation identity for one pass. A redirect is a
 * fresh request, so the cache question never arises. `docs/reference/contracts/auth.md`
 * layer 4 already legislates this class for login/logout; impersonation is the
 * third case.
 */
import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerValidate, formOptions } from '@tanstack/react-form-nextjs'

import { newCorrelationId } from '@/lib/api/cid'
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_MS,
  mintTicket,
} from '@/lib/auth/impersonation'
import { SECURE_COOKIE_ATTRIBUTES } from '@/lib/auth/cookie-options'
import { can } from '@/lib/auth/rbac'
import {
  getSession,
  sessionFromUserRecord,
  type Session,
} from '@/lib/auth/session'
import { auditFailureCode } from '@/lib/audit/account-audit.contract'
import {
  settleAccountAudit,
  startAccountAudit,
} from '@/lib/audit/account-audit.repo'
import { audit } from '@/lib/data/audit'
import { runFormAction } from '@/lib/data/form-action'
import { adminAuth } from '@/lib/firebase/admin-auth'

/**
 * ── THE DURABLE HALF OF THE TRAIL ────────────────────────────────────────────
 * Both lifecycle events are written to the durable account-administration
 * history (`lib/audit/account-audit.repo.ts`) as well as the stdout `audit()`
 * seam, because "who was acting as whom, and when" is not a question a log
 * shipper can be trusted to answer months later. The two are not redundant: the
 * stdout line is the runtime trace, the Firestore event is the queryable record
 * the admin viewer reads.
 *
 * ATTRIBUTION IS THE POINT, and it is spelled the same way at both ends:
 * `actorUid` is always the REAL administrator and `effectiveActorUid` is always
 * the identity they act AS. On START the session is still the admin, so the
 * target uid supplies the effective actor. On STOP the session IS the target, so
 * the two come off opposite halves of the same Session. Neither call reads a
 * different source for "who is really doing this" than `getSession` already
 * resolved.
 *
 * ⚠️ THE ASYMMETRY IS DELIBERATE. A failure to OPEN the start event refuses the
 * whole operation — an impersonation nobody can account for must not begin, and
 * refusing costs the admin a retry. A failure anywhere in STOP costs nothing and
 * is swallowed: see `stopImpersonationFormAction`.
 */

/**
 * Settle a lifecycle event, or fall back to stdout and LEAVE IT OPEN.
 *
 * Never throws, and the `started` event it leaves behind is the feature rather
 * than the damage: an unsettled event is exactly what the two-step protocol
 * makes queryable, so the viewer shows the impersonation as incomplete and a
 * human can reconcile it. Swallowing the error and settling anyway would be the
 * unsafe version — it would claim an outcome nobody observed.
 *
 * The fallback line keeps the REAL action name so the stdout trail is not forked
 * into a parallel vocabulary; `durableAudit` is what a reconciliation grep looks
 * for, and `failureCode` is a short machine code by construction — never a
 * message, which could carry a document path or a provider's own prose.
 */
async function settleLifecycleAudit(
  auditId: string,
  session: Session,
  action: 'impersonation.start' | 'impersonation.stop',
  targetUid: string,
): Promise<void> {
  try {
    await settleAccountAudit(auditId, { result: 'succeeded' })
  } catch (error) {
    audit(session, action, targetUid, {
      durableAudit: 'unsettled',
      auditId,
      failureCode: auditFailureCode(error),
    })
  }
}

/**
 * The start form's one field: the target's UID, posted as a hidden input from
 * the picker row the admin clicked. A UID, never an email — the picker already
 * resolved the human to an account, so the start is a single unambiguous
 * operation on an id, and it works no-JS because the id rides in the FormData.
 *
 * A PLAIN local const, not a shared `*.form-opts.ts` module: nothing on the
 * client re-declares this shape. The picker rows are ordinary `useActionState`
 * forms, not a TanStack `useForm`, so there is no second reader to keep in sync
 * — the reason the old email form-opts existed at all. `createServerValidate`
 * reads only `onServerValidate` off this; `defaultValues` types `value.uid`.
 */
const startFormOpts = formOptions({ defaultValues: { uid: '' } })

/**
 * Server-side validation for the start — where the live re-read and the three
 * refusals live, loudly, at the boundary.
 *
 * The bound UID is UNTRUSTED: it arrives from a client-rendered row whose
 * `eligible` flag we NEVER trust here. Every check re-reads the target's LIVE
 * user record at click time — a row can be stale (the user disabled, promoted,
 * or deleted since the list rendered), and the DTO's eligibility is display-only.
 *
 * A refusal returns a plain STRING (a form-level message), so `createServerValidate`
 * throws `ServerValidateError` and `runFormAction` returns its `formState`; the
 * clicked row reads the message off `formState.errors` and renders it inline via
 * `role="alert"` — no navigation, no 500. Success falls through (undefined) and
 * `run` below mints.
 */
const validateStart = createServerValidate({
  ...startFormOpts,
  onServerValidate: async ({ value }) => {
    const uid = value.uid.trim()
    if (!uid) return 'Pilih pengguna yang valid untuk di-impersonate'

    // cache()d for this request — already resolved by runFormAction's gate.
    const session = await getSession()

    // LIVE re-read. A deleted/unknown uid throws here → refuse with a message,
    // never a thrown 500. `sessionFromUserRecord` returns null for a DISABLED
    // account, so a target disabled since the row rendered is caught next.
    let target
    try {
      target = sessionFromUserRecord(await adminAuth().getUser(uid))
    } catch {
      return 'Pengguna tidak ditemukan atau telah dihapus'
    }
    if (!target) return 'Akun dinonaktifkan'
    // Refuse self — a no-op that only muddies the trail.
    if (target.uid === session?.uid) {
      return 'Anda tidak dapat meng-impersonate diri sendiri'
    }
    // ASK THE MATRIX, never a list of uids. The gate on `admin:access` refuses
    // anyone who may open /admin — not the same sentence as "anyone who may
    // impersonate". They coincide while ROLES is ['admin','user'] and diverge
    // the moment a project adds a third role — see docs/reference/contracts/impersonation.md.
    if (can(target, 'admin:access')) {
      return 'Akun admin tidak dapat di-impersonate'
    }
  },
})

/**
 * FORM entry (start). Gated on the dedicated `impersonation:start` through
 * `runFormAction` — a semantic capability that names "may act as another user",
 * kept DISTINCT from `admin:access` ("may open the admin console"). The two
 * coincide while `ROLES` is ['admin','user'] and `ROLE_CAPABILITIES.admin` is
 * `[...CAPABILITIES]`, but they are different authorities and a project can split
 * them without touching this gate. Wrapping `runFormAction` is also what keeps
 * this export off the `action-export-wraps-run-action` suppression list: it
 * AUTHORIZES BEFORE the target lookup (the gate runs before `validateStart`).
 *
 * The gate also blocks impersonation-within-impersonation for free, with nothing
 * special-cased: while impersonating, the session IS the target, and the target
 * holds neither `impersonation:start` nor `admin:access` —
 * `resolveImpersonation` guarantees it. `runFormAction` redirects such a session
 * to /403 before a single user record is read.
 *
 * The mint trusts only the target `validateStart` just re-read and cleared; the
 * per-request `resolveImpersonation` re-reads and re-refuses on EVERY subsequent
 * request, so a target disabled/promoted after the mint still loses the overlay.
 */
export async function startImpersonationFormAction(
  _prev: unknown,
  formData: FormData,
) {
  return runFormAction({
    capability: 'impersonation:start',
    formData,
    validate: validateStart,
    redirectTo: '/dashboard',
    run: async (session, values) => {
      const targetUid = values.uid.trim()

      // OPEN THE EVENT BEFORE THE TICKET EXISTS, and let a failure here abort
      // the whole start. This is the same protocol every account mutation
      // follows and it throws for the same reason: an impersonation that began
      // with no durable record is a bypass nobody can account for, and unlike
      // the STOP below, refusing it traps nobody — the admin simply stays
      // themselves and can retry.
      const auditId = await startAccountAudit({
        action: 'impersonation.start',
        operationId: crypto.randomUUID(),
        // The session is still the ADMIN here; the target is who they are about
        // to act as. Both are recorded so the viewer shows one row carrying the
        // whole fact, rather than a start naming one identity and a stop naming
        // the other.
        actorUid: session.uid,
        effectiveActorUid: targetUid,
        targetUid,
        correlationId: newCorrelationId(),
      })

      const cookieStore = await cookies()
      cookieStore.set(
        IMPERSONATION_COOKIE,
        mintTicket(session.uid, targetUid),
        {
          ...SECURE_COOKIE_ATTRIBUTES,
          // Hygiene only. The signed `exp` INSIDE the ticket is the authority —
          // the client owns cookie lifetime, which is why we sign the payload.
          maxAge: IMPERSONATION_TTL_MS / 1000,
        },
      )

      audit(session, 'impersonation.start', targetUid)

      // The ticket is already live, so a settle failure must not become an error
      // page over a log line — it leaves the event visibly `started` instead.
      await settleLifecycleAudit(
        auditId,
        session,
        'impersonation.start',
        targetUid,
      )
    },
  })
}

/**
 * FORM entry (stop). Gated on THE TICKET, never on a capability.
 *
 * This is not an oversight and must not be "fixed": while impersonating, the
 * session is the target and holds none of the admin's capabilities, so an
 * admin-gated exit would be a locked door from the inside — a one-way trip until
 * the ticket expires. The signed ticket already proves an admin started this,
 * which is exactly the authority needed to end it. `runFormAction` is not used
 * here for the same reason: its contract is a capability gate.
 *
 * The suppression below is the ONLY one in this repo; the rule's own
 * header carries the bar a second must clear.
 * The rule's claim — "an unwrapped export skips the auth gate" — is FALSE of this
 * export: it authenticates (`getSession` → `/login`) and authorizes (a valid
 * signed ticket = proof an admin started this). The rule checks the MECHANISM
 * (wraps `runAction`) as a proxy for the PROPERTY (is gated); this is the one
 * export where the two come apart.
 *
 * Widening `runFormAction` to take an arbitrary guard was rejected as WORSE: it
 * would keep every export "wrapped" and turn the gate green, but `guard: () =>
 * true` cannot be grepped and reads as compliance. Prefer the visible hole.
 *
 * ⚠️ The suppression must sit on the line IMMEDIATELY above the export —
 * ast-grep matches by adjacency, so a comment block wedged between the two
 * silently does nothing and the gate stays red. Falsified both ways: adjacent →
 * green; and an unwrapped export added elsewhere in this file still fires.
 *
 * ⚠️ THE CLEAR IS UNCONDITIONAL, AND NO AUDIT MAY STAND IN FRONT OF IT.
 * Everything before `cookieStore.delete` is wrapped so it cannot throw, because
 * a Firestore outage that reached this line would otherwise leave the admin
 * inside the impersonation with the exit button producing an error page — a
 * deliberate auth bypass with no way out but the 15-minute TTL. An audit trail
 * is worth a great deal and it is not worth that, so the durable write is
 * best-effort here and ONLY here: it falls back to a bounded stdout line and
 * leaves the durable event visibly incomplete for a human to reconcile. That
 * asymmetry against `startImpersonationFormAction` (which refuses on the same
 * failure) is the whole design, not an inconsistency.
 */
// ast-grep-ignore: action-export-wraps-run-action
export async function stopImpersonationFormAction() {
  const session = await getSession()
  if (!session) redirect('/login')

  const cookieStore = await cookies()

  // AN EXPLICIT STOP CLEARS THE OVERLAY COOKIE UNCONDITIONALLY, whatever state
  // resolution produced — the same "STOP always clears" rule the audit asymmetry
  // below states, extended from "whatever the audit does" to "whatever the
  // session state is". A session with NO impersonator reached here with an
  // absent, expired, tampered, or WRONG-ACTOR ticket — the last one bound to a
  // DIFFERENT admin, which `verifyTicket` refuses now but would resume the moment
  // that admin's session returned to this browser. There is nothing to audit for
  // such a session (no impersonation was in effect for it), but the cookie must
  // still go, so a stop never leaves a resumable ticket behind.
  if (!session.impersonator) {
    cookieStore.delete(IMPERSONATION_COOKIE)
    redirect('/dashboard')
  }

  // AUDIT BEFORE THE CLEAR. After the cookie is gone the session resolves to the
  // admin again and the line loses the very fact it exists to record. This goes
  // through the ordinary audit() seam with nothing special-cased: the ticket is
  // still live, so the Session it is handed is the target's, carrying the actor.
  audit(session, 'impersonation.stop', session.uid)

  // The durable half. `session.uid` IS the target while the ticket is live and
  // `session.impersonator.uid` is the real admin — the one moment both are
  // resolvable from one Session, which is why this cannot be moved after the
  // clear. A `null` id means the event could not even be opened; the fallback
  // line has already been emitted and there is nothing left to settle.
  let auditId: string | null = null
  try {
    auditId = await startAccountAudit({
      action: 'impersonation.stop',
      operationId: crypto.randomUUID(),
      actorUid: session.impersonator.uid,
      effectiveActorUid: session.uid,
      targetUid: session.uid,
      correlationId: newCorrelationId(),
    })
  } catch (error) {
    audit(session, 'impersonation.stop', session.uid, {
      durableAudit: 'unopened',
      failureCode: auditFailureCode(error),
    })
  }

  // ─── THE LINE NOTHING MAY BE PUT IN FRONT OF ───────────────────────────────
  cookieStore.delete(IMPERSONATION_COOKIE)

  if (auditId) {
    await settleLifecycleAudit(
      auditId,
      session,
      'impersonation.stop',
      session.uid,
    )
  }

  redirect('/admin')
}
