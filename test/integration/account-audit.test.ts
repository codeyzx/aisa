import { afterEach, describe, expect, it } from 'vitest'

import { requireEmulatorOrSkip } from '@/test/emulator'

import type { AccountAuditEvent } from '@/lib/audit/account-audit.contract'
import { ACCOUNT_AUDIT_COLLECTION } from '@/lib/audit/account-audit.path'
import {
  getAccountAuditEvent,
  listAccountAuditEvents,
  settleAccountAudit,
  startAccountAudit,
} from '@/lib/audit/account-audit.repo'
import { rawCollection } from '@/lib/firebase/collections'

/**
 * The durable audit protocol against a REAL Firestore (emulator, Admin SDK).
 *
 * What is worth proving here is not that a write writes. It is that the protocol
 * survives the failures it exists for: a crash between start and settle leaves a
 * visible `started` event, a retried operation settles the event it opened
 * instead of forking a twin, and settling cannot rewrite who did what to whom.
 */
const reachable = await requireEmulatorOrSkip('account audit integration tests')

const eventDoc = (id: string) => rawCollection(ACCOUNT_AUDIT_COLLECTION).doc(id)

let seq = 0
const created: string[] = []

function operationId(): string {
  seq += 1
  return `audit-test-op-${seq}`
}

async function start(
  overrides: Partial<Parameters<typeof startAccountAudit>[0]> = {},
) {
  const id = await startAccountAudit({
    action: 'user.role.update',
    operationId: operationId(),
    actorUid: 'uid-admin',
    targetUid: 'uid-target',
    before: { role: 'user' },
    correlationId: 'cid-1',
    ...overrides,
  })
  created.push(id)
  return id
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((id) => eventDoc(id).delete()))
})

/**
 * Write one event with a CONTROLLED `startedAt`.
 *
 * The production writer stamps `FieldValue.serverTimestamp()` — correct there
 * (a skewed caller clock must not place itself in the audit's past) and useless
 * here, because the ordering hazard this file has to prove is a TIE, and a
 * server timestamp cannot be asked for one. So the tie is planted directly and
 * the code under test is still the real query, the real converter, and the real
 * `paginate`.
 *
 * A raw write, deliberately: the typed accessor's converter is a WRITE
 * validator too, and going around it is what lets a future test plant a
 * deliberately malformed row. Everything read back still comes through the
 * converter, so a planted row that did not match the schema fails loudly.
 */
async function plant(
  id: string,
  event: Omit<AccountAuditEvent, 'id'>,
): Promise<string> {
  await eventDoc(id).set({ id, ...event })
  created.push(id)
  return id
}

/** A target uid nothing else in the suite (or the emulator) can collide with. */
function isolatedTarget(label: string): string {
  seq += 1
  return `uid-list-${label}-${seq}`
}

