/**
 * `pnpm test:e2e:fast [--shards N] [playwright args…]` — the browser suite
 * against the production image, split over N shards that share no Firestore
 * data. `pnpm test:e2e:ci` is the same command.
 *
 * WHAT EACH SHARD OWNS:
 *   - its own Firestore emulator, on port `E2E_FAST_FIRESTORE_BASE_PORT + i`
 *     (default 8181 upward), seeded by `scripts/seed-emulator.ts`;
 *   - its own app container, on port `E2E_FAST_BASE_PORT + i - 1` (default
 *     3201 upward — never 3100, which `pnpm test:e2e:container` defaults to),
 *     run by its own copy of `scripts/e2e-container.ts`;
 *   - its own Playwright process, running `--shard=i/N --fully-parallel` with
 *     `workers: 1` and its own `--output` directory;
 *   - its own `aisa-api` address, `127.0.0.1:(E2E_FAST_AISA_API_BASE_PORT + i)`
 *     (default 8791 upward), handed to the container as `AISA_API_URL` and to
 *     Playwright in the same variable. Nothing listens there unless a spec
 *     starts the mock (`e2e/acceptance/mock-aisa-api.ts`), which reads it back,
 *     so the write-path specs run on any number of shards without two shards'
 *     dashboards calling one mock.
 *
 * WHY A FIRESTORE EMULATOR PER SHARD, AND NOT ONE EMULATOR WITH A PROJECT ID PER
 * SHARD: the emulators do keep data per project id, but the app has ONE
 * `FIREBASE_PROJECT_ID` for both Firestore and Auth, and the browser cannot be
 * moved off the default project — the Auth emulator answers every API-key
 * request (the browser's sign-in) from the project it was started with
 * (`getProjectIdByApiKey` in firebase-tools' auth emulator). A shard app on
 * project `demo-aisa-s2` would be handed ID tokens for `demo-aisa` and refuse
 * every sign-in.
 *
 * WHAT THE SHARDS SHARE: the one image, and ONE Auth emulator on 127.0.0.1:9099.
 * The port is not a choice — it is inlined into the image's client bundle
 * (`E2E_PUBLIC_EXTRAS` in `_container.ts`), and the image is built once. Every
 * shard's seed upserts the same accounts (`scripts/_seed-users.ts`), so the
 * shards see identical users. A spec that CHANGES an account (password, claims,
 * revocation, deletion) would leak into the other shards; none does today, and
 * sign-out clears the cookie without revoking (`lib/auth/constants.ts`).
 *
 * THE SPLIT is Playwright's own `--shard=i/N`, made per TEST by
 * `--fully-parallel` (the config's `fullyParallel: false` exists because the
 * workers of one run share an emulator; across shards they do not). N is capped
 * at the number of tests the arguments select, so no shard starts a container
 * and an emulator to run nothing.
 *
 * ARGUMENTS other than `--shards` go to every shard's `playwright test`, so
 * `pnpm test:e2e:fast --shards 1 e2e/auth.spec.ts` runs one file on one shard,
 * and `--grep` works as it does there. A bare `--` is dropped: Playwright reads
 * every argument after one as a file filter, so `-- --grep x` would silently run
 * everything. `--reporter` and `--output` are this script's (see `runShard`).
 *
 * MEMORY: each shard is an app container, a Firestore emulator (a JVM) and a
 * browser. Use `--shards 2` on a machine that is doing anything else.
 *
 * Linux only, for the same reason as `e2e-container.ts`: the containers use
 * `--network host` to reach emulators bound to 127.0.0.1.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
  E2E_PUBLIC_EXTRAS,
  E2E_TAG,
  productionBuildArgs,
  requireDocker,
  shortSha,
} from './_container.ts'

const DEFAULT_SHARDS = 4
const ROOT = process.cwd()
const RUN_DIR = join(ROOT, 'test-results', 'e2e-fast')
const BASE_PORT = Number(process.env.E2E_FAST_BASE_PORT ?? '3201')
const FIRESTORE_BASE_PORT = Number(
  process.env.E2E_FAST_FIRESTORE_BASE_PORT ?? '8180',
)
const AISA_API_BASE_PORT = Number(
  process.env.E2E_FAST_AISA_API_BASE_PORT ?? '8790',
)
const PROJECT_ID = 'demo-aisa'
/** The Auth emulator's address — fixed by the image, see the header. */
const AUTH_HOST = E2E_PUBLIC_EXTRAS.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
const FIREBASE_BIN = join(ROOT, 'node_modules', '.bin', 'firebase')
const EMULATOR_READY_MS = 90_000

