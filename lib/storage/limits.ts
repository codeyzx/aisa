/**
 * Storage limits shared by the server and the browser (see
 * docs/reference/contracts/storage.md).
 *
 * Deliberately its OWN module, with no `server-only` and no credential-touching
 * import: `hooks/use-upload.ts` runs in the browser and needs this number, and
 * importing it from `lib/storage/s3.ts` would drag that module's `server-only`
 * marker (and the S3 secret it reads) into the client bundle — a build failure
 * at best, a leaked credential at worst.
 *
 * Keep this file free of anything that is not a plain constant.
 */

/**
 * Ceiling for a presigned browser upload, enforced by SIGNING the content length
 * into the URL (see `presignUpload`), so storage itself rejects a mismatched
 * body. A client that lies about its size gets a signature failure, not a huge
 * object in the bucket. Without a signed length, a presigned PUT is an unbounded
 * write. The browser-side check in `useUpload` is only a fast, friendly
 * pre-flight — this constant is enforced server-side.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
