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
 * HOW THE CONTRACT IS EARNED, because it is not free. `scripts/seed-emulator.ts`
 * IS destructive: it CLEARS the assets collection before rewriting its 30 fixed
 * codes, and by your second run that collection may hold work you made through the
 * UI. So this script spawns `pnpm seed` in exactly one state — an EMPTY assets
 * collection, where the clear has nothing to delete. The two other states are
 * handled without it:
 *
 *   - assets AND accounts present : report and touch nothing at all.
 *   - assets but NO accounts      : upsert the accounts only, via
 *                                   `scripts/_seed-users.ts`, leaving every
 *                                   document exactly where it is.
 *
 * That middle case is why the account half is a shared module. Deciding on the
 * assets collection alone let an emulator with assets but no accounts skip the
 * seed and print an EMPTY "Test accounts" block — a newcomer told to sign in as
 * nobody. Deciding `no assets OR no accounts` fixed the empty block by spawning
 * the full seed, which then DELETED the very documents this header promises are
 * safe. Restoring the accounts by themselves fixes both, and keeps the promise.
 *
 * IT ONLY EVER COPIES A TRACKED TEMPLATE, PLUS ONE GENERATED SECRET. `.env` is
 * created from `.env.example` and from nothing else — never another checkout,
 * never a secret store, never a value read out of the environment. The single
 * exception is `IMPERSONATION_SECRET`, which the template deliberately ships
 * EMPTY (a committed value would be a publicly-known HMAC key for an auth
 * bypass, and it would validate, so nothing would ever teach you to replace it).
 * It is filled here with fresh local randomness — generated, not copied — so a
 * `cp .env.example .env` still cannot produce a working one.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import { ASSETS_COLLECTION } from '../features/asset/asset.path.ts'
import { requireEmulatorTarget } from './_safety.ts'
import { loadEnvFiles } from './env-files.ts'
import { SEEDED_PASSWORD, upsertSeedUsers } from './_seed-users.ts'

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
 *
 * The one value NOT copied is `IMPERSONATION_SECRET`. `.env.example` ships it
 * empty on purpose — a committed placeholder long enough to satisfy
 * `ImpersonationSchema`'s `min(32)` (lib/auth/impersonation.config.ts) would be a
 * publicly-known signing key for the impersonation auth bypass that BOOTS
 * CLEANLY, so nothing would ever tell the reader to replace it. Empty, the boot
 * check refuses to serve and names the variable. That refusal is the teaching,
 * and it must survive a bare `cp` — so the fresh 32 bytes below are generated on
 * THIS machine at file-creation time, never read from anywhere. An existing
 * `.env` is not touched: if it has an empty secret the app says so at boot, and
 * `.env.example` names the `openssl rand -base64 32` that fixes it.
 */
