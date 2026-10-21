// GOOD: exported actions that wrap runAction, where the capability gate runs.
// Both the function-declaration and the const-arrow shape must pass.
import { runAction } from './run.ts'

export async function doThingAction(): Promise<number> {
  return runAction('example:read', async () => 42)
}

// The const-arrow shape, wrapped — recognized and passing, not merely ignored.
export const doOtherThingAction = async (): Promise<number> => {
  return runAction('example:read', async () => 43)
}
