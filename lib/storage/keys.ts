/**
 * Object-key construction (see docs/reference/contracts/storage.md). Deliberately
 * paranoid, because a key IS a path: the
 * bucket has no directories, so `a/../b` is not resolved by anything — but every
 * consumer downstream (a proxy, a CDN, an unzip, a filesystem mirror, a URL) may
 * resolve it. A user-supplied filename that reaches a key unsanitized is how you
 * get path traversal out of the bucket and cross-tenant writes inside it.
 *
 * Pure + dependency-free on purpose: no credentials, no server-only import, so
 * the key layout can be asserted in a plain unit test.
 */

/**
 * Everything the sanitizer emits is inside this set, so a key never needs URL
 * encoding and can never be re-decoded into something else (the `%2e%2e%2f`
 * double-decode trick dies here — `%` is not in the set).
 */
const ALLOWED_FILENAME_CHARS = /[^a-zA-Z0-9._-]/g

/**
 * Caller-controlled segments must already be this shape. Must start
 * alphanumeric, so a segment can never be `.`, `..`, or `-flag`-like.
 */
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

/**
 * S3 caps a key at 1024 bytes. We cap the *filename* far below that so the
 * fixed parts (prefix, owner, uuid) can never be pushed out of a valid key by a
 * pathologically long upload name.
 */
const MAX_FILENAME_LENGTH = 80

/** Used when sanitizing consumes the whole name (e.g. `..`, `...`, `///`). */
const FALLBACK_FILENAME = 'file'

/**
 * The two lifecycle prefixes, and the split IS the orphan model (see
 * docs/reference/contracts/storage.md):
 *
 * - `uploads/` is STAGING. An object here may never be submitted, so an
 *   unreferenced staging object is EXPECTED, not a leak — a backend lifecycle
 *   rule expires the whole prefix after a day (docs/how-to/deploy.md).
 * - `assets/` is DURABLE. An object reaches it only by being promoted on submit,
 *   so it is referenced by a doc and the expiry rule must never touch it.
 *
 * A referenced object left under `uploads/` would be deleted by that same rule —
 * data loss — which is why submit PROMOTES it across the boundary.
 */
export const STAGING_PREFIX = 'uploads'
export const DURABLE_PREFIX = 'assets'

const UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(.+)$/i

export interface StorageKeyParts {
  prefix: string
  ownerId: string
  filename: string
}

/**
 * Parse only keys minted by buildKey. This is the single authorization-safe
 * interpretation of the object-key layout; callers never split a key themselves.
 */
export function parseStorageKey(key: string): StorageKeyParts | null {
  const segments = key.split('/')
  if (segments.length !== 3) return null
  const [prefix, ownerId, objectName] = segments
  if (!prefix || !ownerId || !objectName) return null
  if (!SAFE_SEGMENT.test(prefix) || !SAFE_SEGMENT.test(ownerId)) return null
  const match = UUID_PREFIX.exec(objectName)
  if (!match || !match[1]) return null
  return { prefix, ownerId, filename: match[1] }
}

/** True only when the key belongs to the exact namespace and session owner. */
export function isStorageKeyForOwner(
  key: string,
  prefix: string,
  ownerId: string,
): boolean {
  const parsed = parseStorageKey(key)
  return parsed?.prefix === prefix && parsed.ownerId === ownerId
}

/**
 * Map a staging key to its durable counterpart, idempotently.
 *
 * - Under `uploads/` → swap the prefix for `assets/`, keeping the rest of the
 *   key (owner, uuid, name) byte-for-byte, so the object's identity survives the
 *   move and `filenameFromKey` still inverts it.
 * - Already under `assets/` → return unchanged. An edit that does not replace the
 *   attachment re-promotes the key it already holds; that must be a no-op, not a
 *   second move of a durable object.
 * - Anything else → throw. These keys come from app code and the verified
 *   session, so a foreign prefix is a BUG; reject it loudly at the boundary
 *   rather than silently promoting a key from an unknown namespace.
 */
export function promoteKey(key: string): string {
  if (key.startsWith(`${STAGING_PREFIX}/`)) {
    return `${DURABLE_PREFIX}/${key.slice(STAGING_PREFIX.length + 1)}`
  }
  if (key.startsWith(`${DURABLE_PREFIX}/`)) return key
  throw new Error(
    `Cannot promote storage key ${JSON.stringify(key)}: not under ${STAGING_PREFIX}/ or ${DURABLE_PREFIX}/`,
  )
}

