// GOOD, and the proof that TYPE-ONLY edges are excluded: the only firebase-admin
// import here is `import type`, which is erased at runtime and can never carry a
// client, so this file cannot reach a database however many `.set(` calls it
// makes on a Map. Following type-only edges would flag it — wrongly.
import type { Firestore } from 'firebase-admin/firestore'

export function describeDb(db: Firestore): Map<string, string> {
  const facts = new Map<string, string>()
  facts.set('kind', typeof db)
  return facts
}
