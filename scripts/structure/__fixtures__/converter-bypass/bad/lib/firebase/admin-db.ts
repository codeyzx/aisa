// Stub of the real Admin handle. Shape is all this check reads.
interface Ref {
  doc(id?: string): Ref
  set(data: unknown): Promise<void>
}
interface Db {
  collection(path: string): Ref
  collectionGroup(name: string): Ref
  doc(path: string): Ref
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>
}
export function adminDb(): Db {
  throw new Error('stub')
}
