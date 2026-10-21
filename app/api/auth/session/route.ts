import { cookies } from 'next/headers'
import * as z from 'zod'

import { apiFail, apiFailFrom, apiOk } from '@/lib/api/response'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'
import { SECURE_COOKIE_ATTRIBUTES } from '@/lib/auth/cookie-options'
import { IMPERSONATION_COOKIE } from '@/lib/auth/impersonation'
import { isDefinitiveTokenRejection } from '@/lib/auth/token-rejection'
import { adminAuth } from '@/lib/firebase/admin-auth'
import { rateLimit } from '@/lib/http'
import { isSameOrigin } from '@/lib/http/origin'

/**
 * Session endpoint. POST exchanges a Firebase ID token (minted by the client SDK
 * after sign-in) for an httpOnly session cookie; DELETE clears it (logout).
 * Real per-request authorization lives in the server DAL (getSession), not here.
 *
 * Answers the envelope (docs/reference/contracts/http-api.md). This is a route handler rather
 * than a server action because the caller acts on the status line: a 401 means
 * "your token is dead, sign in again" and a client cannot read that off an
 * `ActionResult`.
 */

const SessionRequestSchema = z.object({ idToken: z.string().min(1) })

/**
 * CSRF guard. Both handlers here mutate the auth cookie, so a cross-site caller
 * must be rejected — otherwise an attacker page can POST its own ID token and log
 * a victim into the ATTACKER's account (login CSRF). A browser sends `Origin` on
 * every cross-origin state-changing request; when present it must match THE HOST
 * THE BROWSER ADDRESSED — `X-Forwarded-Host` if a proxy set one, else `Host`.
 *
 * NOT the request URL's origin. That is what this comment used to say and it was
 * wrong in the way that matters: in the standalone server that origin reflects
 * the `HOSTNAME` the server was started with, which the image sets to `0.0.0.0`,
 * so the only `Origin` it accepted was one no browser sends. `lib/http/origin.ts`
 * owns the mechanism and the argument for why comparing to the host is not
 * weaker; `docs/reference/contracts/http-api.md` owns the deployer contract.
 *
 * (`sameSite=lax` protects the cookie the browser SENDS, not the request that
 * sets or clears one.) Absent `Origin` (rare, same-origin) is allowed — a real
 * cross-site attack always carries it.
 */
/**
 * A COST GUARD on `createSessionCookie`, per uid. NOT a credential guard — see
 * POST's docblock: this route never sees a password.
 *
 * A module constant beside its call site, passed to `rateLimit` as an argument
 * (zero env keys for a rate-limit budget), and reachable from a test — a
 * load-bearing constant a test cannot reach is unfalsifiable.
 *
 * 10/min is GENEROUS, not tight. A legitimate user mints ONCE per sign-in
 * (lib/auth/client.ts:establishSession is the only caller — no onIdTokenChanged,
 * no re-mint loop), so 10 leaves room for retries, tabs and devices while
 * capping a token replayer at 10 Google round trips a minute.
 */
const SESSION_MINT_BUDGET = { limit: 10, windowMs: 60_000 }

