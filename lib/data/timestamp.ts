import * as z from 'zod'

interface WithToDateFunction {
  toDate: () => Date
}

const FirestoreTimestampToDateSchema = z
  .custom<WithToDateFunction>((value) => {
    const maybeValue = value as { toDate?: unknown } | null
    const maybeToDateFunction = maybeValue?.toDate
    return typeof maybeToDateFunction === 'function'
  })
  .transform((value) => value.toDate())

/**
 * A re-serialized Firestore timestamp arriving as plain numbers, validated to
 * Firestore's own shape rather than trusted:
 *
 *  - both fields must be INTEGERS — a fractional `seconds` is not a timestamp,
 *    and a fractional `nanoseconds` encodes a sub-nanosecond a `Date` cannot
 *    hold anyway,
 *  - `nanoseconds` in [0, 1e9): outside that it does not FAIL, it silently
 *    NORMALIZES — `2e9` divides into +2000ms and hands back a plausible, wrong
 *    `Date` — so the range is rejected at the boundary, not folded in downstream,
 *  - the resulting `Date` must be valid: `seconds` is bounded only to "integer"
 *    above, so a far-future value like `1e17` is a legal integer that overflows
 *    the JS `Date` range to `NaN`. A bad `Date` must not travel as if it were
 *    real, so the refine rejects it and the union throws rather than passing
 *    `Invalid Date` into an entity field.
 */
const PlainObjectSecondsToDateSchema = z
  .object({
    seconds: z.number().int(),
    nanoseconds: z.number().int().min(0).max(999_999_999),
  })
  .transform(
    (value) => new Date(value.seconds * 1000 + value.nanoseconds / 1e6),
  )
  .refine((date) => !Number.isNaN(date.getTime()), {
    message: 'timestamp seconds out of the representable Date range',
  })

/**
 * Copy-in codec for a Firestore `Timestamp` <-> JS `Date`. The OUTPUT is always
 * a `Date`, so a schema can declare `createdAt: TimestampSchema` and get a real
 * `Date` after `.parse()`.
 *
 * Duck-typed on purpose (NO `firebase-admin` import): keeping this client-safe
 * lets an entity schema be imported by a client form for its field constraints
 * without dragging the Admin SDK into the browser bundle. It accepts the shapes
 * a timestamp field can arrive in:
 *
 *  - anything with a `toDate()` method — a Firestore `Timestamp` (Admin or Web
 *    SDK), which is what a Firestore read yields — hydrated via `.toDate()`,
 *  - a JS `Date` (already hydrated) — passed through untouched,
 *  - a plain `{ seconds, nanoseconds }` object (e.g. a re-serialized value).
 */
export const TimestampSchema = z.union([
  FirestoreTimestampToDateSchema,
  z.date(),
  PlainObjectSecondsToDateSchema,
])
