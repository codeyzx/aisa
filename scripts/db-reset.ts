/**
 * Wipe the LOCAL emulator database — every Firestore document and every Auth
 * account — so a developer can start from nothing.
 *
 *   pnpm db:reset             prints what it WOULD delete, deletes nothing
 *   pnpm db:reset -- --apply  actually deletes
 *
 * This is the destructive counterpart to `pnpm setup:local`, which never removes
 * anything. Splitting them that way is the point: setup is the command you run
 * without thinking, so it must be safe to run without thinking, and everything
 * that can lose work lives behind a command whose name says so plus a flag you
 * cannot type by accident.
 *
 * TWO INDEPENDENT FENCES, because either one alone is too weak:
 *
 *   1. `requireEmulatorTarget` (scripts/_safety.ts) — the SAME gate `seed-emulator.ts`
 *      stands behind, not a second spelling of it. It refuses to run unless both
 *      emulator hosts are set, which is also how `lib/env/server.ts`'s
 *      `isEmulatorTarget` decides the app is pointed at an emulator. One idea, one
 *      implementation.
 *
 *      MACHINE-VERIFIED, like `seed-emulator.ts`'s identical fence — but only
 *      since `cli-safety` learned to see a database reached over HTTP. It used to
 *      fire only on a script that BOTH transitively imported `firebase-admin` and
 *      called a mutating method by name, and this file does neither: it deletes
 *      over `fetch` against emulator-only REST endpoints, so the most destructive
 *      script in the repo was the one the manifest could not see, and deleting
 *      the import below left `pnpm structure:check` green. Its criterion (a) now
 *      also counts addressing an `/emulator/v1/` endpoint and its (b) a
 *      state-changing HTTP method. Driven: dropping the import below now FAILS
 *      the check, naming this file.
 *   2. `--apply` — plan by default. The fence above proves WHERE the writes land;
 *      it does nothing about deleting local work you still wanted. Printing the
 *      plan first is what catches that.
 *
 * There is no project-id confirmation here (unlike `migration/run.ts` and
 * `snapshot/restore.ts`) for the same earned reason `seed-emulator.ts` has none:
 * gate 1 means this process provably cannot reach a real database, so the failure
 * that confirmation exists to prevent — "wrote to prod thinking it was staging" —
 * is not reachable from here.
 *
 * WHY THE EMULATOR REST API RATHER THAN THE ADMIN SDK. `DELETE …/documents` and
 * `DELETE …/accounts` are endpoints the emulators serve and a real Firebase
 * project does not — so the destructive operation itself only exists against an
 * emulator. An Admin-SDK recursive delete would be the same code aimed at either,
 * and would also have to enumerate collections to find what to remove. The paths
 * are not invented: they are what `@firebase/rules-unit-testing`'s
 * `clearFirestore()` and firebase-tools' own auth emulator client call.
 */
import { existsSync } from 'node:fs'

import { requireEmulatorTarget } from './_safety.ts'

/**
 * `node` does not read `.env` on its own, so a script that needs the emulator
 * hosts would otherwise force every caller to prefix them inline. Loading the
 * files HERE is what lets `pnpm db:reset` work straight after `pnpm setup:local`.
 *
 * `.env.local` is loaded BEFORE `.env` on purpose: `process.loadEnvFile` never
 * overwrites a variable that is already set, so first-loaded wins — and that
 * ordering reproduces Next.js's own precedence (`.env.local` overrides `.env`,
 * and a real environment variable overrides both). Verified against Node 24.18.0.
 */
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

loadEnvFiles()

const { auth: authHost, firestore: firestoreHost } = requireEmulatorTarget({
  need: ['auth', 'firestore'],
  action: 'reset the database',
})

// Same default as `seed-emulator.ts`: `demo-*` is the project-id prefix the
// emulator suite recognises as "no real project behind this".
const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'

// `--apply` reaches here through pnpm's `--` passthrough (`pnpm db:reset -- --apply`)
// and also works when the script is run directly with `node scripts/db-reset.ts --apply`.
const apply = process.argv.slice(2).includes('--apply')

const firestoreUrl = `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`
const authUrl = `http://${authHost}/emulator/v1/projects/${projectId}/accounts`

console.log(`db:reset — target project: ${projectId}`)
console.log('\nThis deletes, in the LOCAL EMULATOR only:')
console.log(
  `  • every Firestore document in every collection  (${firestoreHost})`,
)
console.log(`  • every Auth account, including custom claims   (${authHost})`)

if (!apply) {
  console.log(
    '\nNothing was deleted — this was the plan, not the run.\n' +
      'To actually delete the above:\n' +
      '  pnpm db:reset -- --apply\n' +
      'Then `pnpm setup:local` reseeds the test accounts and example data.',
  )
  process.exit(0)
}

/**
 * One emulator wipe. A non-2xx is fatal rather than warned about: a half-reset
 * database is worse than no reset, because the next `pnpm setup:local` would
 * treat leftover data as "already seeded" and leave it there.
 */
async function clear(label: string, url: string, headers: HeadersInit = {}) {
  const response = await fetch(url, { method: 'DELETE', headers })
  if (!response.ok) {
    console.error(
      `\nFailed to clear ${label}: ${response.status} ${response.statusText}\n` +
        `${await response.text()}\n` +
        'Is `pnpm emulators` still running?',
    )
    process.exit(1)
  }
  console.log(`  cleared ${label}`)
}

console.log('\nApplying:')
await clear('Firestore documents', firestoreUrl)
// The auth emulator's `/emulator/v1` routes are privileged, and `owner` is the
// fixed token it accepts for them — firebase-tools sends exactly this.
await clear('Auth accounts', authUrl, { Authorization: 'Bearer owner' })

console.log('\nDone. The emulator is empty. Run `pnpm setup:local` to reseed.')
