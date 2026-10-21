import { describe, expect, it } from 'vitest'

import { downloadResponse } from './download'

/**
 * The header's own escaping, encoding and refusals are asserted where they live
 * — `lib/http/content-disposition.test.ts`. What is left for THIS file is the
 * part `downloadResponse` actually owns: that the response carries the body, the
 * caller's content type, and a disposition that came from that shared builder
 * rather than a second local copy.
 */
describe('downloadResponse', () => {
  it('returns bytes with a typed attachment filename', async () => {
    const response = downloadResponse(new Uint8Array([1, 2, 3]), {
      contentType: 'application/octet-stream',
      filename: 'report (final).csv',
      correlationId: 'cid-abc',
    })

    expect(response.headers.get('Content-Type')).toBe(
      'application/octet-stream',
    )
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="report (final).csv"',
    )
    await expect(response.bytes()).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })

  it('carries a non-ASCII filename through to the RFC 8187 parameter', () => {
    // Proves the delegation, not the encoding: if this ever regressed to a
    // locally built quoted-string, the `filename*` half would silently vanish
    // and the name would arrive as mojibake.
    const response = downloadResponse(new Uint8Array(), {
      contentType: 'application/pdf',
      filename: 'Ringkasan Café.pdf',
      correlationId: 'cid-abc',
    })
    expect(response.headers.get('Content-Disposition')).toContain(
      "filename*=UTF-8''Ringkasan%20Caf%C3%A9.pdf",
    )
  })

  it('echoes the correlation id, the only handle a bad file leaves behind', () => {
    // Bytes cannot carry an envelope, so this header is the ONLY way a reader
    // holding a wrong or truncated file can point at a server log line.
    const response = downloadResponse(new Uint8Array(), {
      contentType: 'text/csv',
      filename: 'report.csv',
      correlationId: 'cid-xyz',
    })
    expect(response.headers.get('x-correlation-id')).toBe('cid-xyz')
  })

  it('refuses a filename that could break the header', () => {
    expect(() =>
      downloadResponse(new Uint8Array(), {
        contentType: 'text/csv',
        filename: '',
        correlationId: 'cid-abc',
      }),
    ).toThrow('Download filename must not be empty')
    expect(() =>
      downloadResponse(new Uint8Array(), {
        contentType: 'text/csv',
        filename: 'report\r\nX-Injected: value.csv',
        correlationId: 'cid-abc',
      }),
    ).toThrow('Download filename must not contain control characters')
  })
})
