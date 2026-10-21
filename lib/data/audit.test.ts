import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Session } from '@/lib/auth/session'
import { signedInAs } from '@/test/builders/session'
import { audit } from './audit'

const base = signedInAs('user', {
  uid: 'target-uid',
  email: 'user@aixel.test',
})

/** Capture the one JSON line the seam emits, parsed. */
function emitted(session: Session, ...rest: [string, string?]) {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  audit(session, ...rest)
  expect(spy).toHaveBeenCalledOnce()
  return JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('audit', () => {
  it('omits actor entirely on an ordinary session', () => {
    const line = emitted(base, 'asset.create', 'asset-1')

    expect(line.level).toBe('info')
    expect(line.msg).toBe('[audit] action')
    expect(line.type).toBe('audit')
    expect(line.action).toBe('asset.create')
    expect(line.target).toBe('asset-1')
    expect(line.uid).toBe('target-uid')
    expect(line).not.toHaveProperty('actor')
  })

  it('names the impersonator as actor while the target stays the subject', () => {
    const line = emitted(
      {
        ...base,
        impersonator: { uid: 'admin-uid', email: 'admin@aixel.test' },
      },
      'impersonation.stop',
      'target-uid',
    )

    expect(line.uid).toBe('target-uid')
    expect(line.actor).toBe('admin-uid')
  })

  it('does not let metadata replace the audit identity — including actor', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    audit(base, 'asset.create', 'asset-1', {
      action: 'forged',
      uid: 'forged',
      // The gap this pins: a conditionally-set `actor` lets a forged
      // `meta.actor` survive into the audit line on a NON-impersonated session.
      actor: 'forged',
    })

    const line = JSON.parse(spy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >
    expect(line.action).toBe('asset.create')
    expect(line.uid).toBe('target-uid')
    expect(line).not.toHaveProperty('actor')
  })
})
