// GOOD: two DISTINCT operations, each exposed through exactly ONE entry kind —
// createThing as a form entry, deleteThing as a programmatic entry. Different
// bases, so nothing is exposed twice.
export async function createThingFormAction(): Promise<void> {}

export async function deleteThingAction(): Promise<number> {
  return 1
}
