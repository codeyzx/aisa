import 'server-only'

/**
 * S3-compatible object storage; the rules live in
 * docs/reference/contracts/storage.md. GENERIC by construction: nothing here
 * names a backend. The default deployment is self-hosted SeaweedFS and the
 * managed alternative is Cloudflare R2 — swapping them is an `S3_*` env change
 * and nothing else. `forcePathStyle` is on because self-hosted backends serve
 * `<endpoint>/<bucket>/<key>`, not virtual-host style; R2 accepts it too.
 *
 * `server-only` is load-bearing: this module reads `getStorageConfig()`, which
 * holds the secret access key. A client import fails the BUILD rather than
 * shipping a credential to the browser.
 *
 * Default flow is the presigned direct upload (`presignUpload`): bytes go
 * browser -> storage, never through the Next server, so an upload costs no
 * serverless body-size limit and no bandwidth.
 */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { attachmentDisposition } from '@/lib/http/content-disposition'

import { getStorageConfig } from './config'
import { filenameFromKey } from './keys'

/**
 * Presigned-URL lifetime. A presigned URL is a bearer credential: whoever holds
 * it has the access, so the TTL is the blast radius of a leak (browser history,
 * a Referer header, a shared screenshot, an access log, a chat paste).
 *
 * 5 minutes is the deliberate floor-ish middle: long enough for a large file on
 * a slow mobile link to *finish* (the clock stops when the PUT/GET starts, not
 * when it completes — only initiation must beat the deadline), short enough that
 * a leaked URL is almost always dead on arrival. AWS's own 15-minute default is
 * looser than this boilerplate wants; callers who genuinely need longer pass
 * `expiresInSeconds` explicitly at the call site, where it is reviewable.
 */
export const PRESIGN_TTL_SECONDS = 300

const globalForS3 = globalThis as typeof globalThis & {
  storageS3Client?: S3Client
  storagePresignClient?: S3Client
}

function createClient(endpoint: string): S3Client {
  const config = getStorageConfig()
  return new S3Client({
    endpoint,
    region: config.region,
    // Self-hosted S3 servers have no per-bucket DNS; keep keys in the path.
    forcePathStyle: true,
    // REQUIRED for presigned uploads to work at all. Since v3.729 the SDK
    // defaults to WHEN_SUPPORTED, which computes a CRC32 of the body and pins it
    // into the request. While PRESIGNING there is no body, so it pins the CRC32
    // of an EMPTY body (`x-amz-checksum-crc32=AAAAAA==`) into the query string —
    // then the browser PUTs real bytes and the backend rejects it with
    // `BadDigest`. WHEN_REQUIRED omits the checksum for PutObject and keeps it
    // for the operations that mandate one. Verified against SeaweedFS: without
    // this, every presigned PUT 400s.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

/**
 * The shared client, bound to the endpoint THE SERVER reaches storage at. Lazy
 * (importing this module touches no credentials) and cached on `globalThis` so
 * dev HMR reloads reuse one connection pool.
 *
 * Use this for everything the server does itself — copy, delete, server-side
 * put. NEVER for presigning; see `presignClient`.
 */
export function s3Client(): S3Client {
  return (globalForS3.storageS3Client ??= createClient(
    getStorageConfig().endpoint,
  ))
}

/**
 * The client used to MINT PRESIGNED URLS, bound to the endpoint the BROWSER
 * reaches storage at.
 *
 * SigV4 signs the `host`, so the address in a presigned URL is decided by the
 * client that minted it and cannot be rewritten afterwards without invalidating
 * the signature. Minting with the server's endpoint therefore hands the browser
 * a URL only the server could have used: under Compose the app talks to
 * `http://seaweedfs:8333`, which resolves on the compose network and nowhere
 * else, so every upload failed to connect the moment the app ran in a container.
 *
 * When the two endpoints are the same — the host dev path, and any deployment
 * where one address serves both — this IS `s3Client()`, so the common case pays
 * for no second client and no second connection pool.
 */
function presignClient(): S3Client {
  const { endpoint, publicEndpoint } = getStorageConfig()
  if (publicEndpoint === endpoint) return s3Client()
  return (globalForS3.storagePresignClient ??= createClient(publicEndpoint))
}

/** The configured bucket. Read through here, never off the config directly. */
export function bucket(): string {
  return getStorageConfig().bucket
}

export interface PresignUploadInput {
  /** Build it with `buildKey` — never accept a key from the client. */
  key: string
  /** Signed into the URL: the PUT must send this exact `Content-Type`. */
  contentType: string
  /** Signed into the URL: the PUT body must be exactly this many bytes. */
  contentLength: number
  expiresInSeconds?: number
}

/**
 * Presign a direct browser PUT. The returned URL authorizes exactly one key, at
 * exactly one content type, at exactly one size — the client cannot rename the
 * object, relabel it, or send more bytes than agreed without breaking the
 * signature.
 */
export function presignUpload({
  key,
  contentType,
  contentLength,
  expiresInSeconds = PRESIGN_TTL_SECONDS,
}: PresignUploadInput): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })
  return getSignedUrl(presignClient(), command, {
    expiresIn: expiresInSeconds,
    // `signableHeaders` is load-bearing, not decoration. The presigner signs
    // `host` (+ content-length, which it infers) but NOT content-type by
    // default, so without this the client can relabel the object at PUT time —
    // e.g. upload `text/html` under a key you believed was an image, which is
    // stored XSS the moment the bucket is served on your origin. Verified: with
    // this set, a content-type swap gets 403 instead of 200.
    signableHeaders: new Set(['content-type']),
  })
}

export interface PresignDownloadInput {
  key: string
  expiresInSeconds?: number
}

