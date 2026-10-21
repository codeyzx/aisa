// BAD: exported actions that do NOT wrap runAction/runFormAction — browser-
// reachable entry points with no capability gate. Both the function-declaration
// and the const-arrow shape must be flagged.
export async function doThingAction(): Promise<number> {
  return 42
}

// The const-arrow shape that used to escape the function-declaration-only walk.
export const doOtherThingAction = async (): Promise<number> => {
  return 43
}
