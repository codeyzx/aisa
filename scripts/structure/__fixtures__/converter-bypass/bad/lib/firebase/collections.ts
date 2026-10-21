// The accessor layer: the ONE module allowed to take a raw reference, because
// attaching the converter is its entire job. Never flagged, by path.
import { adminDb } from './admin-db.ts'

export function typedCollection(path: string): unknown {
  return adminDb().collection(path)
}

export function typedCollectionGroup(name: string): unknown {
  return adminDb().collectionGroup(name)
}
