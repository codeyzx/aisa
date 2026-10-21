// GOOD: the same emulator-REST wipe as the bad fixture's, standing behind the
// emulator fence. The gate is the only difference between the two files.
import { requireEmulatorTarget } from './_safety.ts'

export async function wipe(host: string, projectId: string): Promise<void> {
  requireEmulatorTarget({ need: ['auth', 'firestore'] })
  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`
  await fetch(url, { method: 'DELETE' })
}
