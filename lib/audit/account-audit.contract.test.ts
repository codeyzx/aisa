/**
 * The audit contract's job is to make a leak IMPOSSIBLE rather than unlikely, so
 * the tests that matter are the rejections: a secret, a raw error, or a request
 * body must not be storable, and the schema — not a reviewer — is what stops it.
 */
import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_AUDIT_ACTION_LABEL,
  ACCOUNT_AUDIT_ACTIONS,
  ACCOUNT_AUDIT_RESULT_LABEL,
  ACCOUNT_AUDIT_RESULTS,
  AccountAuditEventSchema,
  AccountStateSchema,
  accountAuditEventId,
  isUnsettled,
} from './account-audit.contract'

const BASE = {
  id: 'user.role.update__uid-2__op-1',
  action: 'user.role.update' as const,
  result: 'started' as const,
  actorUid: 'uid-admin',
  targetUid: 'uid-2',
  correlationId: 'cid-1',
  startedAt: new Date('2026-07-21T00:00:00.000Z'),
}

describe('AccountStateSchema', () => {
  it('accepts the three fields these mutations actually change', () => {
    expect(
      AccountStateSchema.parse({
        role: 'admin',
        displayName: 'Contoh',
        disabled: false,
      }),
    ).toEqual({ role: 'admin', displayName: 'Contoh', disabled: false })
  })

  it('refuses every shape that could smuggle a secret into durable storage', () => {
    // The realistic accident is not someone typing a password in — it is someone
    // spreading an object that happens to contain one. A closed shape is what
    // makes that a parse failure instead of a stored credential.
    for (const bad of [
      { password: 'hunter2' },
      { temporaryPassword: 'abc123' },
      { resetLink: 'https://example.test/reset?oobCode=x' },
      { role: 'admin', idToken: 'ey...' },
      { error: { stack: 'at foo (/srv/app/lib/secret.ts:1)' } },
      { requestBody: { email: 'a@b.test', password: 'p' } },
      { cookie: 'session=ey...' },
    ]) {
      expect(AccountStateSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('refuses an unknown role', () => {
    expect(AccountStateSchema.safeParse({ role: 'superadmin' }).success).toBe(
      false,
    )
  })
})

describe('AccountAuditEventSchema', () => {
  it('accepts a minimal started event', () => {
    expect(AccountAuditEventSchema.parse(BASE)).toMatchObject({
      result: 'started',
    })
  })

  it('carries both actors when the administrator was impersonating', () => {
    // The fact an ordinary log line loses, and the one an auditor most needs.
    const parsed = AccountAuditEventSchema.parse({
      ...BASE,
      effectiveActorUid: 'uid-target',
    })
    expect(parsed.actorUid).toBe('uid-admin')
    expect(parsed.effectiveActorUid).toBe('uid-target')
  })

  it('refuses an unknown action or result', () => {
    expect(
      AccountAuditEventSchema.safeParse({ ...BASE, action: 'user.delete' })
        .success,
    ).toBe(false)
    expect(
      AccountAuditEventSchema.safeParse({ ...BASE, result: 'maybe' }).success,
    ).toBe(false)
  })

  it('bounds reason and failureCode so a message or a body cannot ride in', () => {
    expect(
      AccountAuditEventSchema.safeParse({ ...BASE, reason: 'x'.repeat(501) })
        .success,
    ).toBe(false)
    expect(
      AccountAuditEventSchema.safeParse({
        ...BASE,
        failureCode: 'x'.repeat(101),
      }).success,
    ).toBe(false)
  })

  it('refuses an event with no actor or no target', () => {
    expect(
      AccountAuditEventSchema.safeParse({ ...BASE, actorUid: '' }).success,
    ).toBe(false)
    expect(
      AccountAuditEventSchema.safeParse({ ...BASE, targetUid: '' }).success,
    ).toBe(false)
  })
})

describe('accountAuditEventId', () => {
  it('is deterministic for one operation, so a retry finalizes rather than duplicates', () => {
    expect(accountAuditEventId('user.disable', 'uid-2', 'op-1')).toBe(
      accountAuditEventId('user.disable', 'uid-2', 'op-1'),
    )
  })

  it('separates different operations on the same target', () => {
    expect(accountAuditEventId('user.disable', 'uid-2', 'op-1')).not.toBe(
      accountAuditEventId('user.disable', 'uid-2', 'op-2'),
    )
  })

  it('never produces a document id containing a path separator', () => {
    for (const action of ACCOUNT_AUDIT_ACTIONS) {
      expect(accountAuditEventId(action, 'uid-2', 'op-1')).not.toContain('/')
    }
  })
})

describe('isUnsettled', () => {
  it('is true only for a started event', () => {
    for (const result of ACCOUNT_AUDIT_RESULTS) {
      const event = AccountAuditEventSchema.parse({ ...BASE, result })
      expect(isUnsettled(event)).toBe(result === 'started')
    }
  })
})

describe('labels', () => {
  // A raw code must never reach the viewer; the Record types make a missing
  // label a compile error, and these assert the maps are actually complete.
  it('name every action and every result', () => {
    for (const action of ACCOUNT_AUDIT_ACTIONS) {
      expect(ACCOUNT_AUDIT_ACTION_LABEL[action]).toBeTruthy()
    }
    for (const result of ACCOUNT_AUDIT_RESULTS) {
      expect(ACCOUNT_AUDIT_RESULT_LABEL[result]).toBeTruthy()
    }
  })
})
