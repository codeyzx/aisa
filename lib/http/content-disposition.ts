/**
 * The ONE place `Content-Disposition` is spelled — for a response this server
 * writes AND for the `response-content-disposition` a presigned storage URL
 * carries. Both are the same header with the same escaping rules, and the two
 * consumers sit in different layers (`lib/export/download.ts`,
 * `lib/storage/s3.ts`), so the string lives here rather than in either of them.
 * A second copy is how one download starts forcing a save and the other quietly
 * opens inline.
 *
 * Pure and dependency-free: no `server-only`, no credentials, nothing to stub —
 * the escaping is the whole risk surface and it is asserted in a plain unit test.
 *
 * ALWAYS `attachment`, never `inline`, and there is no parameter to ask for
 * `inline`. A download route hands over a file the user asked to KEEP; rendering
 * it in the tab instead is how an uploaded `.html` or `.svg` gets executed
 * against whatever origin served it. If a project ever genuinely needs an
 * inline viewer, that is a new function with its own argument, not a flag here.
 */

/**
 * Characters RFC 8187 §3.2.1 permits unescaped in an `ext-value`, minus the ones
 * `encodeURIComponent` already leaves alone. `encodeURIComponent` does not
 * escape `!'()*~`, and of those only `!` and `~` are `attr-char`; the rest must
 * be percent-encoded by hand or a filename containing them produces a header a
 * strict parser rejects.
 */
const NON_ATTR_CHAR = /['()*]/g

/**
 * Percent-encode a filename for the `filename*` parameter (RFC 8187 `ext-value`).
 */
function encodeExtValue(filename: string): string {
  return encodeURIComponent(filename).replace(
    NON_ATTR_CHAR,
    (character) =>
      `%${character.codePointAt(0)?.toString(16).toUpperCase().padStart(2, '0')}`,
  )
}

/** Escape for the quoted-string form: backslash first, then the quote. */
function quote(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/**
 * Build an `attachment` disposition naming `filename`.
 *
 * Throws on an empty name or a control character. These names are SERVER-MINTED
 * (an entity code, a dataset name, a sanitized object key — never a string a
 * user typed straight through), so a violation is a BUG in the caller, and a
 * loud throw is right: silently mangling it would put whatever slipped through
 * into a response header, which is the one place a newline is an exploit rather
 * than a typo.
 *
 * ── WHY TWO PARAMETERS FOR A NON-ASCII NAME ──────────────────────────────────
 * An HTTP header value is bytes, and a bare `filename="…"` carrying UTF-8 is
 * read as latin-1 by anything that follows the older grammar — `Ringkasan
 * Café.pdf` saves as `Ringkasan CafÃ©.pdf`. RFC 6266 §4.3's answer is to send
 * BOTH: a plain `filename` an old parser can read, and a `filename*` in
 * `UTF-8''` an RFC 8187 parser prefers. Emitting only `filename*` would be
 * correct by the newer spec and would leave the oldest clients with no name at
 * all, so the pair is the compatible answer, not belt-and-braces.
 *
 * The ASCII fallback replaces each non-ASCII character with `_` rather than
 * transliterating: a transliteration table is a locale-shaped guess, and the
 * fallback only has to be a legible, unambiguous filename — the accurate name is
 * already in `filename*`, which every current browser reads.
 *
 * A pure-ASCII name gets the single plain parameter and nothing else. That keeps
 * the common case — every filename this repo currently mints — byte-identical to
 * what it was before `filename*` existed here.
 */
export function attachmentDisposition(filename: string): string {
  if (!filename) throw new TypeError('Download filename must not be empty')

  let hasNonAscii = false
  for (const character of filename) {
    const code = character.codePointAt(0)
    if (code === undefined) continue
    if (code <= 0x1f || code === 0x7f) {
      throw new TypeError(
        'Download filename must not contain control characters',
      )
    }
    if (code > 0x7f) hasNonAscii = true
  }

  if (!hasNonAscii) return `attachment; filename="${quote(filename)}"`

  const ascii = [...filename]
    .map((character) =>
      (character.codePointAt(0) ?? 0) > 0x7f ? '_' : character,
    )
    .join('')
  return `attachment; filename="${quote(ascii)}"; filename*=UTF-8''${encodeExtValue(filename)}`
}
