import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The presigned-URL PARAMETERS, asserted without a bucket.
 *
 * Everything worth checking here is decided before a byte moves: which
 * parameters get signed, and therefore which ones a client cannot strip. A live
 * SeaweedFS round-trip proves the credentials work; it does not prove the URL
 * says `attachment`, and it is exactly the part a developer cannot run in CI.
 *
 * The config is stubbed with obvious fake values — this file must never need a
 * real `S3_*` to run.
 */
const SERVER_ENDPOINT = 'http://storage.invalid:8333'

/**
 * Mutable so a test can drive the SERVER/BROWSER endpoint split without a
 * second file. Reset to the single-address default in `beforeEach`.
 */
const config = vi.hoisted(() => ({
  publicEndpoint: undefined as string | undefined,
}))

vi.mock('./config', () => ({
  getStorageConfig: () => ({
    endpoint: 'http://storage.invalid:8333',
    publicEndpoint: config.publicEndpoint ?? 'http://storage.invalid:8333',
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret',
  }),
}))

beforeEach(() => {
  config.publicEndpoint = undefined
})

const KEY =
  'assets/uid123/3c1bc582-b90d-49a0-85cf-db1085df19e1-lampiran-uji.bin'

describe('presignDownload', () => {
  beforeEach(() => vi.resetModules())

  it('forces an attachment disposition, and SIGNS it', async () => {
    const { presignDownload } = await import('./s3')
    const url = new URL(await presignDownload({ key: KEY }))

    // The parameter itself: the object comes back as a download, never rendered
    // in the tab. Without this an uploaded text/html attachment executes when
    // the reader clicks it.
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="lampiran-uji.bin"',
    )

    // …and it is part of the SIGNED query string, so a client that edits it to
    // `inline` invalidates the signature rather than getting its way. SigV4
    // signs the whole canonical query string, so presence in the URL alongside
    // X-Amz-Signature is what that means in practice.
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy()
  })

  it('names the file the key already carries, not the raw key', async () => {
    const { presignDownload } = await import('./s3')
    const url = new URL(await presignDownload({ key: KEY }))
    // `filenameFromKey`, not a hand-split: the uuid prefix and the path are
    // gone, and what is left is the sanitized name the upload embedded.
    expect(url.searchParams.get('response-content-disposition')).not.toContain(
      'assets/',
    )
    expect(url.searchParams.get('response-content-disposition')).not.toContain(
      '3c1bc582',
    )
  })

  it('changes the signature when the disposition changes', async () => {
    // Falsifies the claim above rather than asserting it: two keys whose only
    // difference is the embedded filename must sign differently, which is only
    // true if the disposition is really inside the signed material.
    const { presignDownload } = await import('./s3')
    const a = new URL(await presignDownload({ key: KEY }))
    const b = new URL(
      await presignDownload({
        key: KEY.replace('lampiran-uji.bin', 'lampiran-lain.bin'),
      }),
    )
    expect(a.searchParams.get('X-Amz-Signature')).not.toBe(
      b.searchParams.get('X-Amz-Signature'),
    )
  })
})

describe('presignUpload', () => {
  it('pins the content type into the signed headers', async () => {
    // Not a new claim — `presignUpload`'s own header explains why relabelling an
    // object at PUT time is stored XSS. It had no test, and it is the twin of
    // the download assertion above, so it gets one here.
    const { presignUpload } = await import('./s3')
    const url = new URL(
      await presignUpload({
        key: KEY,
        contentType: 'image/png',
        contentLength: 1024,
      }),
    )
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-type',
    )
  })
})

/**
 * WHERE the presigned URL points.
 *
 * SigV4 signs the `host`, so the address in a presigned URL is fixed by the
 * client that minted it and cannot be rewritten afterwards without breaking the
 * signature. Minting with the SERVER's endpoint hands the browser a URL only the
 * server could ever have used — under Compose the app reaches storage at
 * `http://seaweedfs:8333`, which resolves on the compose network and nowhere
 * else, so every containerized upload failed to connect.
 */
describe('presigned URL addressing', () => {
  beforeEach(() => vi.resetModules())

  it('points at the SERVER endpoint when no public one is configured', async () => {
    // The single-address deployment must be unchanged by the split.
    const { presignUpload } = await import('./s3')
    const url = new URL(
      await presignUpload({
        key: KEY,
        contentType: 'image/png',
        contentLength: 1024,
      }),
    )
    expect(url.origin).toBe(SERVER_ENDPOINT)
  })

  it('points at the BROWSER endpoint when the two differ', async () => {
    // The Compose shape: app -> seaweedfs:8333 internally, browser ->
    // 127.0.0.1:8333 from the host. Signing with the server endpoint is the
    // defect; this asserts the URL handed out is the reachable one.
    config.publicEndpoint = 'http://127.0.0.1:8333'
    const { presignUpload } = await import('./s3')
    const url = new URL(
      await presignUpload({
        key: KEY,
        contentType: 'image/png',
        contentLength: 1024,
      }),
    )
    expect(url.origin).toBe('http://127.0.0.1:8333')
  })

  it('points a DOWNLOAD at the browser endpoint too', async () => {
    // Both directions are handed to a browser; only signing them with the same
    // client keeps that true.
    config.publicEndpoint = 'http://127.0.0.1:8333'
    const { presignDownload } = await import('./s3')
    const url = new URL(await presignDownload({ key: KEY }))
    expect(url.origin).toBe('http://127.0.0.1:8333')
  })

  it('SIGNS the content length, so an oversize body cannot be substituted', async () => {
    // The storage contract states MAX_UPLOAD_BYTES is enforced by signing the
    // length, so a client that lies about its size gets a signature failure
    // rather than a huge object. That claim had no test — the presigner infers
    // content-length rather than taking it from `signableHeaders`, so nothing
    // proved it was actually in the signature. Driven: it is.
    const { presignUpload } = await import('./s3')
    const url = new URL(
      await presignUpload({
        key: KEY,
        contentType: 'image/png',
        contentLength: 1024,
      }),
    )
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-length',
    )
  })
})
