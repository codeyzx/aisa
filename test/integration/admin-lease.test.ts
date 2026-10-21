import { afterEach, describe, expect, it } from 'vitest'

import { requireEmulatorOrSkip } from '@/test/emulator'

import {
  ACCOUNT_MUTATION_LOCK,
  ADMIN_LEASE_TTL_MS,
  ADMIN_LOCKS_COLLECTION,
  acquireAdminLease,
  assertLeaseHeld,
  LeaseLostError,
  releaseAdminLease,
  withAdminLease,
} from '@/lib/auth/admin-lease'
import { rawCollection } from '@/lib/firebase/collections'

/**
 * The final-admin lease against a REAL Firestore (emulator, Admin SDK).
 *
 * Every claim here is a fact about the transaction, not about our arithmetic, so
 * none of it can be proven with a fake: that a second operation is refused, that
 * an expired lease is takeable, and — the case a bare TTL misses — that a stalled
 * operation whose lease was taken over CANNOT resume mutating.
 *
 * `nowMs` is injected throughout so expiry is exercised without sleeping.
 */
const reachable = await requireEmulatorOrSkip('admin lease integration tests')

const lockDoc = () =>
  rawCollection(ADMIN_LOCKS_COLLECTION).doc(ACCOUNT_MUTATION_LOCK)

/** A fixed clock. Every case places its own offsets against this. */
const T0 = 1_700_000_000_000

afterEach(async () => {
  await lockDoc().delete()
})

