import 'server-only'

/**
 * Admin impersonation tickets — HMAC-signed and audited.
 *
 * An impersonated session is a NEW ANSWER FROM THE EXISTING BOUNDARY, not a new
 * boundary. The admin's real session cookie is untouched and stays the only root
 * of trust: `getSession()` verifies it exactly as it always did, and only then
 * asks whether a ticket signed by us names that verified uid as its actor. A
 * second function resolving identity beside `getSession()` would leave
 * `runAction` / `requireCapability` all still seeing the admin —
 * an impersonation that typechecks and enforces nothing.
 *
 * The ticket authorizes WHO, never WHAT. It carries a uid, never a role: a
 * signed role is not forgeable but it is STALE — demote the target mid-session
 * and the ticket keeps handing out the old role, with our own signature on it.
 * Capability resolution stays in rbac.ts, off the live claim.
 *
 * `IMPERSONATION_COOKIE` and the TTL live HERE, not in `lib/auth/constants.ts`.
 * That file's own doc comment scopes it to what "the server DAL and the edge
 * proxy both agree" on — the edge-safe surface. This cookie is read in exactly
 * one place, server-side, and `proxy.ts` must not care: impersonation REQUIRES a
 * real session cookie, so the optimistic gate is already correct without knowing
 * this cookie exists. Same-scope config in its only reader is not a local
 * variant of `constants.ts`; it is a different scope.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import { getImpersonationConfig } from './impersonation.config'

/** Name of the httpOnly impersonation overlay cookie. */
export const IMPERSONATION_COOKIE = 'impersonation'

/**
 * Ticket lifetime — 15 minutes, absolute, no refresh.
 *
 * The number carries its argument, in `SESSION_MAX_AGE_MS`'s voice: this ticket
 * is STATELESS, so its TTL *is* its revocation — there is no server record to
 * tear up, and a live ticket cannot be killed before `exp`. 15 minutes is the
 * real unit of "look at what this user sees". A longer window (say a support
 * engineer's whole shift) is a choice an app can make; this is a boilerplate,
 * and impersonation is a deliberate auth bypass, so the fail-closed default
 * wins.
 *
 * Refreshing on activity is deliberately NOT offered: it converts a bounded
 * bypass into an unbounded one, silently, and nobody would notice.
 */
export const IMPERSONATION_TTL_MS = 15 * 60 * 1000

/** The signed payload. `actorUid` binds the ticket to ONE admin's session. */
export interface ImpersonationTicket {
  /** The admin who started this. The trail's answer to "who really did it". */
  actorUid: string
  /** The user being impersonated. */
  targetUid: string
  /** Absolute expiry, epoch ms. THE authority on lifetime — see verify(). */
  exp: number
}

function sign(payload: string): string {
  // Read the secret through the config function at the BOUNDARY, never at module
  // top level: a module-top read runs at import time, before the boot check's
  // single controlled trigger, and would break importing this module from a test
  // that configures no secret. The requirement itself is enforced at boot —
  // the capability registry (`lib/env/registry.ts`) validates it there — so a
  // build that ships impersonation needs the secret to start; deleting the
  // feature (and its registry line) removes the requirement.
  return createHmac('sha256', getImpersonationConfig().secret)
    .update(payload)
    .digest('hex')
}

/** Mint a signed ticket valid for `IMPERSONATION_TTL_MS` from `now`. */
export function mintTicket(
  actorUid: string,
  targetUid: string,
  now: number = Date.now(),
): string {
  const ticket: ImpersonationTicket = {
    actorUid,
    targetUid,
    exp: now + IMPERSONATION_TTL_MS,
  }
  const payload = Buffer.from(JSON.stringify(ticket), 'utf8').toString(
    'base64url',
  )
  return `${payload}.${sign(payload)}`
}

function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  // timingSafeEqual THROWS on unequal-length buffers — a length mismatch is a
  // wrong answer, never an exception. Guard first, then compare in constant
  // time: `===` on two digests is the one line that turns this module into a
  // comparison an attacker can time.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Verify `raw` and return the ticket it carries, or null.
 *
 * Null for every failure mode — absent, malformed, tampered, expired, or signed
 * for a different actor. Callers MUST treat null as "no impersonation", never as
 * "no session": a bad ticket must not be able to sign the admin out.
 *
 * `expectedActorUid` is the uid of the ALREADY-VERIFIED session cookie. Binding
 * the ticket to it is what stops a leaked ticket from being replayed by anyone
 * else who gets hold of it — on its own the ticket authorizes nobody.
 */
export function verifyTicket(
  raw: string | undefined,
  expectedActorUid: string,
  now: number = Date.now(),
): ImpersonationTicket | null {
  if (!raw) return null

  const separator = raw.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = raw.slice(0, separator)
  const signature = raw.slice(separator + 1)

  if (!digestsMatch(signature, sign(payload))) return null

  let ticket: ImpersonationTicket
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    // Signature verified but the body is not JSON: refuse rather than throw.
    return null
  }

  if (
    typeof ticket.actorUid !== 'string' ||
    typeof ticket.targetUid !== 'string' ||
    typeof ticket.exp !== 'number'
  ) {
    return null
  }

  // The `exp` INSIDE the signed payload is the authority — never the cookie's
  // maxAge. The client owns cookie lifetime; we sign the payload precisely so we
  // do not have to trust it.
  if (ticket.exp <= now) return null

  // A ticket is valid only for the admin it was minted for.
  if (ticket.actorUid !== expectedActorUid) return null

  return ticket
}
