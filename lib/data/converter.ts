import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import * as z from 'zod'

/**
 * Build a `FirestoreDataConverter` from a Zod schema.
 *
 *  - `fromFirestore` merges `{ ...data, id }` — the document key is spread LAST so
 *    it always wins, even if a stored `id` field somehow exists — and runs
 *    `schema.parse()`, so every read is validated + hydrated (Timestamps -> Dates,
 *    defaults applied). Schema drift throws — failing loud is the intended behavior.
 *  - `toFirestore` drops the synthetic `id` field (it is the document key, not
 *    stored data). `undefined` fields are dropped by Firestore itself via the
 *    `ignoreUndefinedProperties` setting (see lib/firebase/admin.ts), and JS
 *    `Date`s are stored as `Timestamp` automatically — so nothing is scrubbed by
 *    hand here. A hand-rolled deep scrub would recurse into `Date`/`Timestamp`
 *    (and `FieldValue`) instances and corrupt them, so it is deliberately absent.
 */
export function zodConverter<T>(
  schema: z.ZodType<T>,
): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T): DocumentData {
      const data: Record<string, unknown> = {
        ...(model as Record<string, unknown>),
      }
      delete data.id
      return data
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      // `id` LAST: the document key is authoritative and must win over any stored
      // `id` field (`toFirestore` drops `id` on write, but a hand-written or
      // legacy doc could still carry one).
      return schema.parse({ ...snapshot.data(), id: snapshot.id })
    },
  }
}
