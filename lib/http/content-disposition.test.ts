import { describe, expect, it } from 'vitest'

import { attachmentDisposition } from './content-disposition'

describe('attachmentDisposition', () => {
  it('always says attachment, never inline', () => {
    // The disposition TYPE is the security-relevant half of this header, and
    // there is no argument that can change it — so the assertion is on every
    // shape of name, not just one.
    for (const filename of ['a.csv', 'Ringkasan Café.pdf', 'x'.repeat(200)]) {
      expect(attachmentDisposition(filename)).toMatch(/^attachment;/)
      expect(attachmentDisposition(filename)).not.toContain('inline')
    }
  })

  it('emits a single plain parameter for an ASCII name', () => {
    // Every filename this repo currently mints is ASCII (a dataset name, an
    // entity code, a sanitized object key), so this is THE shipped case: it must
    // stay byte-identical to the pre-RFC-8187 header.
    expect(attachmentDisposition('report (final).csv')).toBe(
      'attachment; filename="report (final).csv"',
    )
    expect(attachmentDisposition('assets-retired.csv')).toBe(
      'attachment; filename="assets-retired.csv"',
    )
  })

  it('escapes a quote and a backslash so neither can end the parameter', () => {
    expect(attachmentDisposition(String.raw`a"b\c.csv`)).toBe(
      String.raw`attachment; filename="a\"b\\c.csv"`,
    )
  })

  it('sends both parameters for a non-ASCII name', () => {
    // RFC 6266 §4.3: an old parser reads `filename`, a current one prefers
    // `filename*`. Both must be present and they must name the same file.
    expect(attachmentDisposition('Ringkasan Café.pdf')).toBe(
      'attachment; filename="Ringkasan Caf_.pdf"; ' +
        "filename*=UTF-8''Ringkasan%20Caf%C3%A9.pdf",
    )
  })

  it('percent-encodes the characters encodeURIComponent leaves behind', () => {
    // `'`, `(`, `)` and `*` are not RFC 8187 attr-chars, and encodeURIComponent
    // does not touch them — a header built on it alone is rejected by a strict
    // parser. Driven with a non-ASCII character so the `filename*` branch runs.
    const header = attachmentDisposition("caf'é(1)*.csv")
    expect(header).toContain("filename*=UTF-8''caf%27%C3%A9%281%29%2A.csv")
  })

  it('encodes a name that is entirely non-ASCII', () => {
    expect(attachmentDisposition('日本語.txt')).toBe(
      'attachment; filename="___.txt"; ' +
        "filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt",
    )
  })

  it('rejects an empty name and every control character', () => {
    expect(() => attachmentDisposition('')).toThrow(
      'Download filename must not be empty',
    )
    // Why this throws rather than strips: a stripped newline is a silent
    // near-miss, and the next caller never learns it was building a header.
    // The guard is a RANGE, not a CR/LF special case, so a NUL and a DEL — both
    // equally not header bytes — must be refused by the same rule. Written as
    // escapes: a raw control byte in a source file is invisible to review.
    for (const hostile of [
      'report\r\nX-Injected: value.csv',
      `report${String.fromCodePoint(0)}.csv`,
      `report${String.fromCodePoint(0x7f)}.csv`,
    ]) {
      expect(() => attachmentDisposition(hostile)).toThrow(
        'Download filename must not contain control characters',
      )
    }
  })
})
