import * as z from 'zod'

import { MAX_UPLOAD_BYTES } from './limits'

/** The JSON body accepted by the direct-upload presign endpoint. */
export const UploadUrlRequestSchema = z.object({
  // Untrusted: sanitized by `buildKey`, never used as a path as-is.
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  // Signed into the URL, so this is enforced by storage, not merely asserted.
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})

export type UploadUrlRequest = z.infer<typeof UploadUrlRequestSchema>

/** The successful data payload inside the API envelope. */
export interface UploadUrlResponse {
  key: string
  url: string
}