/**
 * Presign a time-boxed GET, so the bucket itself can stay fully private.
 *
 * ⚠️ `ResponseContentDisposition` IS THE SECURITY-RELEVANT PART, not a nicety.
 * Without it the object is served with whatever `Content-Type` it was uploaded
 * under and NO disposition, so the browser renders it: an attachment uploaded as
 * `text/html` or `image/svg+xml` executes its own script when the reader clicks
 * "download". The bytes are user-supplied — that is the entire point of an
 * upload field — so this must force a save, and the same
 * `attachmentDisposition` the app's own download routes use is what says so.
 * Signing it also means the client cannot strip it: change the parameter and the
 * signature fails, exactly like the `content-type` pinning on `presignUpload`.
 *
 * The filename comes from `filenameFromKey` — the key's OWN embedded copy, which
 * `sanitizeFilename` already reduced to `[A-Za-z0-9._-]`. So this is the one
 * caller that can never reach the non-ASCII branch, and it is also the one whose
 * name most nearly came from a user. Both facts are the sanitizer's doing, not
 * this function's, which is why it does not re-sanitize here.
 */
export function presignDownload({
  key,
  expiresInSeconds = PRESIGN_TTL_SECONDS,
}: PresignDownloadInput): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: attachmentDisposition(filenameFromKey(key)),
  })
  return getSignedUrl(presignClient(), command, { expiresIn: expiresInSeconds })
}

export interface PutInput {
  key: string
  body: Uint8Array | string
  contentType: string
}

/**
 * Server-side upload. NOT the default path — prefer `presignUpload` for anything
 * the browser holds. Use this for bytes the server itself owns (a generated
 * export, a thumbnail, a seeded fixture).
 */
export async function put({ key, body, contentType }: PutInput): Promise<void> {
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export interface DeleteObjectInput {
  key: string
}

/**
 * Delete an object. Named `deleteObject`, not `delete` — the latter is a
 * reserved word and cannot be a function declaration. S3 delete is idempotent:
 * removing a missing key succeeds.
 */
export async function deleteObject({ key }: DeleteObjectInput): Promise<void> {
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

export interface MoveObjectInput {
  sourceKey: string
  destKey: string
}

export interface MoveObjectResult {
  /**
   * False when the copy succeeded but the staging source could not be deleted.
   * The move still SUCCEEDED — the destination exists — and the leftover is
   * TTL-reaped. Callers log it; none may treat it as a failed move.
   */
  sourceDeleted: boolean
}

/**
 * Move an object server-side: copy `sourceKey` → `destKey`, then delete the
 * source. Both keys must come from the key layer (`promoteKey`), never the
 * client. No bytes pass through the app server — the backend copies within
 * itself — so promoting a submitted upload out of the reaped `uploads/` prefix
 * costs no bandwidth (see docs/reference/contracts/storage.md).
 *
 * `CopySource` is `<bucket>/<key>` with each KEY SEGMENT percent-encoded but the
 * slashes left LITERAL. Encoding the whole string (slashes and all) is the AWS
 * docs' shorthand and works on AWS, but a self-hosted, path-style gateway that
 * splits the bucket from the key on a real `/` before decoding would then find
 * `%2F` where it expected a separator and never locate the object. Keeping the
 * separators literal works on both; `buildKey` already narrows names to
 * `[A-Za-z0-9._-]`, so the per-segment encode is a no-op today and stays correct
 * the day a key carries a reserved char. Copy first and only delete on its
 * success — a failed copy leaves the source intact rather than losing the bytes
 * to a half-done move.
 *
 * ── THE TWO PARTIAL FAILURES, AND WHY NEITHER MAY THROW NAIVELY ──────────────
 * "Copy then delete" has two outcomes between success and failure, and treating
 * either as a plain throw loses data or money:
 *
 *  - AMBIGUOUS COPY. S3's CopyObject can answer **HTTP 200 with an error inside
 *    the body**, which the SDK resolves rather than rejects. Deleting the source
 *    on that promise is silent DATA LOSS: source gone, destination never
 *    written, and the document that follows points at a key with no object. So
 *    the response is inspected — no `CopyObjectResult` means the copy did not
 *    happen, and the source is left alone.
 *  - DELETE FAILURE AFTER A GOOD COPY. The bytes ARE durable; only the staging
 *    original survives. Throwing here would abandon a durable object the caller
 *    never learns about — an orphan that bills forever, since the reaper covers
 *    only the staging prefix. That is not a failure of the move: it is a move
 *    that succeeded with a leftover, so it RETURNS and reports `sourceDeleted:
 *    false`. The leftover sits under the TTL-reaped staging prefix, so the
 *    bucket cleans it up; the caller logs it because a delete that fails is
 *    worth knowing about, not because anything is at risk.
 */
export async function moveObject({
  sourceKey,
  destKey,
}: MoveObjectInput): Promise<MoveObjectResult> {
  const copySource = `${bucket()}/${sourceKey
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const copied = await s3Client().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      CopySource: copySource,
      Key: destKey,
    }),
  )

  // The 200-with-an-error-body case. Refuse to treat it as a copy, and above all
  // do NOT reach the delete below.
  if (!copied.CopyObjectResult?.ETag) {
    throw new Error(
      `copy ${sourceKey} -> ${destKey} returned no CopyObjectResult; refusing to delete the source`,
    )
  }

  try {
    await s3Client().send(
      new DeleteObjectCommand({ Bucket: bucket(), Key: sourceKey }),
    )
  } catch {
    // Deliberately swallowed — see the header. The destination exists, which is
    // what the caller asked for; reporting it as a failure would strand that
    // durable object with nobody holding a reference to clean it up.
    return { sourceDeleted: false }
  }

  return { sourceDeleted: true }
}
