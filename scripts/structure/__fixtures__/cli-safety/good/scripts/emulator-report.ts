// GOOD, and the proof that the widened criterion (a) did not swallow read-only
// emulator tooling: this addresses an `/emulator/v1/` endpoint — criterion (a)
// hits — but it only reads. No mutating method name, no state-changing HTTP
// method, so criterion (b) misses and no gate is demanded. Mirrors
// `scripts/check-indexes.ts` in the real tree.
export async function report(host: string, projectId: string): Promise<string> {
  const url = `http://${host}/emulator/v1/projects/${projectId}:indexUsage`
  const response = await fetch(url)
  return response.text()
}
