import { describe, expect, it } from 'vitest'

import { MAX_UPLOAD_BYTES } from './limits'
import { UploadUrlRequestSchema } from './upload.contract'

describe('UploadUrlRequestSchema', () => {
  it('accepts the browser presign payload', () => {
    expect(
      UploadUrlRequestSchema.safeParse({
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        size: MAX_UPLOAD_BYTES,
      }).success,
    ).toBe(true)
  })

  it('keeps the signed size limit at the route boundary', () => {
    expect(
      UploadUrlRequestSchema.safeParse({
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        size: MAX_UPLOAD_BYTES + 1,
      }).success,
    ).toBe(false)
  })
})
