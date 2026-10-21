// BAD: a contract that value-imports the Firebase Admin SDK is not client-safe.
import { getFirestore } from 'firebase-admin/firestore'

export const db = getFirestore
