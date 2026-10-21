// The fixture-local safety manifest: the check looks for an import edge INTO
// `scripts/_safety.ts` (relative to the fixture root) naming one of these two
// gates. Bodies are irrelevant to the check — only the export names are.
export function requireProjectIdConfirmation(options: {
  projectId: string
}): void {
  void options
}

export function requireEmulatorTarget(options: {
  need: ('auth' | 'firestore')[]
}): void {
  void options
}
