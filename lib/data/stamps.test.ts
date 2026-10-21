import { describe, expect, it } from 'vitest'

import { stampCreated, stampUpdated } from './stamps'

/**
 * The server-owned fields every standard entity write sets. Pure, so this needs
 * no emulator — which is the whole reason they were extracted here rather than
 * left inside the repos behind the credential boundary.
 */
describe('stampCreated', () => {
  const NOW = new Date('2026-07-24T10:00:00.000Z')

  it('adds the server-owned id and both timestamps', () => {
    expect(stampCreated('id-1', { name: 'Meja' }, NOW)).toStrictEqual({
      name: 'Meja',
      id: 'id-1',
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('uses ONE instant for both timestamps', () => {
    // A caller reading `createdAt !== updatedAt` on a fresh document would
    // conclude it had been edited. Two `new Date()` calls can straddle a
    // millisecond boundary, so this is not theoretical.
    const stamped = stampCreated('id-1', {}, NOW)
    expect(stamped.createdAt).toBe(stamped.updatedAt)
  })

  it('lets the caller own the id — it does not invent one', () => {
    // The ref is minted by the repo because that is what the transaction writes
    // to; generating an id here would leave the caller holding a different one.
    expect(stampCreated('ref-minted', {}, NOW).id).toBe('ref-minted')
  })

  it('does not let input override the server-owned fields', () => {
    // A client-supplied `id`/`createdAt` riding in on the input object must not
    // win over the server's. The spread order is what decides this.
    const stamped = stampCreated(
      'server-id',
      { id: 'client-id', createdAt: new Date('2000-01-01') },
      NOW,
    )
    expect(stamped.id).toBe('server-id')
    expect(stamped.createdAt).toBe(NOW)
  })
})

describe('stampUpdated', () => {
  const NOW = new Date('2026-07-24T10:00:00.000Z')
  const CREATED = new Date('2026-01-01T00:00:00.000Z')

  it('merges the patch over the current document and re-stamps updatedAt', () => {
    expect(
      stampUpdated(
        { id: 'a', name: 'Meja', createdAt: CREATED, updatedAt: CREATED },
        { name: 'Meja Baru' },
        NOW,
      ),
    ).toStrictEqual({
      id: 'a',
      name: 'Meja Baru',
      createdAt: CREATED,
      updatedAt: NOW,
    })
  })

  it('never moves createdAt', () => {
    const merged = stampUpdated({ createdAt: CREATED }, {}, NOW)
    expect(merged.createdAt).toBe(CREATED)
  })

  it('KEEPS a present-but-undefined patch key — this is how a field is cleared', () => {
    // The load-bearing one, and the reason this is a plain spread rather than a
    // "smart" merge. Clearing an optional field travels as '' -> undefined, and
    // that undefined must reach the stored document so the driver's
    // ignore-undefined behaviour drops the key on a full `set`. A merge that
    // filtered undefined out would leave the OLD value in place: every
    // field-clearing edit would silently become a no-op, nothing would throw,
    // and the UI would report success. Verified: adding a filter here fails
    // this test and the asset attachment-clearing integration case.
    // Typed as the optional field it really is — an entity's patch type has
    // optional keys, so `current & patch` intersects cleanly there.
    const current: { attachmentKey: string | undefined } = {
      attachmentKey: 'assets/uid-1/old.pdf',
    }
    const patch: { attachmentKey: string | undefined } = {
      attachmentKey: undefined,
    }
    const merged = stampUpdated(current, patch, NOW)
    expect('attachmentKey' in merged).toBe(true)
    expect(merged.attachmentKey).toBeUndefined()
  })

  it('leaves an ABSENT key alone rather than clearing it', () => {
    // The other half of the same rule: absent means "not part of this edit".
    // Only a key the patch actually carries may change the document.
    const merged = stampUpdated(
      { attachmentKey: 'keep.pdf' } as { attachmentKey: string | undefined },
      {},
      NOW,
    )
    expect(merged.attachmentKey).toBe('keep.pdf')
  })
})
