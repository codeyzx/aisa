import 'server-only'

/**
 * Generic Firestore typed accessors.
 *
 * This is a TYPED-ACCESSOR layer, not a repository facade:
 * `typedCollection(path, Schema)` hands back a live `CollectionReference<T>` with
 * the full Firestore query API intact — `.where()`, `.orderBy()`, `.limit()`,
 * `.doc()`, transactions, collection-group queries, everything. The layer only
 * bolts on the Zod converter (typed + validated reads, undefined-scrubbed
 * writes); it never hides or narrows the query API from callers.
 *
 * A feature or infrastructure owner supplies its own path and schema. This shared
 * layer knows neither so either can be deleted without changing it.
 */
import type {
  CollectionGroup,
  CollectionReference,
} from 'firebase-admin/firestore'
import * as z from 'zod'

import { zodConverter } from '@/lib/data/converter'
import { adminDb } from '@/lib/firebase/admin-db'

/** A converter-typed collection reference: `adminDb().collection(path)` + schema. */
export function typedCollection<T>(
  path: string,
  schema: z.ZodType<T>,
): CollectionReference<T> {
  return adminDb().collection(path).withConverter(zodConverter(schema))
}

/**
 * A converter-typed collection-GROUP reference — queries every sub-collection
 * named `name` wherever it is nested. Kept first-class so cross-collection
 * queries stay supported; the accessor layer is anti-restrictive by design.
 */
export function typedCollectionGroup<T>(
  name: string,
  schema: z.ZodType<T>,
): CollectionGroup<T> {
  return adminDb().collectionGroup(name).withConverter(zodConverter(schema))
}

/**
 * THE ESCAPE HATCH: a collection reference with NO converter, so reads are never
 * validated and come back as raw `DocumentData`.
 *
 * Named, exported, and greppable ON PURPOSE. `structure:check`'s
 * `converter-bypass` forbids minting a reference straight off `adminDb()`, so
 * this is the ONE way to read around the schema — which means `rg rawCollection`
 * lists every place in the codebase that does, and a reviewer can audit that list.
 *
 * USE IT ONLY WHERE VALIDATION WOULD BE WRONG, not merely inconvenient. The real
 * case is REPAIR AND DELETION: a document that no longer matches the schema is
 * exactly the one you most need to delete, and a converted read would throw on it
 * — making a corrupt row permanently undeletable. A repo deletes through here
 * for that reason.
 *
 * Everything that READS TO SHOW must use `typedCollection` instead: an unvalidated
 * read hands the app `any`, so a drifted field surfaces far from the query that
 * caused it.
 */
export function rawCollection(path: string): CollectionReference {
  return adminDb().collection(path)
}