function ensureEnvFile(): void {
  if (existsSync('.env')) {
    console.log('  .env already exists — left exactly as it is.')
    return
  }
  const template = readFileSync('.env.example', 'utf8')
  const secret = randomBytes(32).toString('base64')
  // Anchored to the start of a line so a mention of the name inside the comment
  // prose above it cannot be the thing that gets rewritten.
  const filled = template.replace(
    /^IMPERSONATION_SECRET=$/m,
    `IMPERSONATION_SECRET=${secret}`,
  )
  writeFileSync('.env', filled, { mode: 0o600 })
  console.log('  .env created from .env.example (local emulator placeholders).')
  console.log(
    filled === template
      ? '  NOTE: no empty IMPERSONATION_SECRET= line to fill — the app will refuse\n' +
          '  to boot until you set one: openssl rand -base64 32'
      : '  IMPERSONATION_SECRET generated locally (32 random bytes) — never shared.',
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

/**
 * Same as `run`, but captures stdout instead of streaming it — for the commands
 * whose OUTPUT is the answer (`docker compose port`) rather than a log to show.
 * Returns undefined on any non-zero exit, so a caller cannot mistake an error
 * message for a value.
 */
function capture(command: string): string | undefined {
  const result = spawnSync(command, { shell: true, encoding: 'utf8' })
  if (result.status !== 0) return undefined
  return (result.stdout ?? '').trim()
}

/**
 * Whether anything answers HTTP at `url`. ANY status counts, including 403 —
 * the S3 root correctly refuses an unsigned request, and reading that refusal as
 * "down" is the same mistake `compose.yaml` warns about in its healthcheck.
 */
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
 * The host PORT a compose service published for `containerPort`, or undefined if
 * the service is not running or never published it. `docker compose port` answers
 * for THIS project's container only, which is the whole reason it is asked: it is
 * the difference between "our stack owns that port" and "something answered".
 *
 * Only the port is compared against `S3_ENDPOINT`, never the address: compose
 * reports the BIND address (`127.0.0.1:8433`) while `.env` holds the address you
 * DIAL, and `localhost` vs `127.0.0.1` is a legitimate difference between the two.
 * The port alone is enough, because the daemon refuses to publish a host port
 * that is already allocated — driven: with an unrelated SeaweedFS on 8333,
 * `docker compose up` failed with "Bind for 127.0.0.1:8333 failed: port is
 * already allocated". So if our container holds port P, whatever answers on P is
 * ours.
 */
function composePublishedPort(
  service: string,
  containerPort: number,
): string | undefined {
  const mapping = capture(`docker compose port ${service} ${containerPort}`)
  if (!mapping) return undefined
  const port = mapping.split(':').pop()
  return port || undefined
}

/** The port an `http(s)://host:port` URL actually dials, scheme default included. */
function endpointPort(endpoint: string): string | undefined {
  try {
    const url = new URL(endpoint)
    return url.port || (url.protocol === 'https:' ? '443' : '80')
  } catch {
    return undefined
  }
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

console.log('\nLocal object storage (SeaweedFS)')
// Reuses the compose services rather than a second `docker run`: `compose.yaml`
// already owns the image, the least-privilege identity from `seaweedfs.s3.json`,
// the health probe, and `seaweedfs-init` — the one-shot that creates the bucket,
// which the app's scoped key deliberately cannot do for itself. `app` is NOT
// started, because building its image would race the `pnpm dev` this command
// tells you to run next.
//
// THE TWO SERVICES ARE STARTED SEPARATELY, and that is not tidiness. Naming both
// in one `--wait` reports FAILURE on a perfectly healthy stack: `--wait` treats a
// service exiting during the wait as an error even when it exited 0, which is the
// one-shot's whole success condition. Driven, 3/3, on a working machine:
//
//     $ docker compose up -d --wait seaweedfs seaweedfs-init
//     Container …-seaweedfs-1            Healthy
//     container …-seaweedfs-init-1 exited (0)
//     EXIT=1
//
// So `--wait` covers only the long-running service (health is the right signal
// for it), and the one-shot runs in the foreground where ITS exit status is the
// answer. `--no-deps` because the server is already up and healthy by then.
const serverUp = run('docker compose up -d --wait seaweedfs')
const bucketCreated =
  serverUp && run('docker compose run --rm --no-deps seaweedfs-init')

// WHOSE SERVER ANSWERED. A bare port probe cannot tell, and reading one as
// success is a lie this script used to print: driven here with an unrelated
// SeaweedFS on 8333, `curl http://127.0.0.1:8333/` returned 403 — the same "yes,
// an S3 endpoint" the app's own client would see — while our compose service had
// failed to bind at all. So the probe is only ever the SECOND question. The first
// is `docker compose port`, which answers for our project's container alone.
const endpoint = process.env.S3_ENDPOINT ?? ''
const ourPort = serverUp ? composePublishedPort('seaweedfs', 8333) : undefined
const wantedPort = endpointPort(endpoint)
const isOurStack = ourPort !== undefined && ourPort === wantedPort
// True only when our container owns the port, it answers, AND the one-shot
// created the bucket — the three things "up at …, bucket …" actually claims.
const storageReady =
  bucketCreated && isOurStack && (await isReachable(endpoint))

if (storageReady) {
  console.log(`  up at ${endpoint} (bucket ${process.env.S3_BUCKET})`)
} else if (serverUp && !isOurStack) {
  console.log(
    `  started, but it is NOT what answers at ${endpoint}.\n` +
      `  Our container publishes port ${ourPort ?? '(none)'}; S3_ENDPOINT dials ${wantedPort ?? '(unparseable)'}.\n` +
      '  Anything replying there belongs to someone else — `docker ps` will show what.\n' +
      '  Set S3_HOST_PORT (compose) and S3_ENDPOINT (.env) to the same free port.',
  )
} else if (bucketCreated) {
  console.log(
    `  started and holds ${endpoint}, but nothing answered there.\n` +
      '  `docker compose logs seaweedfs` has the reason.',
  )
} else if (serverUp) {
  console.log(
    `  running, but the bucket step failed — see the output above.\n` +
      `  Uploads will 403 until \`${process.env.S3_BUCKET}\` exists.`,
  )
} else {
  // Not fatal, and deliberately so: sign-in, the asset list and everything else
  // work without it. Only file upload/download needs S3, so a newcomer without
  // Docker still gets a running app — they just learn which part is missing.
  console.log(
    '  could not start it — see the compose output above (is Docker running?).\n' +
      '  Continuing: the app boots fine; only file upload and download will fail.',
  )
}

console.log('\nFirebase emulators')
await waitForEmulators(authHost, firestoreHost)

console.log('\nSeed data')
const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aisa'
// No credential: the Admin SDK auto-routes to the emulators once the hosts are
// set, which the fence above has already proven they are.
const app = initializeApp({ projectId })
const db = getFirestore(app)

const existing = await db.collection(ASSETS_COLLECTION).count().get()
const assetCount = existing.data().count
// BOTH halves are read, because "already seeded" has to mean what the banner at
// the bottom promises: an emulator with assets but NO Auth accounts printed an
// empty "Test accounts" block, telling a newcomer to sign in with nothing to sign
// in as. The Auth emulator is the authority on whether accounts exist, so it is
// asked before the decision, not after it. But the two halves get DIFFERENT
// repairs — see below.
const authAccounts = (await getAuth(app).listUsers()).users.length
if (assetCount === 0) {
  // Spawned rather than reimplemented: `pnpm seed` is the one definition of what
  // the seed IS, and it inherits the emulator hosts loaded above — which is what
  // makes the inline `FIRESTORE_EMULATOR_HOST=… pnpm seed` prefix unnecessary.
  //
  // Only reached with an EMPTY assets collection, which is what keeps this
  // command's non-destructive contract: the seed's clear runs over nothing, so
  // there is no document for it to delete.
  if (!run('pnpm seed')) {
    console.error(
      '\n`pnpm seed` failed — see its output above. Nothing else ran.',
    )
    process.exit(1)
  }
} else if (authAccounts === 0) {
  // Assets exist, so `pnpm seed` is off the table — its collection clear would
  // delete them, and they may be work made through the UI. Only the accounts are
  // missing, so only the accounts are restored: the shared upsert in
  // `_seed-users.ts`, the exact same one the seed runs, and it writes no document.
  console.log(
    `  ${assetCount} asset(s) present but no Auth accounts — restoring the\n` +
      '  accounts only, because the test accounts printed below have to actually\n' +
      '  exist. Every document is left exactly as it is.',
  )
  await upsertSeedUsers(getAuth(app))
} else {
  console.log(
    `  ${assetCount} asset(s) and ${authAccounts} account(s) already in the emulator — left untouched.\n` +
      '  Setup never deletes. To start from an empty database:\n' +
      '      pnpm db:reset -- --apply && pnpm setup:local',
  )
}

// Read back from the live emulator AFTER any seed or account restore ran, rather
// than printing a hardcoded list: this is the state that actually exists, so it
// stays true even if the seed changes. Re-listed rather than reusing the count
// above, which was taken before the step that may have just created these
// accounts. `SEEDED_PASSWORD` is imported from the same module that sets it, so
// the printed password cannot drift from the one on the account either.
const { users } = await getAuth(app).listUsers()
const ports = emulatorPorts()

console.log('\n' + '─'.repeat(72))
console.log('\nTest accounts (emulator only — these exist nowhere else):\n')
const byEmail = users.toSorted((a, b) =>
  (a.email ?? '').localeCompare(b.email ?? ''),
)
for (const user of byEmail) {
  const role = user.customClaims?.role ?? 'no role'
  console.log(`  ${user.email}  ·  ${role}  ·  password: ${SEEDED_PASSWORD}`)
}

console.log('\nListening on:\n')
console.log(`  Firebase Auth       ${authHost}`)
console.log(`  Firestore           ${firestoreHost}`)
if (ports.ui) console.log(`  Emulator UI         http://127.0.0.1:${ports.ui}`)
// Only listed when the step above PROVED it — an unconditional line here printed
// the endpoint on the very run that had just said storage could not start, which
// is the same confidently-wrong output in a second place. Silence is the honest
// answer; the storage section already said what to do about it.
if (storageReady) console.log(`  S3 (SeaweedFS)      ${endpoint}`)
console.log('  App (once the server is up)  http://localhost:3000')

// `pnpm dev` runs this script itself, so the next step from HERE is only ever the
// raw server. Printing `pnpm dev` would tell someone to re-enter the command that
// just spawned this one.
console.log('\nNext:\n')
console.log(
  '  pnpm dev:next   (or Ctrl+C and `pnpm dev` to run everything together)\n',
)
