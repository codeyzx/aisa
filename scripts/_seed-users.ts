/**
 * The seeded emulator accounts, and the upsert that puts them there.
 *
 * ONE DEFINITION, TWO CALLERS: `scripts/seed-emulator.ts` creates these with the
 * AISA data; `scripts/setup-local.ts` creates them ON THEIR OWN when the emulator
 * has data but no accounts, so restoring a login never costs a reset.
 *
 * NO TOP-LEVEL SIDE EFFECTS: this module initializes nothing, reads no env, and
 * touches no network until `upsertSeedUsers` is called with an `Auth` the caller
 * made — and both callers make it only after `requireEmulatorTarget` has proven
 * the process can only reach an emulator. The `firebase-admin` import below is
 * `import type`, erased at runtime.
 */
import type { Auth } from 'firebase-admin/auth'

/**
 * The password every seeded account gets. Shared and weak on purpose: these
 * accounts exist only inside the Auth emulator, which verifies no real
 * credential, and the value is printed by both callers so it is discoverable
 * rather than guessed.
 */
export const SEEDED_PASSWORD = 'password123'

export interface SeedUser {
  email: string
  /** The custom claim `lib/auth/session.ts` reads to build a Session. */
  role: 'admin' | 'user'
}

/** One account per role, so both sides of every capability check are reachable. */
export const SEED_USERS: readonly SeedUser[] = [
  { email: 'manager@aisa.test', role: 'admin' },
  { email: 'viewer@aisa.test', role: 'user' },
]

/**
 * Upsert every `SEED_USERS` account into the Auth emulator `auth` points at, and
 * return them.
 *
 * UPSERT, never delete: an existing account keeps its uid and gets its password
 * and role reset, so re-running converges instead of failing on "email already
 * exists" — and nothing a caller does through this function can lose an account
 * or a document.
 */
export async function upsertSeedUsers(
  auth: Auth,
): Promise<readonly SeedUser[]> {
  for (const { email, role } of SEED_USERS) {
    const existing = await auth.getUserByEmail(email).catch(() => null)
    const { uid } = existing
      ? await auth.updateUser(existing.uid, {
          password: SEEDED_PASSWORD,
          emailVerified: true,
        })
      : await auth.createUser({
          email,
          password: SEEDED_PASSWORD,
          emailVerified: true,
        })

    await auth.setCustomUserClaims(uid, { role })
  }
  return SEED_USERS
}