// ── arguments ────────────────────────────────────────────────────────────────

let shards = DEFAULT_SHARDS
const playwrightArgs: string[] = []
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index] as string
  if (arg === '--shards' || arg.startsWith('--shards=')) {
    const value = arg.includes('=') ? arg.split('=')[1] : argv[++index]
    shards = Number(value)
    if (!Number.isInteger(shards) || shards < 1 || shards > 9) {
      console.error(`--shards must be a whole number from 1 to 9, not ${value}`)
      process.exit(1)
    }
  } else if (arg !== '--') {
    playwrightArgs.push(arg)
  }
}

const started = Date.now()
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`
const say = (line: string) => console.log(`[e2e-fast ${elapsed()}] ${line}`)

if (process.platform !== 'linux') {
  console.error(
    `Refusing to run: the shard containers use \`--network host\`, which only\n` +
      `shares the host's loopback on Linux (see scripts/e2e-container.ts).`,
  )
  process.exit(1)
}
requireDocker('run against the production image')

rmSync(RUN_DIR, { recursive: true, force: true })
mkdirSync(RUN_DIR, { recursive: true })

// ── child processes ──────────────────────────────────────────────────────────

/** Run a command with stdout+stderr appended to `log`; resolves to its exit code. */
function runToLog(
  command: string,
  args: string[],
  log: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const fd = openSync(log, 'a')
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', fd, fd],
    })
    child.on('error', reject)
    child.on('close', (code) => resolvePromise(code ?? 1))
  })
}

function tail(log: string, lines = 40): string {
  return existsSync(log)
    ? readFileSync(log, 'utf8').split('\n').slice(-lines).join('\n')
    : `(no log at ${log})`
}

/**
 * `playwright` loads the config, and the config refuses to load without a
 * target (`e2e/target.ts`). Listing and merging dial nothing, so a placeholder
 * that nothing listens on is enough.
 */
const PLACEHOLDER_ENV = { E2E_BASE_URL: 'http://localhost:9' }

/** The parts of Playwright's JSON report this script reads. */
interface ReportSuite {
  specs?: {
    file: string
    line: number
    title: string
    tests: { status: string }[]
  }[]
  suites?: ReportSuite[]
}
interface JsonReport {
  suites?: ReportSuite[]
  errors?: { message: string }[]
  stats: {
    expected: number
    unexpected: number
    flaky: number
    skipped: number
  }
}

function eachTest(
  report: JsonReport,
  visit: (
    spec: NonNullable<ReportSuite['specs']>[number],
    test: { status: string },
  ) => void,
): void {
  const walk = (suite: ReportSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) visit(spec, test)
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of report.suites ?? []) walk(suite)
}

// ── 1. what to run ───────────────────────────────────────────────────────────

const listed = spawnSync(
  'playwright',
  ['test', '--list', '--reporter=json', ...playwrightArgs],
  {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...PLACEHOLDER_ENV },
  },
)
let listing: JsonReport
try {
  listing = JSON.parse(listed.stdout) as JsonReport
} catch {
  console.error(
    `\`playwright test --list\` printed no report:\n${listed.stderr}`,
  )
  process.exit(1)
}
if (listing.errors?.length) {
  for (const error of listing.errors) console.error(error.message)
  process.exit(1)
}
let listedTests = 0
eachTest(listing, () => listedTests++)
if (listedTests === 0) {
  console.error('No tests match those arguments.')
  process.exit(1)
}
const shardCount = Math.min(shards, listedTests)
say(
  `${listedTests} tests on ${shardCount} shard(s)` +
    (shardCount < shards
      ? ` (asked for ${shards}; capped at the test count)`
      : ''),
)

// ── 2. emulators ─────────────────────────────────────────────────────────────

const emulators: ChildProcess[] = []
/** Firestore ports THIS run started an emulator on — the only ones it sweeps. */
const ownFirestorePorts: number[] = []
const firestorePort = (index: number) => FIRESTORE_BASE_PORT + index