describe.runIf(reachable)('admin mutation lease', () => {
  it('acquires a free lease and reports its own expiry', async () => {
    const lease = await acquireAdminLease('op-1', T0)
    expect(lease).toMatchObject({
      ownerOperationId: 'op-1',
      generation: 1,
      expiresAtMs: T0 + ADMIN_LEASE_TTL_MS,
    })
  })

  it('REFUSES a second operation while the first lease is live', async () => {
    // The whole point: two administrators demoting each other at the same moment
    // must not both pass their own "there is still another admin" check.
    await acquireAdminLease('op-1', T0)
    expect(await acquireAdminLease('op-2', T0 + 1000)).toBeNull()
  })

  it('refuses exactly one of two operations racing for it', async () => {
    const results = await Promise.all([
      acquireAdminLease('op-a', T0),
      acquireAdminLease('op-b', T0),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('lets the SAME operation re-acquire — a retry is not a second operation', async () => {
    await acquireAdminLease('op-1', T0)
    const again = await acquireAdminLease('op-1', T0 + 1000)
    expect(again?.ownerOperationId).toBe('op-1')
    expect(again?.generation).toBe(2)
  })

  it('lets a new operation take over once the lease has EXPIRED', async () => {
    // Without expiry, one crashed process locks out every future admin mutation
    // with no unlock action a UI could offer.
    await acquireAdminLease('op-crashed', T0)
    const taken = await acquireAdminLease('op-2', T0 + ADMIN_LEASE_TTL_MS + 1)
    expect(taken?.ownerOperationId).toBe('op-2')
    expect(taken?.generation).toBe(2)
  })

  it('releases so the next administrator does not wait out the TTL', async () => {
    const lease = await acquireAdminLease('op-1', T0)
    await releaseAdminLease(lease!)
    expect((await lockDoc().get()).exists).toBe(false)
    expect(await acquireAdminLease('op-2', T0 + 1)).not.toBeNull()
  })

  it('a release from a SUPERSEDED holder does not unlock the live operation', async () => {
    // The stalled-then-woken process: releasing here would hand the lock away
    // while someone else is mid-mutation.
    const stale = await acquireAdminLease('op-stale', T0)
    const live = await acquireAdminLease('op-live', T0 + ADMIN_LEASE_TTL_MS + 1)
    await releaseAdminLease(stale!)
    expect((await lockDoc().get()).exists).toBe(true)
    await expect(
      assertLeaseHeld(live!, T0 + ADMIN_LEASE_TTL_MS + 2),
    ).resolves.toBeUndefined()
  })

  describe('assertLeaseHeld', () => {
    it('passes while the lease is genuinely held', async () => {
      const lease = await acquireAdminLease('op-1', T0)
      await expect(assertLeaseHeld(lease!, T0 + 1000)).resolves.toBeUndefined()
    })

    it('throws once the local deadline has passed, before touching Firestore', async () => {
      const lease = await acquireAdminLease('op-1', T0)
      await expect(
        assertLeaseHeld(lease!, T0 + ADMIN_LEASE_TTL_MS + 1),
      ).rejects.toBeInstanceOf(LeaseLostError)
    })

    it('throws when a NEWER generation has taken over', async () => {
      // The case a bare TTL check misses: this holder's own clock may still say
      // the lease is live, and it is not.
      const stale = await acquireAdminLease('op-stale', T0)
      await acquireAdminLease('op-new', T0 + ADMIN_LEASE_TTL_MS + 1)
      await expect(assertLeaseHeld(stale!, T0 + 1000)).rejects.toBeInstanceOf(
        LeaseLostError,
      )
    })

    it('throws when the SAME operationId re-acquired — the owner check cannot see this', async () => {
      // The case the generation exists for, and the only one it alone catches.
      // An operation stalls past its TTL; its supervisor retries under the SAME
      // operationId and re-acquires. The owner on the document now matches the
      // stalled holder's own id, so an owner-only check would wave it through
      // and let two concurrent executions of one operation both mutate.
      const stalled = await acquireAdminLease('op-1', T0)
      await acquireAdminLease('op-1', T0 + ADMIN_LEASE_TTL_MS + 1)
      await expect(assertLeaseHeld(stalled!, T0 + 1000)).rejects.toBeInstanceOf(
        LeaseLostError,
      )
    })

    it('throws when the lock document is gone', async () => {
      const lease = await acquireAdminLease('op-1', T0)
      await lockDoc().delete()
      await expect(assertLeaseHeld(lease!, T0 + 1000)).rejects.toBeInstanceOf(
        LeaseLostError,
      )
    })

    it('carries the reconciliation code, so a caller cannot report plain failure', async () => {
      const lease = await acquireAdminLease('op-1', T0)
      await lockDoc().delete()
      await assertLeaseHeld(lease!, T0 + 1000).catch((error: unknown) => {
        expect((error as LeaseLostError).code).toBe(
          'lease_expired_reconciliation_required',
        )
      })
    })
  })

  describe('withAdminLease', () => {
    it('runs the operation and releases afterwards', async () => {
      const result = await withAdminLease('op-1', async () => 'done')
      expect(result).toEqual({ acquired: true, value: 'done' })
      expect((await lockDoc().get()).exists).toBe(false)
    })

    it('releases even when the operation throws', async () => {
      await expect(
        withAdminLease('op-1', async () => {
          throw new Error('mutation blew up')
        }),
      ).rejects.toThrow('mutation blew up')
      expect((await lockDoc().get()).exists).toBe(false)
    })

    it('reports NOT ACQUIRED rather than queueing behind a live operation', async () => {
      await acquireAdminLease('op-holder', Date.now())
      expect(await withAdminLease('op-2', async () => 'ran')).toEqual({
        acquired: false,
      })
    })
  })

  it('a stalled holder cannot release its own retry — same operationId, newer generation', async () => {
    // Owner-only guarding would unlock the live retry here, handing the lock to
    // a third operation while the retry is mid-mutation.
    const stalled = await acquireAdminLease('op-1', T0)
    await acquireAdminLease('op-1', T0 + ADMIN_LEASE_TTL_MS + 1)
    await releaseAdminLease(stalled!)
    expect((await lockDoc().get()).exists).toBe(true)
  })

  it('stays acquirable when the lock document is CORRUPT', async () => {
    // A single bad write must not lock out administration permanently — the same
    // repair rule the revocation marker follows.
    await lockDoc().set({ ownerOperationId: 42, generation: 'x' })
    expect(await acquireAdminLease('op-1', T0)).toMatchObject({
      ownerOperationId: 'op-1',
      generation: 1,
    })
  })
})
