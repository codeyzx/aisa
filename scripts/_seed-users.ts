/**
 * The seeded emulator accounts, and the upsert that puts them there.
 *
 * ONE DEFINITION, TWO CALLERS. `scripts/seed-emulator.ts` creates these as part
 * of resetting the example data; `scripts/setup-local.ts` creates them ON THEIR
 * OWN when an emulator has documents but no accounts. Before this module the
 * second caller could only get them by spawning the whole seed — which clears the
 * assets collection — so restoring a login cost a developer their hand-made
 * documents. Splitting the account half out is what lets the two be repaired
 * independently.
 *
 * NO TOP-LEVEL SIDE EFFECTS, and that is the load-bearing property rather than a
 * style preference. `scripts/seed-emulator.ts` is an ENTRY POINT: it seeds at
 * import time via top-level `await`, so importing it to borrow its user list
 * would run the seed. This module initializes nothing, reads no env, and touches
 * no network until `upsertSeedUsers` is called with an `Auth` the caller made.
 *
 * The `_` prefix marks a shared, non-entry module — imported, never run, the same
 * way `scripts/_safety.ts` is.
 *
 * NO SAFETY GATE HERE, and `cli-safety` agrees rather than being evaded: the only
 * `firebase-admin` import below is `import type`, which is erased at runtime, so
 * this module cannot reach a database by itself. It mutates whatever `Auth` it is
 * handed, and both callers hand it one built after `requireEmulatorTarget` has
 * already proven the process can only reach an emulator.
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
  { email: 'admin@aixel.test', role: 'admin' },
  { email: 'user@aixel.test', role: 'user' },
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
