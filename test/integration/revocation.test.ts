import { afterEach, describe, expect, it } from 'vitest'

import { requireEmulatorOrSkip } from '@/test/emulator'

import {
  advanceRevokedAfterEpoch,
  readRevocationMarker,
  revokeSessionsNow,
} from '@/lib/auth/revocation'
import {
  AUTH_SESSIONS_COLLECTION,
  revocationCutoff,
} from '@/lib/auth/revocation.contract'
import { rawCollection } from '@/lib/firebase/collections'

/**
 * The revocation marker, driven against a REAL Firestore (emulator, Admin SDK).
 *
 * The claims worth testing here are all facts about Firestore, not about our
 * arithmetic (which `revocation.contract.test.ts` covers in isolation): that the
 * transaction actually serializes concurrent advances, that a corrupt document
 * can still be overwritten, and that a schema-violating value is reported as
 * unreadable rather than parsed into a number the boundary would then trust.
 *
 * Like `asset-repo.test.ts`, this drives the ADMIN SDK, which bypasses
 * `firestore.rules` entirely — Rules are covered by `firestore.rules.test.ts`.
 */
const reachable = await requireEmulatorOrSkip('revocation integration tests')

const markerDoc = (id: string) =>
  rawCollection(AUTH_SESSIONS_COLLECTION).doc(id)

/** A fresh uid per test, so nothing depends on suite order or leftover state. */
let seq = 0
const created: string[] = []
function uid(): string {
  seq += 1
  const value = `revocation-test-${seq}`
  created.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((id) => markerDoc(id).delete()))
})

describe.runIf(reachable)('revocation marker', () => {
  it('reports no marker as absent, never as a zero epoch', async () => {
    // `absent` and `value: 0` mean opposite things at the session boundary —
    // absent allows every token, 0 would too but by accident. Keep them apart.
    expect(await readRevocationMarker(uid())).toEqual({ kind: 'absent' })
  })

  it('creates the marker at the requested cutoff and reads it back', async () => {
    const id = uid()
    expect(await advanceRevokedAfterEpoch(id, 1000)).toBe(1000)
    expect(await readRevocationMarker(id)).toEqual({
      kind: 'value',
      epoch: 1000,
    })
  })

  it('never lowers an existing marker', async () => {
    const id = uid()
    await advanceRevokedAfterEpoch(id, 2000)
    expect(await advanceRevokedAfterEpoch(id, 1000)).toBe(2000)
    expect(await readRevocationMarker(id)).toEqual({
      kind: 'value',
      epoch: 2000,
    })
  })

  it('holds at the current value when the same cutoff is replayed', async () => {
    const id = uid()
    await advanceRevokedAfterEpoch(id, 2000)
    expect(await advanceRevokedAfterEpoch(id, 2000)).toBe(2000)
  })

  it('leaves the HIGHEST cutoff standing when advances race', async () => {
    // The real failure this guards: two concurrent revocations both read the old
    // value, and the lower cutoff lands last — silently un-revoking sessions the
    // higher one had already killed. A transaction is what prevents it; a
    // read-then-write would not.
    const id = uid()
    const cutoffs = [1500, 3000, 900, 2500, 1200]
    await Promise.all(cutoffs.map((c) => advanceRevokedAfterEpoch(id, c)))
    expect(await readRevocationMarker(id)).toEqual({
      kind: 'value',
      epoch: Math.max(...cutoffs),
    })
  })

  it('reports a tampered marker as unreadable rather than parsing it', async () => {
    const id = uid()
    await markerDoc(id).set({ revokedAfterEpoch: 'not-a-number' })
    const read = await readRevocationMarker(id)
    expect(read.kind).toBe('unreadable')
  })

  it('reports a marker missing its one field as unreadable', async () => {
    const id = uid()
    await markerDoc(id).set({ somethingElse: true })
    expect((await readRevocationMarker(id)).kind).toBe('unreadable')
  })

  it('can still revoke an account whose marker is corrupt', async () => {
    // The tampered document is exactly the one most in need of a valid cutoff.
    // If `advance` read through the converter it would throw here, and a
    // corrupted marker would make the account permanently un-revokable.
    const id = uid()
    await markerDoc(id).set({ revokedAfterEpoch: 'not-a-number' })
    expect(await advanceRevokedAfterEpoch(id, 4000)).toBe(4000)
    expect(await readRevocationMarker(id)).toEqual({
      kind: 'value',
      epoch: 4000,
    })
  })

  it('revokeSessionsNow writes a cutoff strictly ahead of the current second', async () => {
    const id = uid()
    const before = Math.floor(Date.now() / 1000)
    const written = await revokeSessionsNow(id)
    expect(written).toBeGreaterThan(before)
    expect(written).toBeGreaterThanOrEqual(revocationCutoff(before * 1000))
  })
})
