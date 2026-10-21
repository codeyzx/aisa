// BAD, and the shape `scripts/db-reset.ts` really has: it wipes a database
// without importing firebase-admin at all — a DELETE against the emulator suite's
// own admin REST route. No Admin SDK edge to follow, so criterion (a) has to see
// the URL itself; otherwise the most destructive script in a tree is the one the
// safety manifest cannot check.
export async function wipe(host: string, projectId: string): Promise<void> {
  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`
  await fetch(url, { method: 'DELETE' })
}
