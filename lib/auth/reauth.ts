/**
 * The freshness rule for a reauthentication proof, kept pure and apart from the
 * `'use server'` password-transition action so the whole boundary — too old, in
 * the future, or malformed — is unit-testable without minting a real Firebase ID
 * token. `lib/actions/password.action.ts` is the one caller; it passes the
 * decoded token's `auth_time` and the current time, and gets a yes/no.
 *
 * This is the check that makes "reauthenticate" MEAN something. Without it the
 * browser could hand over any ID token it still holds — including one minted at
 * the original sign-in, with the temporary password — and the flow would prove
 * nothing beyond what the session cookie already proved.
 */

/**
 * How old the reauthentication proof may be. Five minutes is long enough for
 * someone to type a password, read a validation message, and fix it; short
 * enough that a token captured from a proxy log or a crashed tab is dead before
 * it is useful.
 */
export const REAUTH_MAX_AGE_SECONDS = 5 * 60

/**
 * How far in the FUTURE a reauthentication timestamp may sit before it is refused
 * as malformed rather than fresh. A proof cannot honestly have been minted after
 * now, so a negative age is nonsense — but the app-server clock and Firebase's may
 * differ by a second or two, and being too strict on the mandatory-password path
 * would lock a legitimate user out of the one screen that clears their gate. This
 * bounds the honest skew; anything beyond it (a forged or wildly wrong `auth_time`)
 * fails closed. `verifyIdToken` already rejects a future `iat`, and `auth_time <=
 * iat`, so this is defence in depth, not the primary bound.
 */
export const REAUTH_MAX_SKEW_SECONDS = 60

/**
 * Whether a reauthentication that happened at `authTimeSeconds` (seconds since the
 * epoch, straight off the decoded token's `auth_time`) is fresh enough to trust at
 * `nowMs`. Every non-fresh case fails CLOSED:
 *
 *  - a missing / unparseable `auth_time` makes the age non-finite → false;
 *  - a proof dated in the future beyond `REAUTH_MAX_SKEW_SECONDS` is malformed →
 *    false (without this a negative age would slip past the max-age bound and read
 *    as maximally fresh);
 *  - a proof older than `REAUTH_MAX_AGE_SECONDS` is stale → false.
 */
export function isReauthenticationFresh(
  authTimeSeconds: number,
  nowMs: number,
): boolean {
  const ageSeconds = Math.floor(nowMs / 1000) - authTimeSeconds
  if (!Number.isFinite(ageSeconds)) return false
  if (ageSeconds < -REAUTH_MAX_SKEW_SECONDS) return false
  if (ageSeconds > REAUTH_MAX_AGE_SECONDS) return false
  return true
}
