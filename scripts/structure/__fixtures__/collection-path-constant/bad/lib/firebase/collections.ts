// Stub of the typed-accessor layer. Only the call SHAPE matters to this check —
// it never resolves the import, so the stub needs no converter and no Admin SDK.
export function typedCollection(path: string, schema: unknown): unknown {
  return { path, schema }
}

export function typedCollectionGroup(name: string, schema: unknown): unknown {
  return { name, schema }
}

export function rawCollection(path: string): unknown {
  return { path }
}
