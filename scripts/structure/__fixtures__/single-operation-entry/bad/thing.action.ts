// BAD: ONE operation (saveThing) exposed through BOTH a form and a programmatic
// entry — the dual-kind duplication data-layer.md forbids. Both reduce to the
// base `saveThing`, forking one write behind two browser-reachable RPC entries.
export async function saveThingFormAction(): Promise<void> {}

export async function saveThingAction(): Promise<number> {
  return 1
}
