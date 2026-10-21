import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Session } from '@/lib/auth/session'
import { DeadlineExceededError } from '@/lib/data/deadline'

const storage = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  moveObject: vi.fn(),
}))
const audit = vi.hoisted(() => vi.fn())

vi.mock('./s3', () => storage)
vi.mock('@/lib/data/audit', () => ({ audit }))

import {
  promoteAttachment,
  reapAttachment,
  reapPromotionOnFailedWrite,
  requireFreshStagingAttachment,
} from './attachment-lifecycle'

const session: Session = {
  uid: 'uid-1',
  email: 'someone@aixel.test',
  emailVerified: true,
  role: 'admin',
}

// A caller-supplied tag — the lifecycle records orphans under whatever the
// calling entity names, never a hardcoded one.
const ORPHAN_TAG = 'entity.attachment.orphan'

beforeEach(() => {
  vi.clearAllMocks()
  storage.moveObject.mockResolvedValue({ sourceDeleted: true })
  storage.deleteObject.mockResolvedValue(undefined)
})

describe('Attachment lifecycle', () => {
  it('requires a freshly staged attachment for creates', () => {
    expect(() =>
      requireFreshStagingAttachment('assets/uid-1/file.pdf', 'uid-1'),
    ).toThrow('attachment must be a freshly uploaded staging key')
    expect(() =>
      requireFreshStagingAttachment(
        'uploads/uid-1/123e4567-e89b-42d3-a456-426614174000-file.pdf',
        'uid-1',
      ),
    ).not.toThrow()
  })

  it('promotes a staged attachment and records that this write moved it', async () => {
    await expect(promoteAttachment('uploads/uid-1/file.pdf')).resolves.toEqual({
      attachmentKey: 'assets/uid-1/file.pdf',
      moved: true,
    })
    expect(storage.moveObject).toHaveBeenCalledWith({
      sourceKey: 'uploads/uid-1/file.pdf',
      destKey: 'assets/uid-1/file.pdf',
    })
  })

  it('accepts an unchanged durable key on edit without moving it', async () => {
    await expect(promoteAttachment('assets/uid-1/file.pdf')).resolves.toEqual({
      attachmentKey: 'assets/uid-1/file.pdf',
      moved: false,
    })
    expect(storage.moveObject).not.toHaveBeenCalled()
  })

  it('compensates only the object moved for a failed write', async () => {
    await reapPromotionOnFailedWrite(
      session,
      new Error('write failed'),
      { attachmentKey: 'assets/uid-1/file.pdf', moved: true },
      ORPHAN_TAG,
    )
    await reapPromotionOnFailedWrite(
      session,
      new Error('write failed'),
      { attachmentKey: 'assets/uid-1/unchanged.pdf', moved: false },
      ORPHAN_TAG,
    )

    expect(storage.deleteObject).toHaveBeenCalledTimes(1)
    expect(storage.deleteObject).toHaveBeenCalledWith({
      key: 'assets/uid-1/file.pdf',
    })
  })

  it('does not compensate an ambiguous deadline failure', async () => {
    await reapPromotionOnFailedWrite(
      session,
      new DeadlineExceededError('updateAsset', 10_000),
      { attachmentKey: 'assets/uid-1/file.pdf', moved: true },
      ORPHAN_TAG,
    )

    expect(storage.deleteObject).not.toHaveBeenCalled()
  })

  /**
   * `promoteAttachment` runs BEFORE the document write and OUTSIDE the
   * caller's compensating catch, so what it does on a partial move decides
   * whether a durable object can be stranded with nobody holding a reference.
   */
  it('treats a copy that landed with an undeleted source as a SUCCESS', async () => {
    // The defect: moveObject used to throw here, and that throw escaped past
    // the action's catch — abandoning a durable `assets/` object the reaper
    // never touches (it covers the staging prefix only), billing forever with
    // no record. The destination exists, which is what the caller asked for.
    storage.moveObject.mockResolvedValue({ sourceDeleted: false })

    await expect(promoteAttachment('uploads/uid-1/file.pdf')).resolves.toEqual({
      attachmentKey: 'assets/uid-1/file.pdf',
      moved: true,
    })
  })

  it('still propagates a genuinely failed copy', async () => {
    // The other direction must not regress: if the COPY failed there is no
    // durable object, the source is intact, and the write must not proceed as
    // though an attachment exists.
    storage.moveObject.mockRejectedValue(new Error('copy failed'))

    await expect(promoteAttachment('uploads/uid-1/file.pdf')).rejects.toThrow(
      'copy failed',
    )
  })

  it('audits a failed cleanup under the caller tag instead of failing the completed action', async () => {
    storage.deleteObject.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(
      reapAttachment(session, 'assets/uid-1/file.pdf', ORPHAN_TAG),
    ).resolves.toBeUndefined()
    expect(audit).toHaveBeenCalledWith(
      session,
      ORPHAN_TAG,
      'assets/uid-1/file.pdf',
    )
  })
})