/**
 * Start one `firebase emulators:start` with a config generated for it, in its
 * own directory (so its debug logs do not collide with another's), in its own
 * process group (so stopping it also stops the JVM it spawns).
 *
 * Every host is pinned to 127.0.0.1: an Auth emulator on 0.0.0.0 would mint a
 * session for any email to anyone on the network. The UI is off, and the hub
 * and logging ports are pinned per `slot`: left unset, every instance reserves
 * logging port 4500 and all but the first exit with EADDRINUSE (driven — the
 * Auth emulator printed "All emulators ready" and then died of it). The bases
 * sit above the defaults (4400/4500) so a developer's own emulators do not
 * collide either.
 */
interface Emulator {
  child: ChildProcess
  log: string
}

function startEmulator(
  label: string,
  slot: number,
  only: 'auth' | 'firestore',
  port: number,
  extra: Record<string, unknown> = {},
): Emulator {
  const dir = join(RUN_DIR, `emulator-${label}`)
  mkdirSync(dir, { recursive: true })
  const config = {
    ...(only === 'firestore'
      ? { firestore: { rules: join(ROOT, 'firestore.rules') } }
      : {}),
    emulators: {
      [only]: { host: '127.0.0.1', port, ...extra },
      hub: { host: '127.0.0.1', port: 4410 + slot },
      logging: { host: '127.0.0.1', port: 4510 + slot },
      ui: { enabled: false },
      singleProjectMode: true,
    },
  }
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify(config, null, 2))
  const log = join(dir, 'emulator.log')
  const fd = openSync(log, 'a')
  const child = spawn(
    FIREBASE_BIN,
    [
      'emulators:start',
      '--project',
      PROJECT_ID,
      '--only',
      only,
      '--config',
      join(dir, 'firebase.json'),
    ],
    { cwd: dir, detached: true, stdio: ['ignore', fd, fd] },
  )
  emulators.push(child)
  if (only === 'firestore') ownFirestorePorts.push(port)
  return { child, log }
}

/**
 * Resolve once anything answers HTTP on `port`; throw with the log if it does
 * not in time, or as soon as the emulator process exits.
 */
async function waitForPort(
  port: number,
  label: string,
  { child, log }: Emulator,
): Promise<void> {
  const deadline = Date.now() + EMULATOR_READY_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `The ${label} emulator exited ${child.exitCode} before answering on 127.0.0.1:${port}.\n${tail(log)}`,
      )
    }
    if (await fetch(`http://127.0.0.1:${port}/`).catch(() => undefined)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `The ${label} emulator never answered on 127.0.0.1:${port}.\n${tail(log)}`,
  )
}

/**
 * The pid of a Firestore emulator JVM listening on `port`, if any.
 *
 * Needed because firebase-tools spawns the JVM `detached`, in a process group
 * of its own: when the `firebase` process dies first (driven: a port clash at
 * startup), signalling its group never reaches the JVM, which keeps the port
 * and its data. Only a process whose command line names the Firestore emulator
 * is ever returned, so this cannot pick some unrelated server.
 */
function firestoreJvmOn(port: number): number | undefined {
  const listing = spawnSync('ss', ['-ltnpH', `sport = :${port}`], {
    encoding: 'utf8',
  }).stdout
  const pid = Number(/pid=(\d+)/u.exec(listing ?? '')?.[1])
  if (!pid) return undefined
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.includes('cloud-firestore-emulator') ? pid : undefined
  } catch {
    return undefined
  }
}

/**
 * SIGINT each emulator's process group, SIGKILL whatever is left, then kill any
 * Firestore JVM still holding one of this run's ports (see `firestoreJvmOn`).
 */
async function stopEmulators(): Promise<void> {
  const live = emulators.filter((child) => child.exitCode === null && child.pid)
  const closed = live.map(
    (child) =>
      new Promise<void>((resolve) => {
        child.once('close', () => resolve())
      }),
  )
  for (const child of live) {
    try {
      process.kill(-(child.pid as number), 'SIGINT')
    } catch {
      // already gone
    }
  }
  await Promise.race([
    Promise.all(closed),
    new Promise((resolve) => setTimeout(resolve, 15_000)),
  ])
  for (const child of live) {
    try {
      process.kill(-(child.pid as number), 'SIGKILL')
    } catch {
      // already gone
    }
  }
  for (const port of ownFirestorePorts) {
    const pid = firestoreJvmOn(port)
    if (pid) process.kill(pid, 'SIGKILL')
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void stopEmulators().finally(() => process.exit(130))
  })
}

