// GOOD, and the proof that the CONJUNCTION is what makes the name-matched
// mutation test tractable: this calls `.set(` / `.add(` / `.delete(` on a Map and
// a Set — criterion (b) hits — but it never reaches firebase-admin, so it is not
// in scope and needs no gate. Mirrors `scripts/structure/program.ts` and
// `scripts/docs/*.ts` in the real tree.
export function tally(names: string[]): number {
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
    seen.add(name)
  }
  seen.delete('')
  return seen.size
}