export interface BuildKeyInput {
  /** Namespace for the kind of object, e.g. `avatars`. Caller-controlled. */
  prefix: string
  /** Tenant scope. Pass the session uid — never a client-supplied id. */
  ownerId: string
  /** UNTRUSTED. The user's original filename; kept only for human legibility. */
  filename: string
}

/**
 * Reduce an untrusted filename to a safe, single, non-empty key segment.
 *
 * Order matters and each step earns its place:
 * 1. NFKC normalize FIRST, so unicode look-alikes that fold to a separator are
 *    exposed *before* separators are stripped (U+FF0F FULLWIDTH SOLIDUS -> `/`,
 *    U+2025 TWO DOT LEADER -> `..`). Normalizing last would let them through.
 * 2. Keep the basename only — everything up to the last POSIX or Windows
 *    separator is discarded. `../../etc/passwd`, `/etc/passwd`, `C:\boot.ini`
 *    and `a/b/c.png` all collapse to their final segment.
 * 3. Whitelist, never blacklist. Anything outside `[A-Za-z0-9._-]` becomes `-`.
 *    This is the step that kills NUL bytes (`shell.php\0.png`), control chars,
 *    CR/LF header injection, RTL overrides, spaces, quotes, `?`, `#`, `%`.
 * 4. Strip leading dots, so a segment can never be `..` or a dotfile.
 * 5. Truncate, then fall back if nothing survived.
 */
export function sanitizeFilename(filename: string): string {
  const normalized = filename.normalize('NFKC')
  const basename = normalized.split(/[/\\]/).pop() ?? ''
  const whitelisted = basename.replace(ALLOWED_FILENAME_CHARS, '-')
  const withoutLeadingDots = whitelisted.replace(/^\.+/, '')
  const capped = withoutLeadingDots.slice(0, MAX_FILENAME_LENGTH)
  return capped.length > 0 ? capped : FALLBACK_FILENAME
}

/**
 * Throw on a bad caller-controlled segment. These come from app code and the
 * verified session, so a violation is a BUG, not user input — reject it loudly
 * at the boundary rather than silently mangling it into something that "works".
 */
function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(
      `Invalid storage key ${label}: ${JSON.stringify(value)} (must match ${String(SAFE_SEGMENT)})`,
    )
  }
}

/**
 * Build the object key for an upload: `<prefix>/<ownerId>/<uuid>-<safe-name>`.
 *
 * - `ownerId` in the path is the tenant boundary: paired with a presign that
 *   signs this exact key, a caller can only ever write under their own uid.
 * - The UUID makes keys unguessable (no enumerating someone else's namespace)
 *   and collision-free (a re-upload of `photo.png` never clobbers the first).
 * - The sanitized filename is cosmetic — it survives only so a downloaded file
 *   still looks like what the user uploaded.
 *
 * Throws on an invalid `prefix`/`ownerId`; a hostile `filename` is sanitized.
 */
export function buildKey({ prefix, ownerId, filename }: BuildKeyInput): string {
  assertSafeSegment(prefix, 'prefix')
  assertSafeSegment(ownerId, 'ownerId')
  return `${prefix}/${ownerId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`
}

/**
 * The human-legible filename `buildKey` embedded, recovered for display.
 *
 * `buildKey` mints `<prefix>/<ownerId>/<uuid>-<safe-name>`, so the name is the
 * last path segment with its `<uuid>-` prefix stripped. This lives HERE, next to
 * the layout it inverts, because that is the one thing that knows the shape — a
 * `key.split('-').slice(1)` in a component is a second, silent copy of this
 * layout that drifts the day the key format changes. A caller with a key gets a
 * name from this function; nothing else reconstructs it.
 *
 * The name is the SANITIZED one (see `sanitizeFilename`): the original may have
 * held characters the key cannot, so `laporan Q3 (final).pdf` reads back as
 * `laporan-Q3--final-.pdf`. Showing the true original would mean storing it — a
 * data-model choice the reference feature deliberately did not make.
 *
 * A UUID is 5 hyphen-separated groups, so splitting on `-` would keep only the
 * name's tail. Slice off the first 36 chars (the UUID) plus its trailing `-`
 * instead, which is exact regardless of hyphens in either the UUID or the name.
 */
export function filenameFromKey(key: string): string {
  const lastSegment = key.split('/').pop() ?? ''
  const UUID_PREFIX_LENGTH = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-'.length
  const name = lastSegment.slice(UUID_PREFIX_LENGTH)
  return name.length > 0 ? name : lastSegment
}
