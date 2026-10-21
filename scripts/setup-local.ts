/**
 * `pnpm setup:local` — get a fresh clone to a signed-in app in one command.
 *
 * `pnpm dev` runs this for you (between starting the emulators and `next dev`), so
 * most people never call it directly. The manual path it is the middle of, for when
 * you want the emulators in their own terminal:
 *
 *   pnpm emulators     (terminal 1, stays running — Auth + Firestore + UI)
 *   pnpm setup:local   (terminal 2, this script)
 *   pnpm dev:next      (terminal 2, afterwards — just `next dev`)
 *
 * NON-DESTRUCTIVE, ABSOLUTELY. Nothing here deletes anything: not your `.env`,
 * not your emulator data, not a bucket. That is the contract that makes the
 * command safe to run without reading it first — and it is why re-running it is
 * the documented way to check your setup, not a thing to be careful about.
 * Everything that can lose work lives in `pnpm db:reset -- --apply` instead.
 *
 * HOW THE CONTRACT IS EARNED: `pnpm seed` is spawned only when the Firestore
 * emulator has no `settings/rules` document — a fresh emulator. Any other state
 * is reported and left alone.
 *
 * IT ONLY EVER COPIES A TRACKED TEMPLATE. `.env` is created from `.env.example`
 * and from nothing else — never another checkout, never a secret store, never a
 * value read out of the environment.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import { requireEmulatorTarget } from './_safety.ts'
import { SEED_USERS, SEEDED_PASSWORD, upsertSeedUsers } from './_seed-users.ts'
import { loadEnvFiles } from './env-files.ts'
import {
  RULES_DOC_ID,
  SETTINGS_COLLECTION,
} from '../features/aisa/aisa.path.ts'

/** How long to wait for someone to start `pnpm emulators` in the other terminal. */
const EMULATOR_WAIT_MS = 120_000

interface FirebaseJson {
  emulators?: Record<string, { port?: number } | undefined>
}

/**
 * Create `.env` from the tracked example, or leave an existing one completely
 * untouched. There is no merge and no rewrite: a half-understood edit to a file
 * that may hold real credentials is not a thing a setup script gets to do, so the
 * only two outcomes are "created it" and "did not touch it", and it says which.
 */
function ensureEnvFile(): void {
  if (existsSync('.env')) {
    console.log('  .env already exists — left exactly as it is.')
    return
  }
  writeFileSync('.env', readFileSync('.env.example', 'utf8'), { mode: 0o600 })
  console.log('  .env created from .env.example (local emulator placeholders).')
  console.log(
    '  Set AISA_API_KEY in .env to the key your local aisa-api expects.',
  )
}

/**
 * Run a fixed command through the shell, cross-platform.
 *
 * A shell COMMAND STRING rather than execFile + argv for the same reason
 * `install-hooks.ts` uses one: on Windows `pnpm` and `docker` are `.cmd` shims,
 * and Node cannot launch those directly (EINVAL since the CVE-2024-27980
 * hardening). Every command passed here is a fixed literal — nothing user-supplied
 * is ever interpolated into it.
 */
function run(command: string): boolean {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' })
  return result.status === 0
}

/** Whether anything answers HTTP at `url`. ANY status counts. */
async function isReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

/** Whether an emulator is answering on `host` (a `host:port`, no scheme). */
function isUp(host: string): Promise<boolean> {
  return isReachable(`http://${host}/`)
}

/**
 * Block until both emulators answer, or give up after `EMULATOR_WAIT_MS`.
 *
 * It WAITS rather than failing immediately because the emulators have to live in
 * their own terminal — they are a long-running process, and starting them
 * detached from here would leave a newcomer with a background service they cannot
 * find or stop. Waiting turns "wrong order" from an error into a pause: start
 * them in the other terminal and this continues on its own.
 */
