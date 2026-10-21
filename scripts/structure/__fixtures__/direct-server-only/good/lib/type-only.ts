// GOOD: a type-only firebase-admin import is erased at build and pulls nothing,
// so it does not require the server-only mark.
import type { UserRecord } from 'firebase-admin/auth'

export type Uid = UserRecord['uid']
