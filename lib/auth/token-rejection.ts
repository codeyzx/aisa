import { firebaseErrorCode } from '@/lib/firebase/error-code'

/**
 * The fail-safe rule that decides, when a Firebase token verification THROWS,
 * whether the token is DEFINITIVELY invalid or the provider was merely
 * unreachable. Kept pure and apart from the session/action code so the whole
 * classification is unit-testable without minting a real Firebase token.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * `verifySessionCookie(token, true)` and `verifyIdToken(token, true)` make a
 * network round trip (the `checkRevoked` flag forces one; see the call sites).
 * That trip can fail two ways that must NOT be collapsed into one:
 *
 *  - the token itself is bad — expired, revoked, malformed, or its subject is
 *    gone. That is a DEFINITIVE answer: sign in again.
 *  - the provider could not be reached — `auth/internal-error`, a network
 *    failure, a gRPC `UNAVAILABLE`/`DEADLINE_EXCEEDED`, a quota rejection. That
 *    is NOT an answer about the token at all.
 *
 * A bare `catch { return null }` treats both as "invalid", so a Google-side
 * outage signs a validly-authenticated user out mid-session. This predicate is
 * the same shape as `isDefinitiveLookupMiss` in `account.repo.ts`: an allow-list
 * of definitive codes, everything else treated as an outage — fail-safe by
 * default, because a code this list has not seen must not be read as "invalid".
 *
 * ── THE SAFE DIRECTION IS THE OPPOSITE OF IMPERSONATION'S ────────────────────
 * The impersonation overlay (`session.ts`) also distinguishes definitive from
 * outage, but there an outage fails CLOSED — it blocks, because resuming would
 * silently restore admin authority. Token verification is the inverse: an outage
 * must fail toward PRESERVING the existing session (throw, so the caller surfaces
 * "temporarily unavailable" rather than destroying the cookie), because the
 * fail-unsafe direction here is signing a valid user out. Same underlying rule —
 * never treat "couldn't reach the provider" as a verdict — opposite safe
 * direction by boundary.
 */

/**
 * The DEFINITIVE token-rejection codes. Grounded in the taxonomy
 * `lib/api/errors.normalize.ts` already maintains: every entry here is one the
 * normalizer answers as a caller fault (`UNAUTHENTICATED` / `INVALID_ARGUMENT` /
 * the token-subject `NOT_FOUND`), never as `INTERNAL` / `UNAVAILABLE` /
 * `RESOURCE_EXHAUSTED`. Keep the two in step: a code that means "sign in again"
 * belongs here; a code that means "try again later" must not.
 */
const DEFINITIVE_TOKEN_REJECTION_CODES: ReadonlySet<string> = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/invalid-session-cookie',
  'auth/invalid-user-token',
  // The account behind an otherwise-valid token is disabled or gone — definitive
  // for the token path (the lookup-vs-token overload of `user-not-found` resolves
  // to "invalid credential" here, not "no such record").
  'auth/user-disabled',
  'auth/user-not-found',
  // A malformed token argument — the SDK could not even parse it as a token.
  'auth/argument-error',
])

/**
 * Whether a thrown token-verification failure is a DEFINITIVE invalid-credential
 * answer (`true` → sign in again) rather than a provider outage (`false` → do NOT
 * sign the user out; surface "try again"). Anything without a recognised string
 * code — a network error, a numeric gRPC status, a bare `Error`, `null` — is an
 * outage by default.
 */
export function isDefinitiveTokenRejection(error: unknown): boolean {
  const code = firebaseErrorCode(error)
  return code !== undefined && DEFINITIVE_TOKEN_REJECTION_CODES.has(code)
}