/** Start the emulators and seed each shard's Firestore. */
async function prepareEmulators(): Promise<void> {
  // Something on the Auth port would be adopted by every shard — a developer's
  // `pnpm dev` emulator with their own data in it. Refuse instead.
  const authPort = Number(AUTH_HOST.split(':')[1])
  if (await fetch(`http://${AUTH_HOST}/`).catch(() => undefined)) {
    throw new Error(
      `Something already answers on ${AUTH_HOST} — a running \`pnpm dev\` or\n` +
        '`pnpm emulators`, or another E2E run. Stop it first: the image can only\n' +
        'sign in against an Auth emulator on exactly that address.',
    )
  }
  // Same for a Firestore port: the readiness probe would take a leftover
  // emulator (with a previous run's data in it) for the one this run started.
  for (let index = 1; index <= shardCount; index++) {
    const port = firestorePort(index)
    if (await fetch(`http://127.0.0.1:${port}/`).catch(() => undefined)) {
      const pid = firestoreJvmOn(port)
      throw new Error(
        `Something already answers on 127.0.0.1:${port}, shard ${index}'s Firestore port` +
          (pid
            ? ` — a Firestore emulator, pid ${pid}, likely left by an interrupted run.`
            : '.') +
          '\nStop it, or move the shard ports with E2E_FAST_FIRESTORE_BASE_PORT.',
      )
    }
  }
  const auth = startEmulator('auth', 0, 'auth', authPort)
  const waits = [waitForPort(authPort, 'Auth', auth)]
  for (let index = 1; index <= shardCount; index++) {
    const port = firestorePort(index)
    const emulator = startEmulator(
      `firestore-${index}`,
      index,
      'firestore',
      port,
      {
        websocketPort: port + 1000,
      },
    )
    waits.push(waitForPort(port, `Firestore (shard ${index})`, emulator))
  }
  await Promise.all(waits)
  say(`emulators up: auth ${AUTH_HOST}, firestore ${shardCount} instance(s)`)

  // One at a time: every seed upserts the same accounts into the one Auth
  // emulator, and two concurrent creates of one email race to "already exists".
  for (let index = 1; index <= shardCount; index++) {
    const log = join(RUN_DIR, `seed-${index}.log`)
    const code = await runToLog('node', ['scripts/seed-emulator.ts'], log, {
      ...process.env,
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
      FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort(index)}`,
    })
    if (code !== 0)
      throw new Error(`seed of shard ${index} exited ${code}:\n${tail(log)}`)
  }
  say(`seeded ${shardCount} shard(s)`)
}

async function buildImage(): Promise<void> {
  const log = join(RUN_DIR, 'build.log')
  say(`building ${E2E_TAG} (log: ${log})`)
  const code = await runToLog(
    'docker',
    productionBuildArgs({
      tag: E2E_TAG,
      sha: shortSha(),
      builtAt: new Date().toISOString(),
      publicExtras: E2E_PUBLIC_EXTRAS,
    }),
    log,
  )
  if (code !== 0) throw new Error(`docker build exited ${code}:\n${tail(log)}`)
  say(`built ${E2E_TAG}`)
}

// ── 3. the shards ────────────────────────────────────────────────────────────

function runShard(index: number): Promise<number> {
  const logPath = join(RUN_DIR, `shard-${index}.log`)
  const log = createWriteStream(logPath)
  const child = spawn(
    'node',
    [
      'scripts/e2e-container.ts',
      `--shard=${index}/${shardCount}`,
      '--fully-parallel',
      '--output',
      join(RUN_DIR, `out-${index}`),
      '--reporter=list,blob',
      ...playwrightArgs,
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        E2E_PORT: String(BASE_PORT + index - 1),
        E2E_IMAGE: E2E_TAG,
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort(index)}`,
        AISA_API_URL: `http://127.0.0.1:${AISA_API_BASE_PORT + index}`,
        PLAYWRIGHT_BLOB_OUTPUT_DIR: join(RUN_DIR, `blob-${index}`),
      },
    },
  )
  const prefix = (stream: NodeJS.ReadableStream) => {
    let pending = ''
    stream.on('data', (chunk: Buffer) => {
      log.write(chunk)
      pending += chunk.toString()
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) process.stdout.write(`[s${index}] ${line}\n`)
    })
    stream.on('end', () => {
      if (pending) process.stdout.write(`[s${index}] ${pending}\n`)
    })
  }
  prefix(child.stdout)
  prefix(child.stderr)
  return new Promise((resolvePromise) => {
    child.on('close', (code) => {
      log.end()
      resolvePromise(code ?? 1)
    })
  })
}

