/**
 * Validate a caller-supplied redirect target down to a SAME-ORIGIN RELATIVE PATH,
 * or fall back. The one guard against an OPEN REDIRECT — a `?next=` (or a form's
 * return destination) that bounces a freshly-authed user off-site to a phishing
 * clone.
 *
 * Shared, not inlined, because more than one boundary asks the same question: the
 * login form deciding where to send a user after sign-in (`?next`), and any
 * list-modal flow deciding where to return after a submit. One rule, one place to
 * get right.
 *
 * The test is `^/` (starts at the site root) AND the character after it is
 * NEITHER `/` NOR `\`. Those are the three ways a value that begins with a slash
 * still escapes the origin:
 *
 * - `https://evil.com` — absolute; no leading `/`, so `^/` already rejects it.
 * - `//evil.com` — protocol-relative; the browser reads it as `https://evil.com`.
 * - `/\evil.com` — a backslash the browser normalises to `/`, i.e. `//evil.com`.
 *
 * Anything that is not a plain `/path` (including `null`, `''`, a bare relative
 * `foo`, or a whitespace-led value) returns `fallback`.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback: string,
): string {
  return raw && /^\/(?![/\\])/.test(raw) ? raw : fallback
}
