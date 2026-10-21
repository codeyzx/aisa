import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `moveObject`'s PARTIAL-FAILURE semantics.
 *
 * A separate file from `s3.test.ts` on purpose: that one drives the real AWS SDK
 * so its presigned-URL assertions mean something, while these cases need the SDK
 * REPLACED — the whole point is what happens when `send` resolves oddly or
 * rejects, which a real client cannot be made to do on demand. `vi.mock` is
 * file-scoped, so keeping them apart is what lets each use the regime it needs.
 *
 * "Copy then delete" has two outcomes between success and failure, and collapsing
 * either into a plain throw costs data or money:
 *
 *  - a copy that answered 200 with an error body, then deleting the source →
 *    silent DATA LOSS;
 *  - a good copy whose source delete failed, reported as a throw → a DURABLE
 *    orphan nobody holds a reference to, billing forever.
 */

const sdk = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('./config', () => ({
  getStorageConfig: () => ({
    endpoint: 'http://storage.invalid:8333',
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret',
  }),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = sdk.send
  },
  // Each command records only what the assertions below need to tell them apart.
  CopyObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
    readonly kind = 'copy'
  },
  DeleteObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
    readonly kind = 'delete'
  },
  GetObjectCommand: class {
    readonly kind = 'get'
  },
  PutObjectCommand: class {
    readonly kind = 'put'
  },
}))

const SOURCE = 'uploads/uid-1/file.pdf'
const DEST = 'assets/uid-1/file.pdf'

/** The commands `send` was called with, in order. */
function sentKinds(): string[] {
  return sdk.send.mock.calls.map((call) => (call[0] as { kind: string }).kind)
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('moveObject — partial failures', () => {
  it('copies then deletes, and reports the source gone', async () => {
    sdk.send.mockResolvedValue({ CopyObjectResult: { ETag: '"abc"' } })
    const { moveObject } = await import('./s3')

    await expect(
      moveObject({ sourceKey: SOURCE, destKey: DEST }),
    ).resolves.toStrictEqual({ sourceDeleted: true })
    expect(sentKinds()).toStrictEqual(['copy', 'delete'])
  })

  it('REFUSES to delete the source when the copy returned no result', async () => {
    // S3's CopyObject can answer HTTP 200 with an error inside the body, which
    // the SDK resolves rather than rejects. Deleting on that promise destroys
    // the only copy of the bytes and leaves the document pointing at nothing.
    // The assertion that matters is the absence of 'delete'.
    sdk.send.mockResolvedValue({})
    const { moveObject } = await import('./s3')

    await expect(
      moveObject({ sourceKey: SOURCE, destKey: DEST }),
    ).rejects.toThrow(/refusing to delete the source/)
    expect(sentKinds()).toStrictEqual(['copy'])
  })

  it('SUCCEEDS with a leftover when the copy landed but the delete failed', async () => {
    // The bytes are durable — that is what the caller asked for. Throwing would
    // abandon the destination object outside any compensating catch, and the
    // reaper covers only the staging prefix, so it would bill forever unseen.
    // The leftover source is under that TTL-reaped prefix, so it cleans itself.
    sdk.send
      .mockResolvedValueOnce({ CopyObjectResult: { ETag: '"abc"' } })
      .mockRejectedValueOnce(new Error('storage unavailable'))
    const { moveObject } = await import('./s3')

    await expect(
      moveObject({ sourceKey: SOURCE, destKey: DEST }),
    ).resolves.toStrictEqual({ sourceDeleted: false })
    expect(sentKinds()).toStrictEqual(['copy', 'delete'])
  })

  it('propagates a failed copy and never reaches the delete', async () => {
    // Unchanged behaviour, pinned: no destination exists, so the source must
    // survive rather than being lost to a half-done move.
    sdk.send.mockRejectedValue(new Error('copy exploded'))
    const { moveObject } = await import('./s3')

    await expect(
      moveObject({ sourceKey: SOURCE, destKey: DEST }),
    ).rejects.toThrow('copy exploded')
    expect(sentKinds()).toStrictEqual(['copy'])
  })
})
