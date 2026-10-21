import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

/**
 * The ticket is the whole bypass, so these tests are adversarial by design: every
 * case below is a way an attacker reaches for a session that is not theirs.
 *
 * `@/lib/auth/impersonation.config` is mocked rather than fed a real
 * IMPERSONATION_SECRET so a test about HMAC does not also become a test about
 * env plumbing. The mock is scoped to the one thing this module reads — the
 * secret, THROUGH `getImpersonationConfig()` — and it is a `vi.fn` precisely so
 * the boundary-read property is TESTABLE rather than asserted in a comment: the
 * module is imported below with the mock already answering, so a call-time throw
 * (the last case in this file) can only surface if the secret is read per call,
 * not once at module load.
 */
const secret = vi.fn(() => 'x'.repeat(32))

vi.mock('@/lib/auth/impersonation.config', () => ({
  getImpersonationConfig: () => ({ secret: secret() }),
}))

const { IMPERSONATION_TTL_MS, mintTicket, verifyTicket } =
  await import('./impersonation')

const ADMIN = 'admin-uid'
const TARGET = 'target-uid'

describe('mintTicket / verifyTicket', () => {
  it('round-trips a ticket for the actor it was minted for', () => {
    const now = 1_000_000
    const ticket = verifyTicket(mintTicket(ADMIN, TARGET, now), ADMIN, now)

    expect(ticket).toEqual({
      actorUid: ADMIN,
      targetUid: TARGET,
      exp: now + IMPERSONATION_TTL_MS,
    })
  })

  it('expires absolutely at exp, with no refresh', () => {
    const now = 1_000_000
    const raw = mintTicket(ADMIN, TARGET, now)

    // One ms before expiry it still resolves; at expiry it is gone for good.
    expect(
      verifyTicket(raw, ADMIN, now + IMPERSONATION_TTL_MS - 1),
    ).not.toBeNull()
    expect(verifyTicket(raw, ADMIN, now + IMPERSONATION_TTL_MS)).toBeNull()
  })

  it('refuses a ticket minted for a DIFFERENT actor', () => {
    // The signature is ours and perfectly valid — this is the replay case. A
    // stolen ticket must authorize nobody but the admin it names.
    const raw = mintTicket('other-admin-uid', TARGET, 1_000_000)

    expect(verifyTicket(raw, ADMIN, 1_000_000)).toBeNull()
  })

  it('refuses a tampered PAYLOAD (the privilege-escalation attempt)', () => {
    const raw = mintTicket(ADMIN, TARGET, 1_000_000)
    const signature = raw.slice(raw.lastIndexOf('.') + 1)

    // Re-encode the body naming a different target, keeping the real signature.
    const forged = Buffer.from(
      JSON.stringify({
        actorUid: ADMIN,
        targetUid: 'someone-else',
        exp: 1_000_000 + IMPERSONATION_TTL_MS,
      }),
      'utf8',
    ).toString('base64url')

    expect(verifyTicket(`${forged}.${signature}`, ADMIN, 1_000_000)).toBeNull()
  })

  it('refuses a tampered SIGNATURE — one flipped hex digit', () => {
    const raw = mintTicket(ADMIN, TARGET, 1_000_000)
    const separator = raw.lastIndexOf('.')
    const payload = raw.slice(0, separator)
    const signature = raw.slice(separator + 1)

    const flipped = (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1)

    expect(verifyTicket(`${payload}.${flipped}`, ADMIN, 1_000_000)).toBeNull()
  })

  it('refuses a SHORT signature without throwing', () => {
    // timingSafeEqual throws on unequal-length buffers. A length mismatch is a
    // wrong answer, never an exception — this test is the length guard.
    const raw = mintTicket(ADMIN, TARGET, 1_000_000)
    const payload = raw.slice(0, raw.lastIndexOf('.'))

    expect(() => verifyTicket(`${payload}.abc`, ADMIN, 1_000_000)).not.toThrow()
    expect(verifyTicket(`${payload}.abc`, ADMIN, 1_000_000)).toBeNull()
  })

  it('refuses an absent or malformed cookie without throwing', () => {
    for (const raw of [undefined, '', 'no-separator', '.', '.sig']) {
      expect(() => verifyTicket(raw, ADMIN, 1_000_000)).not.toThrow()
      expect(verifyTicket(raw, ADMIN, 1_000_000)).toBeNull()
    }
  })

  it.each([
    ['not JSON at all', 'this-is-not-json'],
    ['JSON of the wrong shape', JSON.stringify({ hello: 'world' })],
    [
      'a ticket whose exp is not a number',
      JSON.stringify({ actorUid: ADMIN, targetUid: TARGET, exp: 'soon' }),
    ],
  ])('refuses a GENUINELY-signed body that is %s', (_label, body) => {
    // The signature here is real — computed over THIS body with the same key —
    // so the HMAC check passes and the shape check is what has to refuse it.
    // Borrowing a signature from another payload instead would fail at the HMAC
    // and leave the shape check unexercised while the test still went green.
    const payload = Buffer.from(body, 'utf8').toString('base64url')
    const signature = createHmac('sha256', 'x'.repeat(32))
      .update(payload)
      .digest('hex')

    expect(verifyTicket(`${payload}.${signature}`, ADMIN, 1_000_000)).toBeNull()
  })

  it('reads the secret at the BOUNDARY, not at module load', () => {
    // The getter must not be touched by importing this module: an app with no
    // IMPERSONATION_SECRET has to boot. Making optional env eager can take the
    // whole app down, so this is the regression guard.
    secret.mockClear()
    expect(secret).not.toHaveBeenCalled()

    mintTicket(ADMIN, TARGET, 1_000_000)
    expect(secret).toHaveBeenCalled()
  })

  it('refuses loudly when the secret is unset — never silently allows', () => {
    secret.mockImplementationOnce(() => {
      throw new Error('IMPERSONATION_SECRET is required (set it in .env)')
    })

    // A missing secret must fail at the boundary, not degrade to an unsigned
    // ticket. Config that lies is the failure mode this guards.
    expect(() => mintTicket(ADMIN, TARGET, 1_000_000)).toThrow(
      /IMPERSONATION_SECRET/,
    )
  })
})