let codes: number[] = []
try {
  await Promise.all([buildImage(), prepareEmulators()])
  for (let index = 1; index <= shardCount; index++) {
    say(
      `shard ${index}: app :${BASE_PORT + index - 1}, firestore :${firestorePort(index)}, aisa-api :${AISA_API_BASE_PORT + index}`,
    )
  }
  codes = await Promise.all(
    Array.from({ length: shardCount }, (_, offset) => runShard(offset + 1)),
  )
  say(`shards exited ${codes.join(', ')}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await stopEmulators()
  process.exit(1)
}
await stopEmulators()

// A failing shard's log was already streamed with its `[s<i>]` prefix, but
// interleaved with every other shard's; print each failing one whole, in order.
for (const [offset, code] of codes.entries()) {
  if (code === 0) continue
  const index = offset + 1
  console.log(`\n===== shard ${index} (exit ${code}) =====`)
  console.log(readFileSync(join(RUN_DIR, `shard-${index}.log`), 'utf8'))
  console.log(
    `===== firestore emulator, shard ${index}: ${join(RUN_DIR, `emulator-firestore-${index}`, 'emulator.log')}`,
  )
}

// ── 4. one report ────────────────────────────────────────────────────────────

const blobs = join(RUN_DIR, 'blobs')
mkdirSync(blobs, { recursive: true })
for (let index = 1; index <= shardCount; index++) {
  const dir = join(RUN_DIR, `blob-${index}`)
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.zip'))) {
    copyFileSync(join(dir, file), join(blobs, `s${index}-${file}`))
  }
}
const mergedFile = join(RUN_DIR, 'merged.json')
const merged = spawnSync(
  'playwright',
  ['merge-reports', '--reporter=json', blobs],
  {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      ...PLACEHOLDER_ENV,
      PLAYWRIGHT_JSON_OUTPUT_FILE: mergedFile,
    },
  },
)
if (merged.status !== 0 || !existsSync(mergedFile)) {
  console.error(
    `[e2e-fast] playwright merge-reports exited ${merged.status}; no merged report. Shard exits: ${codes.join(', ')}`,
  )
  process.exit(1)
}

const report = JSON.parse(readFileSync(mergedFile, 'utf8')) as JsonReport
const unexpected: string[] = []
let ran = 0
eachTest(report, (spec, test) => {
  ran++
  if (test.status === 'unexpected' || test.status === 'flaky') {
    unexpected.push(`${test.status}: ${spec.file}:${spec.line} › ${spec.title}`)
  }
})

const { stats } = report
console.log(
  `\n[e2e-fast] ${ran}/${listedTests} tests ran on ${shardCount} shard(s) in ${elapsed()}: ` +
    `${stats.expected} expected, ${stats.unexpected} unexpected, ${stats.flaky} flaky, ${stats.skipped} skipped`,
)
for (const line of unexpected) console.log(`  ${line}`)
console.log(`  logs: ${RUN_DIR}/shard-<i>.log, report: ${mergedFile}`)
if (ran !== listedTests) {
  console.error(
    `[e2e-fast] ${listedTests - ran} listed test(s) never ran — see the shard logs.`,
  )
}

// A flaky test (failed, then passed on its CI retry) does not fail the run, the
// same as under one `playwright test` — `playwright.config.ts` gives CI exactly
// one retry for infrastructure flake. It is listed above, so it is not hidden.
const ok =
  codes.every((code) => code === 0) &&
  ran === listedTests &&
  stats.unexpected === 0
process.exit(ok ? 0 : 1)