/**
 * Verify the ID token, mint a session cookie, and set it httpOnly.
 *
 * NOT a login endpoint, and the distinction is load-bearing: the password never
 * reaches this origin. `app/login/login-form.tsx` calls
 * `signInWithEmailAndPassword` — browser straight to Google — and only then hands
 * us the already-verified `idToken`. So a wrong password sends this route ZERO
 * requests, and credential stuffing never transits it (Firebase throttles that
 * itself; `lib/api/errors.normalize.ts` maps `auth/too-many-requests` -> RESOURCE_EXHAUSTED).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiFail(request, 'PERMISSION_DENIED')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    // A malformed JSON body is the caller's mistake, not an incident.
    return apiFail(request, 'INVALID_ARGUMENT')
  }

  const parsed = SessionRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(request, 'INVALID_ARGUMENT', z.treeifyError(parsed.error))
  }

  // Verify before minting so a forged/expired token never yields a cookie.
  //
  // Split from the mint below on purpose: an expired, forged, or malformed token
  // is this route's EXPECTED failure, not an unhandled throw. `apiFail` answers
  // 401 without `apiFailFrom`'s error log, so a bot replaying junk cannot fill
  // the log with incidents — and the Firebase message never reaches `details`.
  //
  // Only a DEFINITIVE rejection takes that lane. A verification that failed
  // because the provider was unreachable is NOT a bad credential, and answering
  // 401 would tell a caller holding a perfectly good token to go get another one
  // from the service that is down. That case goes to `apiFailFrom`, which lets
  // the normalizer answer UNAVAILABLE/INTERNAL/RESOURCE_EXHAUSTED — and IS worth
  // an incident log, because unlike replayed junk it means something is broken.
  let uid: string
  try {
    uid = (await adminAuth().verifyIdToken(parsed.data.idToken)).uid
  } catch (error) {
    if (isDefinitiveTokenRejection(error)) {
      return apiFail(request, 'UNAUTHENTICATED')
    }
    return apiFailFrom(request, error)
  }

  // Metered HERE: after verifyIdToken, before createSessionCookie — and counting
  // SUCCESSFUL MINTS, keyed on the uid inside the token we just verified.
  //
  // The ordering is the whole design, and it inverts the obvious guess. Verified
  // in node_modules/firebase-admin: `verifyIdToken(idToken, checkRevoked=false)`
  // only makes a network call when `checkRevoked || isEmulator` — this route
  // passes neither, so verification is a LOCAL JWT check against certs cached
  // ~6h. The ONLY Google round trip is createSessionCookie, and it runs only on
  // the success path.
  //
  // So a failure-only counter would meter the FREE, local path and leave the
  // only PAID call unbounded: one attacker holding one valid token could replay
  // it and burn unlimited createSessionCookie quota while paying zero slots.
  // Forged tokens die free at the local verify above and are deliberately NOT
  // metered.
  const limit = await rateLimit(`session:${uid}`, SESSION_MINT_BUDGET)
  if (!limit.ok) {
    return apiFail(request, 'RESOURCE_EXHAUSTED', {
      retryAfter: limit.retryAfter,
    })
  }

  try {
    const sessionCookie = await adminAuth().createSessionCookie(
      parsed.data.idToken,
      { expiresIn: SESSION_MAX_AGE_MS },
    )
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, sessionCookie, {
      ...SECURE_COOKIE_ATTRIBUTES,
      maxAge: SESSION_MAX_AGE_MS / 1000,
    })
    return apiOk(request, null)
  } catch (error) {
    return apiFailFrom(request, error)
  }
}

/**
 * Clear the session cookie AND any impersonation ticket (clear-only — no
 * refresh-token revocation, so logout stays cheap and the short cookie window
 * bounds a leaked cookie).
 *
 * Clearing the impersonation ticket is load-bearing, not tidy-up: it is bound to
 * the ADMIN's uid and lives ~15 min, so leaving it would let the admin's next
 * sign-in within that window silently RESUME the overlay — signing out would not
 * actually end impersonation.
 *
 * Takes `request` only because every `lib/api/response.ts` helper resolves the
 * cid from it — the envelope's id must span this hop like any other.
 *
 * DELIBERATELY NOT RATE-LIMITED, and this is not an omission for someone to
 * "complete" later: DELETE is cookie-authed, mints nothing, and
 * `cookies().delete` costs nothing. There is no upstream quota to guard, so a
 * limiter here could only ever stop someone from signing out.
 */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return apiFail(request, 'PERMISSION_DENIED')

  const cookieStore = await cookies()
  cookieStore.delete({ name: SESSION_COOKIE, path: '/' })
  cookieStore.delete(IMPERSONATION_COOKIE)
  return apiOk(request, null)
}
