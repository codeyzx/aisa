// BAD: reaches past the accessor layer. Neither reference carries the converter,
// so nothing validates what comes back out of Firestore.
import { adminDb } from '../../lib/firebase/admin-db.ts'

export function readWidgets(): unknown {
  return adminDb().collection('widgets')
}

export function readOneWidget(): unknown {
  // The same bypass spelled over two lines — an alias, which must still count.
  const db = adminDb()
  return db.doc('widgets/w1')
}
