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
  it('emits one structured line naming the subject', () => {
    const line = emitted(base, 'account.create', 'account-1')

    expect(line.level).toBe('info')
    expect(line.msg).toBe('[audit] action')
    expect(line.type).toBe('audit')
    expect(line.action).toBe('account.create')
    expect(line.target).toBe('account-1')
    expect(line.uid).toBe('target-uid')
  })

  it('does not let metadata replace the audit identity', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    audit(base, 'account.create', 'account-1', {
      action: 'forged',
      uid: 'forged',
    })

    const line = JSON.parse(spy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >
    expect(line.action).toBe('account.create')
    expect(line.uid).toBe('target-uid')
  })
})
