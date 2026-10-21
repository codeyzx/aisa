/**
 * Lossless JSON encoding for Firestore documents.
 *
 * THE NON-OBVIOUS PART, and the whole reason this file exists: Firestore stores
 * types JSON cannot express. `JSON.stringify(timestamp)` yields
 * `{"_seconds":1,"_nanoseconds":0}` — which restores as a plain OBJECT, not a
 * `Timestamp`. The document then looks fine in the emulator UI and the
 * `zodConverter` throws on the very next read, because `AssetSchema` expects a
 * date. A `GeoPoint` degrades the same way; a `DocumentReference` restores as a
 * string and stops being a link; `Bytes` silently corrupts.
 *
 * THIS MODULE'S CONSUMER IS THE SNAPSHOT CLI: `export.ts` calls `encode` and
 * `restore.ts` calls `decode`, both reachable as the `snapshot:export` /
 * `snapshot:restore` scripts in `package.json`; `codec.test.ts` pins the round
 * trip.
 *
 * So `encode` TAGS the types JSON would flatten and `decode` rebuilds the real
 * SDK instances. The property that matters is the round trip:
 * `decode(encode(x))` must deep-equal `x`, including types — not just shape.
 *
 * Do NOT commit an exported-document fixture `data/` directory alongside this: a
 * boilerplate shipping someone's real documents is a data leak with a `.json`
 * extension.
 *
 * ⚠️ THE TAG IS A RESERVED WORD. A document with a real field literally named
 * `__t` whose value is one of the tag strings would be misread on decode. Not
 * defended against, deliberately: the check costs a branch on every field of
 * every document, and `__t` is already the kind of name Firestore itself
 * reserves the shape of. Named here so it is a known limit rather than a
 * surprise.
 */
import {
  Timestamp,
  GeoPoint,
  DocumentReference,
} from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'

/** The tag key. See the header's reserved-word warning. */
const TAG = '__t'

type Encoded = unknown

/**
 * Convert a Firestore value into something `JSON.stringify` cannot degrade.
 *
 * Order matters: `Timestamp` and `GeoPoint` are objects, so they must be
 * matched BEFORE the generic object branch, or they fall through and get
 * flattened into the exact `{_seconds, _nanoseconds}` shape this exists to
 * prevent.
 */
export function encode(value: unknown): Encoded {
  if (value === null || value === undefined) return null

  if (value instanceof Timestamp) {
    return {
      [TAG]: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    }
  }
  if (value instanceof GeoPoint) {
    return {
      [TAG]: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    }
  }
  if (value instanceof DocumentReference) {
    return { [TAG]: 'ref', path: value.path }
  }
  if (Buffer.isBuffer(value)) {
    return { [TAG]: 'bytes', base64: value.toString('base64') }
  }
  // A JS Date can reach here from code that wrote one directly. Encode it as a
  // timestamp: that is what Firestore stored it as, and restoring a Date where
  // a Timestamp belongs is the same corruption one level down.
  if (value instanceof Date) {
    const ts = Timestamp.fromDate(value)
    return {
      [TAG]: 'timestamp',
      seconds: ts.seconds,
      nanoseconds: ts.nanoseconds,
    }
  }
  if (Array.isArray(value)) return value.map(encode)

  if (typeof value === 'object') {
    const out: Record<string, Encoded> = {}
    for (const [key, entry] of Object.entries(value)) out[key] = encode(entry)
    return out
  }

  return value // string | number | boolean
}

/**
 * Rebuild the real SDK types from `encode`'s output.
 *
 * `db` is needed only for `ref`: a `DocumentReference` cannot exist without the
 * Firestore instance it points into, which is why this takes a handle and
 * `encode` does not.
 */
export function decode(value: Encoded, db: Firestore): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((entry) => decode(entry, db))

  const tagged = value as Record<string, unknown>
  switch (tagged[TAG]) {
    case 'timestamp':
      return new Timestamp(
        tagged.seconds as number,
        tagged.nanoseconds as number,
      )
    case 'geopoint':
      return new GeoPoint(tagged.latitude as number, tagged.longitude as number)
    case 'ref':
      return db.doc(tagged.path as string)
    case 'bytes':
      return Buffer.from(tagged.base64 as string, 'base64')
    default: {
      const out: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(tagged))
        out[key] = decode(entry, db)
      return out
    }
  }
}
