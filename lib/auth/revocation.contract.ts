/**
 * The session-revocation MARKER contract: where it lives, what it holds, how a
 * cutoff is computed, and what it means for a token.
 *
 * Firebase's own `revokeRefreshTokens` is not enough on its own. A signed-in
 * browser holds an ID token that stays valid until it refreshes (up to an hour),
 * and a direct Firestore listener keeps streaming on that token the whole time.
 * So revocation needs a value the SERVER boundary, FIRESTORE RULES, and the
 * CLIENT watcher can all compare against — three enforcement points that must
 * never disagree about the arithmetic. That is why the formula lives in this
 * pure module rather than at each site: Rules cannot import TypeScript, but they
 * can implement one written rule, and the two TypeScript readers provably share
 * this one.
 *
 * `firestore.rules` implements the same comparison as
 * `request.auth.token.auth_time >= revokedAfterEpoch`. Keep the two in step: a
 * change here is a change there.
 */
import * as z from 'zod'

/** The collection holding one marker document per uid, keyed BY uid. */
export const AUTH_SESSIONS_COLLECTION = 'authSessions'

/**
 * The marker document. Exactly ONE field, deliberately: a second timestamp
 * representation (a Firestore `Timestamp` beside the epoch, say) would be a
 * parallel authority that Rules and the client could read differently.
 *
 * Integer UTC Unix SECONDS, because that is the unit `auth_time` arrives in on a
 * decoded Firebase token and the only unit Rules can compare it against without
 * conversion.
 */
export const AuthSessionSchema = z.object({
  revokedAfterEpoch: z.number().int().nonnegative(),
})
export type AuthSession = z.infer<typeof AuthSessionSchema>

/**
 * The field name, for Rules/watcher prose and for any caller that must name it
 * dynamically. `satisfies` makes it a COMPILE ERROR if the schema key is ever
 * renamed without renaming this — the constant cannot drift from the shape.
 */
export const REVOKED_AFTER_EPOCH_FIELD =
  'revokedAfterEpoch' satisfies keyof AuthSession

/**
 * The cutoff to write when revoking NOW: `floor(now / 1000) + 1`.
 *
 * The `+ 1` is the whole point and is not a safety margin. `auth_time` is
 * truncated to whole seconds, and the comparison below admits equality — so a
 * token minted during the CURRENT second carries the same `auth_time` as a bare
 * `floor(now / 1000)` cutoff and would survive the revocation that was supposed
 * to kill it. Rounding up to the next whole second closes that one-second window.
 *
 * `Math.ceil` is NOT equivalent: at an exact second boundary it returns the
 * current second, reopening the window it was meant to close.
 *
 * Takes `nowMs` rather than reading the clock so the formula is testable and the
 * caller owns the one impure step.
 */
export function revocationCutoff(nowMs: number): number {
  return Math.floor(nowMs / 1000) + 1
}

/**
 * Whether a token minted at `authTimeSeconds` is revoked by `marker`.
 *
 * A marker of `null` means NO marker document exists, which is NOT revocation —
 * every account predates its first revocation, so an absent marker must read as
 * "never revoked" or the feature would sign out the entire user base on deploy.
 * A marker that exists but is unreadable is a different case and is handled by
 * the caller (fail closed), never here.
 *
 * Equality ALLOWS: a token whose `auth_time` equals the cutoff was minted at or
 * after it, and `revocationCutoff` already pushed the cutoff past the current
 * second so this can only be a genuinely newer login.
 */
export function isTokenRevoked(
  authTimeSeconds: number,
  marker: number | null,
): boolean {
  if (marker === null) return false
  return authTimeSeconds < marker
}