describe.runIf(reachable)('durable account audit', () => {
  it('opens an event as started, BEFORE any mutation runs', async () => {
    // The crash-in-the-middle case: this document is what a reconciliation view
    // finds when the process dies before settling.
    const event = await getAccountAuditEvent(await start())
    expect(event).toMatchObject({
      action: 'user.role.update',
      result: 'started',
      actorUid: 'uid-admin',
      targetUid: 'uid-target',
      before: { role: 'user' },
    })
    expect(event?.settledAt).toBeUndefined()
  })

  it('stamps startedAt with SERVER time, not the caller clock', async () => {
    // A request from a machine with a skewed clock must not be able to place
    // itself in the audit's past.
    const before = Date.now()
    const event = await getAccountAuditEvent(await start())
    expect(event?.startedAt).toBeInstanceOf(Date)
    expect(event!.startedAt.getTime()).toBeGreaterThan(before - 60_000)
  })

  it('settles an open event and records the after state', async () => {
    const id = await start()
    await settleAccountAudit(id, {
      result: 'succeeded',
      after: { role: 'admin' },
    })
    const event = await getAccountAuditEvent(id)
    expect(event).toMatchObject({
      result: 'succeeded',
      before: { role: 'user' },
      after: { role: 'admin' },
    })
    expect(event?.settledAt).toBeInstanceOf(Date)
  })

  it('MERGES on settle, so the settle site cannot rewrite who did what', async () => {
    // A replace would let a bug at the settle site quietly restate the actor,
    // the target, or the before-state the event was opened with.
    const id = await start()
    await settleAccountAudit(id, {
      result: 'failed',
      failureCode: 'auth_unavailable',
    })
    expect(await getAccountAuditEvent(id)).toMatchObject({
      actorUid: 'uid-admin',
      targetUid: 'uid-target',
      before: { role: 'user' },
      result: 'failed',
      failureCode: 'auth_unavailable',
      correlationId: 'cid-1',
    })
  })

  it('records a partial landing as reconciliation_required, not as failed', async () => {
    // Auth changed but a follow-up did not. Reporting this as `failed` would
    // tell an operator to retry a mutation that already half-landed.
    const id = await start()
    await settleAccountAudit(id, {
      result: 'reconciliation_required',
      after: { role: 'admin' },
      failureCode: 'revocation_pending',
    })
    expect((await getAccountAuditEvent(id))?.result).toBe(
      'reconciliation_required',
    )
  })

  it('a retried operation settles ONE event rather than forking a twin', async () => {
    // Determinism is the whole reason the id is derived. With a random id, a
    // retry leaves a `started` orphan beside a `succeeded` twin and the history
    // shows two operations where the user experienced one.
    const op = operationId()
    const first = await start({ operationId: op })
    const second = await startAccountAudit({
      action: 'user.role.update',
      operationId: op,
      actorUid: 'uid-admin',
      targetUid: 'uid-target',
      before: { role: 'user' },
      correlationId: 'cid-1',
    })
    expect(second).toBe(first)
    await settleAccountAudit(first, { result: 'succeeded' })

    const all = await rawCollection(ACCOUNT_AUDIT_COLLECTION)
      .where('targetUid', '==', 'uid-target')
      .get()
    expect(all.docs.filter((doc) => doc.id === first)).toHaveLength(1)
  })

  it('carries both actors when the administrator was impersonating', async () => {
    const id = await start({
      action: 'impersonation.start',
      actorUid: 'uid-admin',
      effectiveActorUid: 'uid-target',
    })
    expect(await getAccountAuditEvent(id)).toMatchObject({
      actorUid: 'uid-admin',
      effectiveActorUid: 'uid-target',
    })
  })

  it('refuses to READ BACK an event a stray write added a field to', async () => {
    // The schema is strict, so a document that grew an unexpected field fails
    // loudly on read instead of travelling into the viewer unnoticed. This is
    // the durable half of the "no free-form bag" rule.
    const id = await start()
    await eventDoc(id).set({ leakedPassword: 'hunter2' }, { merge: true })
    await expect(getAccountAuditEvent(id)).rejects.toThrow()
  })
})

/**
 * The QUERY half — `listAccountAuditEvents` against a real Firestore.
 *
 * Three things are worth proving here and nothing else is:
 *
 *  1. EVERY FILTER COMBINATION ACTUALLY RUNS. `pnpm indexes:check` reads the
 *     emulator's `indexUsage` report, and that report only knows about query
 *     shapes that RAN. A combination no test drives is invisible to the guard,
 *     passes every local check, and answers FAILED_PRECONDITION in production at
 *     RSC render. So the seven non-empty combinations are exercised explicitly
 *     rather than incidentally.
 *  2. PAGING SURVIVES A TIE. Several events can share one `startedAt`, and a
 *     cursor anchored on the timestamp alone would skip or repeat across it.
 *  3. AN INCOMPLETE EVENT STAYS VISIBLE. The protocol's whole claim.
 *
 * Every assertion is scoped to a uid this test minted. The collection is shared
 * with the account-action suite and with whatever an operator drove in the
 * browser, so a collection-wide count would be moved by rows this test never
 * wrote.
 */
