'use client'

import {
  collection,
  limit,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

import { AssetSchema, type Asset } from '@/features/asset/asset.schema'
import { firebaseDb } from '@/lib/firebase/client-db'
import {
  useFirestoreQuery,
  type FirestoreQueryResult,
} from '@/lib/firebase/use-firestore-query'

/** The board shows live work: active assets, newest first. */
const REALTIME_STATUS = 'active' as const

/** A board, not a table — the cap is the point, and it keeps the payload small. */
const REALTIME_LIMIT = 8

/**
 * The ONE definition of this example's live query — key, query and parse in one
 * place, over the generic `useFirestoreQuery` bridge. Both islands call THIS, so
 * "same key ⇒ same query" is structural, not a rule anyone has to remember:
 * there is only one query, so the shared listener can never be two callers'
 * streams colliding under one key.
 *
 * `.where('status','==') + .orderBy('createdAt')` is a COMPOSITE INDEX query and
 * nothing catches a missing one. This exact pair already ships in
 * `firestore.indexes.json` (`status` ASC + `createdAt` DESC), so it adds no
 * deploy artifact — change either field and it does. `pnpm indexes:check` only
 * knows queries that actually RAN, so driving this page is what keeps its report
 * honest about this client query.
 */
export function useRealtimeAssets(
  collectionPath: string,
): FirestoreQueryResult<Asset> {
  return useFirestoreQuery<Asset>({
    // The key must describe the query (see `useFirestoreQuery`). `status` is
    // fixed today, but keying on it keeps that true if a second status board is
    // ever added beside this one.
    key: `${collectionPath}:${REALTIME_STATUS}`,
    createQuery: () =>
      query(
        collection(firebaseDb(), collectionPath),
        where('status', '==', REALTIME_STATUS),
        orderBy('createdAt', 'desc'),
        limit(REALTIME_LIMIT),
      ),
    // Parse with the SCHEMA, never the converter. `lib/data/converter.ts` is
    // typed against firebase-admin, so `.withConverter()` will not typecheck on a
    // Web SDK ref — and this line is literally what `zodConverter.fromFirestore`
    // does. `TimestampSchema` is already duck-typed for the Web SDK on purpose.
    parse: (snapshot: QueryDocumentSnapshot) =>
      AssetSchema.parse({ id: snapshot.id, ...snapshot.data() }),
  })
}
