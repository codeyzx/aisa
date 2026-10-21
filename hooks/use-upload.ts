import * as React from 'react'

import { apiFetch } from '@/lib/api/client'
import { MAX_UPLOAD_BYTES } from '@/lib/storage/limits'
import type {
  UploadUrlRequest,
  UploadUrlResponse,
} from '@/lib/storage/upload.contract'

/**
 * Presigned direct upload, browser side.
 *
 * Two hops, and the second one does NOT touch the Next server:
 *   1. POST /api/storage/upload-url -> the server auth-gates, derives the key
 *      from the session uid, and signs a one-shot URL.
 *   2. PUT the bytes straight to object storage using that URL.
 *
 * So the file never transits the app server: no serverless body-size cap, no
 * bandwidth bill, no memory spike. The caller gets back the `key` — the only
 * durable handle — and is expected to persist it (e.g. on a Firestore doc).
 *
 * Note the import: `MAX_UPLOAD_BYTES` comes from `lib/storage/limits`, NOT from
 * `lib/storage/s3`. The latter is `server-only` and reads the S3 secret, so
 * importing it here would pull a credential-bearing module into the browser
 * bundle. The shared constant lives in its own dependency-free module for
 * exactly that reason.
 *
 * Hop 1 goes through `apiFetch` (our route, our envelope). Hop 2 deliberately
 * does NOT — see the PUT below.
 */

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export interface UseUploadResult {
  upload: (file: File) => Promise<string | null>
  reset: () => void
  status: UploadStatus
  /** User-safe message. Never contains a storage/server internal. */
  error: string | null
  /** The object key of the last successful upload. Persist this. */
  key: string | null
}

export function useUpload(): UseUploadResult {
  const [status, setStatus] = React.useState<UploadStatus>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [key, setKey] = React.useState<string | null>(null)

  const reset = React.useCallback(() => {
    setStatus('idle')
    setError(null)
    setKey(null)
  }, [])

  const upload = React.useCallback(async (file: File) => {
    setStatus('uploading')
    setError(null)
    setKey(null)

    // Fail fast and locally on size: the presign would refuse anyway, but this
    // saves a round-trip and gives a better message. This is UX, NOT the guard —
    // the real limit is signed into the URL server-side.
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('error')
      setError(`Berkas lebih besar dari ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`)
      return null
    }

    // A browser may report an empty type for an unknown extension. Pick the
    // fallback ONCE and use the same value for the presign and the PUT — they
    // must match exactly or the signature fails.
    const contentType = file.type || 'application/octet-stream'

    try {
      // `apiFetch` never throws — a network failure resolves to an UNAVAILABLE
      // envelope — so one branch on `res.ok` covers every way this can fail.
      const uploadRequest: UploadUrlRequest = {
        filename: file.name,
        contentType,
        size: file.size,
      }
      const presignRes = await apiFetch<UploadUrlResponse>(
        '/api/storage/upload-url',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(uploadRequest),
        },
      )
      if (!presignRes.ok) {
        // The server's message, not a locally re-derived one.
        // `lib/api/errors.contract.ts:API_ERROR_MESSAGE` already owns the code -> message
        // mapping; a status ladder here (401/403/else) would be a second
        // taxonomy for the same fact, keyed off the status line — exactly the
        // inversion `lib/api/client.ts` refuses to do.
        setStatus('error')
        setError(presignRes.error.message)
        return null
      }
      const { key: objectKey, url } = presignRes.data

      // Straight to storage — a RAW `fetch` on purpose. This hop does not reach
      // our server: it is object storage speaking S3, so there is no envelope
      // and no cid, and `apiFetch` would report a perfectly good 200 as
      // UNAVAILABLE for failing `isApiResponse`. `content-type` MUST equal the
      // signed value or the signature fails.
      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: file,
      })
      if (!putRes.ok) {
        // Storage ANSWERED and refused — an expired signature, a content-type
        // that no longer matches the signed one, a bucket policy. Retrying the
        // same PUT cannot help; the remedy is to pick the file again so a fresh
        // URL is signed.
        setStatus('error')
        setError('Gagal mengunggah berkas. Coba pilih berkas itu lagi.')
        return null
      }

      setStatus('success')
      setKey(objectKey)
      return objectKey
    } catch {
      // Storage was never REACHED — offline, DNS, CORS, an aborted tab. A
      // different fact from the refusal above and a different remedy (wait and
      // retry, unchanged), so it gets its own sentence rather than sharing one.
      //
      // In the product language, like every other string a reader sees. This was
      // the last English string in the UI, and it sat on the branch a developer
      // on a good connection never reaches — which is exactly how it survived.
      setStatus('error')
      setError('Tidak dapat menghubungi penyimpanan. Coba lagi.')
      return null
    }
  }, [])

  return { upload, reset, status, error, key }
}