describe.runIf(reachable)('account audit history query', () => {
  it('reads back what the writer wrote, newest first', async () => {
    const targetUid = isolatedTarget('order')
    const base = Date.parse('2026-05-01T00:00:00.000Z')
    await plant(`${targetUid}--old`, {
      action: 'user.role.update',
      result: 'succeeded',
      actorUid: 'uid-admin',
      targetUid,
      correlationId: 'cid-list',
      startedAt: new Date(base),
    })
    await plant(`${targetUid}--new`, {
      action: 'user.disable',
      result: 'failed',
      actorUid: 'uid-admin',
      targetUid,
      correlationId: 'cid-list',
      failureCode: 'auth/internal-error',
      startedAt: new Date(base + 60_000),
    })

    const page = await listAccountAuditEvents({ limit: 10, targetUid })
    expect(page.items.map((event) => event.id)).toEqual([
      `${targetUid}--new`,
      `${targetUid}--old`,
    ])
    expect(page.items[0]).toMatchObject({
      action: 'user.disable',
      result: 'failed',
      failureCode: 'auth/internal-error',
      targetUid,
    })
    expect(page.items[0].startedAt).toBeInstanceOf(Date)
  })

  it('keeps an unsettled event and a reconciliation_required event VISIBLE', async () => {
    // The single most important row in the whole viewer: an operation that
    // crashed between the Auth call and the settle. If the query hid it, the
    // two-step protocol would buy nothing.
    const targetUid = isolatedTarget('open')
    const started = await start({ targetUid })
    const partial = await start({ targetUid })
    await settleAccountAudit(partial, {
      result: 'reconciliation_required',
      failureCode: 'revocation_pending',
    })

    const all = await listAccountAuditEvents({ limit: 10, targetUid })
    expect(all.items.map((event) => event.id).toSorted()).toEqual(
      [started, partial].toSorted(),
    )

    // And each is reachable by its own result filter, which is how an operator
    // finds everything needing a human.
    const open = await listAccountAuditEvents({
      limit: 10,
      targetUid,
      result: 'started',
    })
    expect(open.items.map((event) => event.id)).toEqual([started])

    const needsHuman = await listAccountAuditEvents({
      limit: 10,
      targetUid,
      result: 'reconciliation_required',
    })
    expect(needsHuman.items.map((event) => event.id)).toEqual([partial])
  })

  it('DRIVES every filter combination, so indexes:check can see them', async () => {
    // Not a behavioural assertion so much as index COVERAGE: each of the seven
    // non-empty combinations of the three equality filters is a distinct query
    // shape needing its own composite index. Delete a case here and the index it
    // needs silently stops being reported.
    const targetUid = isolatedTarget('filters')
    const action = 'user.password.reset' as const
    const result = 'succeeded' as const
    // TWO rows, not one, and that is the point: the BACKWARD walk below needs a
    // second page to come back from, and every combination must match both rows
    // or one of the seven would silently skip its prev query.
    const ids: string[] = []
    for (const letter of ['a', 'b']) {
      ids.push(
        await plant(`${targetUid}--${letter}`, {
          action,
          result,
          actorUid: 'uid-admin',
          targetUid,
          reason: 'lupa kata sandi',
          correlationId: 'cid-filters',
          startedAt: new Date(Date.parse('2026-05-02T00:00:00.000Z')),
        }),
      )
    }

    const combinations = [
      { targetUid },
      { action },
      { result },
      { targetUid, action },
      { targetUid, result },
      { action, result },
      { targetUid, action, result },
    ]

    for (const filter of combinations) {
      // Sequential on purpose: each iteration is a separate query shape and the
      // point is that every one of them reaches the emulator.
      const forward = await listAccountAuditEvents({ limit: 25, ...filter })
      for (const id of ids) {
        expect(forward.items.map((event) => event.id)).toContain(id)
      }

      // ⚠️ THE BACKWARD WALK IS A SECOND, DIFFERENT INDEX — not a reverse scan
      // of the one above. `paginate`'s prev branch is `endBefore` +
      // `limitToLast`, which Firestore serves by reversing the query, so the
      // emulator reports `(… ASC, startedAt ASCENDING)` for exactly the filter
      // set whose forward form needs `DESCENDING`. Driving only forward would
      // declare half the bill and leave every "Sebelumnya" click a production
      // FAILED_PRECONDITION. Asserted as coverage, not identity: the unscoped
      // combinations can also match rows other suites wrote.
      const first = await listAccountAuditEvents({ limit: 1, ...filter })
      expect(first.nextCursor).not.toBeNull()
      const second = await listAccountAuditEvents({
        limit: 1,
        ...filter,
        cursor: first.nextCursor,
      })
      expect(second.prevCursor).not.toBeNull()
      const back = await listAccountAuditEvents({
        limit: 1,
        ...filter,
        cursor: second.prevCursor,
      })
      expect(back.items).toHaveLength(1)
    }

    // The unfiltered shapes too — free in BOTH directions (the automatic
    // single-field index serves them, because `paginate` derives both `orderBy`
    // directions from one argument so the `__name__` tiebreaker always matches).
    const unfiltered = await listAccountAuditEvents({ limit: 1 })
    expect(unfiltered.items).toHaveLength(1)
    const unfilteredSecond = await listAccountAuditEvents({
      limit: 1,
      cursor: unfiltered.nextCursor,
    })
    await listAccountAuditEvents({
      limit: 1,
      cursor: unfilteredSecond.prevCursor,
    })
  })

  it('pages through DUPLICATE timestamps without skipping or repeating', async () => {
    // The hazard: five events sharing one `startedAt`. A cursor carrying only
    // the timestamp would resume `startAfter(sameValue)` and either drop the
    // rest of the tie or serve it again. `paginate`'s `__name__` tiebreaker is
    // what makes the walk total — and it is the reason nothing here hand-rolls
    // a cursor.
    const targetUid = isolatedTarget('tie')
    const tied = new Date(Date.parse('2026-05-03T00:00:00.000Z'))
    const ids: string[] = []
    for (const letter of ['a', 'b', 'c', 'd', 'e']) {
      ids.push(
        await plant(`${targetUid}--${letter}`, {
          action: 'user.sessions.revoke',
          result: 'succeeded',
          actorUid: 'uid-admin',
          targetUid,
          correlationId: 'cid-tie',
          startedAt: tied,
        }),
      )
    }
    // Newest-first with the doc-id tiebreaker read the same way: `__name__`
    // descends alongside `startedAt`, so the whole tie is ordered by id, reversed.
    const expected = ids.toSorted().toReversed()

    const walked: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await listAccountAuditEvents({ limit: 2, targetUid, cursor })
      walked.push(...page.items.map((event) => event.id))
      cursor = page.nextCursor
      pages += 1
      expect(pages).toBeLessThan(10)
    } while (cursor)

    expect(walked).toEqual(expected)
    expect(new Set(walked).size).toBe(expected.length)
    expect(pages).toBe(3)
  })

  it('walks BACKWARD across the same tie and lands on the same rows', async () => {
    const targetUid = isolatedTarget('tie-back')
    const tied = new Date(Date.parse('2026-05-04T00:00:00.000Z'))
    const ids: string[] = []
    for (const letter of ['a', 'b', 'c', 'd']) {
      ids.push(
        await plant(`${targetUid}--${letter}`, {
          action: 'user.enable',
          result: 'succeeded',
          actorUid: 'uid-admin',
          targetUid,
          correlationId: 'cid-tie-back',
          startedAt: tied,
        }),
      )
    }
    const expected = ids.toSorted().toReversed()

    const first = await listAccountAuditEvents({ limit: 2, targetUid })
    expect(first.prevCursor).toBeNull()
    expect(first.items.map((e) => e.id)).toEqual(expected.slice(0, 2))

    const second = await listAccountAuditEvents({
      limit: 2,
      targetUid,
      cursor: first.nextCursor,
    })
    // Last page: no next, and a prev that must land back on page one exactly.
    expect(second.nextCursor).toBeNull()
    expect(second.items.map((e) => e.id)).toEqual(expected.slice(2))

    const back = await listAccountAuditEvents({
      limit: 2,
      targetUid,
      cursor: second.prevCursor,
    })
    expect(back.items.map((e) => e.id)).toEqual(expected.slice(0, 2))
  })

  it('DROPS a cursor minted under a different filter instead of serving wrong rows', async () => {
    // Nothing throws on a scope mismatch — that is exactly why `paginate` stamps
    // the filter identity into the token. Without it, this call would resume the
    // failed-only set from an offset counted through the unfiltered one.
    const targetUid = isolatedTarget('scope')
    const tied = new Date(Date.parse('2026-05-05T00:00:00.000Z'))
    for (const letter of ['a', 'b', 'c']) {
      await plant(`${targetUid}--${letter}`, {
        action: 'user.name.update',
        result: 'succeeded',
        actorUid: 'uid-admin',
        targetUid,
        correlationId: 'cid-scope',
        startedAt: tied,
      })
    }

    const page = await listAccountAuditEvents({ limit: 2, targetUid })
    expect(page.nextCursor).not.toBeNull()

    // Same token, different scope → treated as unusable, so paging restarts.
    const reused = await listAccountAuditEvents({
      limit: 2,
      targetUid,
      result: 'succeeded',
      cursor: page.nextCursor,
    })
    expect(reused.prevCursor).toBeNull()
    expect(reused.items.map((e) => e.id)).toEqual(page.items.map((e) => e.id))
  })
})