async function waitForEmulators(
  authHost: string,
  firestoreHost: string,
): Promise<void> {
  if ((await isUp(authHost)) && (await isUp(firestoreHost))) {
    console.log(
      `  emulators are up (auth ${authHost}, firestore ${firestoreHost}).`,
    )
    return
  }

  console.log(
    `  emulators are NOT running (expected auth ${authHost}, firestore ${firestoreHost}).\n` +
      '  Start them in another terminal — this will continue by itself:\n\n' +
      '      pnpm emulators\n',
  )

  const deadline = Date.now() + EMULATOR_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if ((await isUp(authHost)) && (await isUp(firestoreHost))) {
      console.log('  emulators are up. Continuing.')
      return
    }
  }

  console.error(
    `\nGave up after ${EMULATOR_WAIT_MS / 1000}s — the emulators never came up.\n` +
      'Run `pnpm emulators` in another terminal and then `pnpm setup:local` again.\n' +
      'Nothing was changed.',
  )
  process.exit(1)
}

/** The emulator ports this repo configures, read off `firebase.json` itself. */
function emulatorPorts(): Record<string, number | undefined> {
  const config: FirebaseJson = JSON.parse(readFileSync('firebase.json', 'utf8'))
  const emulators = config.emulators ?? {}
  return Object.fromEntries(
    Object.entries(emulators).map(([name, value]) => [name, value?.port]),
  )
}

// ---------------------------------------------------------------------------

console.log('Local configuration')
ensureEnvFile()
loadEnvFiles()

// The same fence `seed-emulator.ts` and `db-reset.ts` stand behind. It doubles as
// the check that the `.env` just copied actually points at the emulators — if the
// hosts are missing, everything below would silently aim somewhere else.
const { auth: authHost, firestore: firestoreHost } = requireEmulatorTarget({
  need: ['auth', 'firestore'],
  action: 'set up local development',
})

console.log('\nFirebase emulators')
await waitForEmulators(authHost, firestoreHost)

console.log('\nSeed data')
const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'
// No credential: the Admin SDK auto-routes to the emulators once the hosts are
// set, which the fence above has already proven they are.
const app = initializeApp({ projectId })

const seeded = (
  await getFirestore(app)
    .collection(SETTINGS_COLLECTION)
    .doc(RULES_DOC_ID)
    .get()
).exists
if (!seeded) {
  // Spawned rather than reimplemented: `pnpm seed` is the one definition of what
  // the seed IS, and it inherits the emulator hosts loaded above.
  if (!run('pnpm seed')) {
    console.error(
      '\n`pnpm seed` failed — see its output above. Nothing else ran.',
    )
    process.exit(1)
  }
} else {
  console.log(
    '  AISA data already in the emulator — left untouched.\n' +
      '  Setup never deletes. To start from an empty database:\n' +
      '      pnpm db:reset -- --apply && pnpm setup:local',
  )
  // Data present but no accounts (an Auth emulator restarted without its
  // export): restore the accounts alone — the upsert never touches documents.
  if ((await getAuth(app).listUsers(1)).users.length === 0) {
    console.log('  No Auth accounts — restoring the seeded accounts only.')
    await upsertSeedUsers(getAuth(app))
  }
}

const ports = emulatorPorts()

console.log('\n' + '─'.repeat(72))
console.log('\nTest accounts (emulator only — these exist nowhere else):\n')
for (const { email, role } of SEED_USERS) {
  console.log(`  ${email} (${role}) — password: ${SEEDED_PASSWORD}`)
}

console.log('\nListening on:\n')
console.log(`  Firebase Auth       ${authHost}`)
console.log(`  Firestore           ${firestoreHost}`)
if (ports.ui) console.log(`  Emulator UI         http://127.0.0.1:${ports.ui}`)
console.log('  App (once the server is up)  http://localhost:3000')

// `pnpm dev` runs this script itself, so the next step from HERE is only ever the
// raw server. Printing `pnpm dev` would tell someone to re-enter the command that
// just spawned this one.
console.log('\nNext:\n')
console.log(
  '  pnpm dev:next   (or Ctrl+C and `pnpm dev` to run everything together)\n',
)
