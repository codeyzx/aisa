import 'server-only'

/**
 * The ONE temporary-password generator: admin account creation and admin
 * password reset both mint their credential here and nowhere else.
 *
 * ── WHY A CSPRNG, STATED AS THE ATTACK ───────────────────────────────────────
 * `Math.random()` is a seeded, non-cryptographic PRNG (V8 uses xorshift128+).
 * Its internal state is recoverable from a handful of outputs, so an attacker
 * who can observe ONE generated password — their own, from a self-service signup
 * or an account an admin created for them — can predict the next ones. That is
 * not a theoretical weakening: it turns "an admin created an account for someone
 * else" into "I can sign in as them". `node:crypto`'s `randomInt` draws from the
 * OS CSPRNG, whose output carries no recoverable state.
 *
 * `randomInt(max)` also rejection-samples internally, which is the second half of
 * the requirement. The obvious `randomBytes(n)[i] % alphabet.length` is BIASED
 * whenever 256 is not a multiple of the alphabet size (it is not, for 57): the
 * first `256 % 57 = 28` characters come up measurably more often, shaving
 * entropy off every position. Do not "simplify" this to a modulo.
 *
 * ── WHY THIS ALPHABET ────────────────────────────────────────────────────────
 * A temporary password is TRANSCRIBED. It is read off a screen once and typed
 * into a login form, often from a support call or a chat message. `0`/`O`,
 * `1`/`l`/`I` are the pairs that fail that transcription in most UI fonts, so
 * they are excluded — every excluded character trades a sliver of entropy for a
 * failed sign-in that never happens. Punctuation is excluded for the same reason
 * (it invites a copy/paste that mangles on a locale keyboard), not for safety.
 *
 * ── WHY THIS LENGTH ──────────────────────────────────────────────────────────
 * 57 characters is ~5.83 bits each, so 20 characters is ~116 bits — far past
 * anything an online guessing attack against Firebase Auth can reach, and past
 * offline brute force too. The length is what buys back the entropy the readable
 * alphabet gave away; shortening it is the change that would actually matter.
 *
 * ── WHAT THIS MODULE DOES NOT DO ─────────────────────────────────────────────
 * It does not store, log, hash, or transport the value. The password it returns
 * is revealed exactly once, in a server-action RESULT, and must never reach an
 * audit event, a log line, or a URL. See `lib/actions/account.action.ts`.
 */
import { randomInt } from 'node:crypto'

/**
 * The transcription-safe character set. Exported so a test can assert the
 * generator's output is drawn from exactly this set rather than restating the
 * string — a second copy would go stale green the day a character is added.
 *
 * Deliberately missing: `0` `O` `1` `l` `I`, and all punctuation.
 */
export const TEMPORARY_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** Characters per generated password. See the header for why 20 and not less. */
export const TEMPORARY_PASSWORD_LENGTH = 20

/**
 * A fresh temporary password. The only impure step in this module — every
 * character is an independent CSPRNG draw, so there is no seed, no counter, and
 * no relationship between two calls.
 */
export function generateTemporaryPassword(): string {
  let password = ''
  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password += TEMPORARY_PASSWORD_ALPHABET.charAt(
      randomInt(TEMPORARY_PASSWORD_ALPHABET.length),
    )
  }
  return password
}
