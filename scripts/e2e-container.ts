/**
 * `pnpm test:e2e:container` — run the browser suite against the PRODUCTION IMAGE.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT AS PLAYWRIGHT `webServer`: the obvious
 * arrangement — let Playwright start `next start` — does not drive the artifact,
 * and Next says so itself. The image runs `CMD ["node", "server.js"]` out of
 * `.next/standalone`; `next start` serves `.next` through the ordinary server and
 * prints, verbatim, on this repo's own build:
 *
 *   ⚠ "next start" does not work with "output: standalone" configuration.
 *     Use "node .next/standalone/server.js" instead.
 *
 * A suite driven that way is green while the shipped image serves an unstyled,
 * JS-less page — the exact failure `smoke-image.ts` says nothing else can see. So
 * the thing under test here is the container: same entrypoint, same traced deps,
 * same `COPY .next/static`, same non-root user.
 *
 * THE NETWORKING, which is the part worth reading:
 *
 * `--network host`. The app must reach the Firebase emulators, and
 * `firebase emulators:start` binds 127.0.0.1 — so a normal bridged container
 * cannot reach them even with `host.docker.internal` mapped (driven; the header
 * of `compose.yaml` records the same finding). The alternatives were:
 *
 *   - rebind the emulators to 0.0.0.0 in `firebase.json` — REJECTED. That
 *     publishes an auth emulator that mints a valid session for ANY email you
 *     name, to every machine on the network, for every developer who ever runs
 *     this repo. A test convenience is not worth that.
 *   - `--add-host host.docker.internal:host-gateway` — does not help; the
 *     emulator is not listening on the address that resolves to.
 *
 * Host networking shares the host's network namespace, so 127.0.0.1 INSIDE the
 * container is the same loopback the emulators are already bound to. Nothing is
 * published, nothing new is reachable from outside this machine, and no tracked
 * file has to be loosened. The cost is that it is Linux-only — on macOS/Windows
 * Docker runs in a VM and `--network host` does not share the host's loopback.
 * That cost is stated rather than hidden: this script refuses those platforms and
 * says why, instead of running and failing at sign-in with a wrong-password error.
 *
 * WHAT MUST ALREADY BE RUNNING: the emulators, seeded, named by
 * `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`. This script does
 * not start them — `pnpm test:e2e:ci` (`scripts/e2e-fast.ts`) does, once per
 * shard, and runs this script for each shard. The container gets the SAME two
 * hosts the caller has, which is correct only because of `--network host`.
 *
 * `AISA_API_URL` reaches BOTH the container and Playwright unchanged (default
 * `DEFAULT_AISA_API_URL`), so the mock `aisa-api` a write-path spec starts
 * (`e2e/acceptance/mock-aisa-api.ts`) listens exactly where the dashboard calls.
 *
 * ARGUMENTS go straight to `playwright test` (spec files, `--grep`, `--shard`).
 *
 * `E2E_IMAGE` names an image a caller already built from this working tree with
 * `E2E_PUBLIC_EXTRAS`; the build is then skipped. Without it, this script builds
 * `E2E_TAG` itself.
 */
import { spawnSync } from 'node:child_process'

import {
  E2E_PUBLIC_EXTRAS,
  E2E_TAG,
  buildProductionImage,
  containerName,
  docker,
  minimalRuntimeEnv,
  removeContainer,
  requireDocker,
  shortSha,
} from './_container.ts'

/**
 * The port the container publishes on the host — and, under `--network host`, the
 * port the app binds directly. NOT 3000: that is the port a developer's own
 * `pnpm dev` already holds, and an E2E run that silently drove a DEV server would
 * pass while proving nothing about a production build.
 *
 * Kept in step with `e2e/target.ts`, which is where the suite reads its origin.
 */
const PORT = process.env.E2E_PORT ?? '3100'

/** How long the container gets to answer a healthy `/api/health`. */
const READY_TIMEOUT_MS = 120_000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

if (process.platform !== 'linux') {
  console.error(
    `Refusing to run: this needs \`--network host\`, which only shares the host's\n` +
      `loopback on Linux. On ${process.platform}, Docker runs in a VM and the\n` +
      `container could not reach the Firebase emulators on 127.0.0.1 — every test\n` +
      `would fail at sign-in with what looks like a wrong password.\n\n` +
      `Run the suite against a target you started yourself instead:\n` +
      `  E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`,
  )
  process.exit(1)
}

requireDocker('run against the production image')

const emulatorHosts = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']
const missing = emulatorHosts.filter((name) => !process.env[name])
if (missing.length > 0) {
  console.error(
    `Refusing to run: ${missing.join(' and ')} not set, so the emulators are\n` +
      'not running (or this was not launched through them). The suite signs in as\n' +
      'a seeded account and reads Firestore; without an emulator every test fails\n' +
      'at sign-in.\n\n' +
      'Use the wrapper that owns their lifecycle:\n' +
      '  pnpm test:e2e:ci',
  )
  process.exit(1)
}

const base = `http://localhost:${PORT}`

// Under `--network host` the container binds the host's port directly, so if
// something already answers there, a second container dies of EADDRINUSE while
// THAT server keeps answering /api/health — and the suite would drive somebody
// else's app and report on it. Refuse before building anything.
if (await fetch(`${base}/api/health`).catch(() => undefined)) {
  console.error(
    `Refusing to run: something already answers on ${base}.\n` +
      'Stop it (another E2E run? `docker ps | grep e2e-`) or pick another port\n' +
      'with E2E_PORT.',
  )
  process.exit(1)
}

const image = process.env.E2E_IMAGE || E2E_TAG
if (!process.env.E2E_IMAGE) {
  console.log(`Building ${image} …\n`)
  buildProductionImage({
    tag: image,
    sha: shortSha(),
    builtAt: new Date().toISOString(),
    publicExtras: E2E_PUBLIC_EXTRAS,
  })
}

/** Both of the container's log streams: a dead server tells its story on stderr. */
function printContainerLogs(): void {
  const logs = docker(['logs', name], { quiet: true })
  console.error('\n--- container logs ---')
  if (logs.stdout) console.error(logs.stdout)
  if (logs.stderr) console.error(logs.stderr)
  console.error('--- end logs ---')
}

// Named BEFORE the run so cleanup works even if `docker run` fails after the
// daemon created the container — see `containerName`.
const name = containerName('e2e')
let exitCode = 1

try {
  // The caller's own emulator hosts, and passing them through unchanged is only
  // correct BECAUSE of `--network host`: inside the container, loopback is the
  // host's loopback. The guard above proved both are set.
  const runtimeEnv = {
    ...minimalRuntimeEnv('127.0.0.1'),
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST as string,
    FIREBASE_AUTH_EMULATOR_HOST: process.env
      .FIREBASE_AUTH_EMULATOR_HOST as string,
  }
  const started = docker(
    [
      'run',
      '--detach',
      '--name',
      name,
      '--network',
      'host',
      '--env',
      `PORT=${PORT}`,
      ...Object.entries(runtimeEnv).flatMap(([key, value]) => [
        '--env',
        `${key}=${value}`,
      ]),
      image,
    ],
    { quiet: true },
  )
  if (started.status !== 0) {
    console.error(`\n\`docker run\` failed:\n${started.stderr}`)
  } else {
    console.log(`Container ${name} → ${base}\n`)

    // Wait on the app's OWN health route rather than on the image HEALTHCHECK:
    // under `--network host` the healthcheck probes the same port from inside the
    // same namespace, so it proves less here than it does in `smoke-image.ts`,
    // and what this script needs to know is that a CLIENT can get a response.
    //
    // `no-store` is asserted, not just observed, because a cached health response
    // is how a dead container keeps reporting alive through a proxy.
    let ready = false
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- readiness poll: one probe, then a pause, until the deadline
      const response = await fetch(`${base}/api/health`).catch(() => undefined)
      if (response?.ok) {
        const cacheControl = response.headers.get('cache-control')
        if (cacheControl !== 'no-store') {
          console.error(
            `\n/api/health answered ${response.status} but with ` +
              `cache-control: ${cacheControl ?? '(absent)'} — expected no-store.`,
          )
          break
        }
        ready = true
        break
      }
      // oxlint-disable-next-line no-await-in-loop -- the pause between readiness probes
      await delay(2000)
    }

    if (!ready) {
      console.error('\nThe container never answered a healthy /api/health.')
      printContainerLogs()
    } else {
      console.log('Health OK (200, no-store). Running the browser suite …\n')
      // `E2E_BASE_URL` is what tells `e2e/target.ts` that something else owns the
      // app's lifecycle, so Playwright drives and never starts anything.
      const playwright = spawnSync(
        'playwright',
        ['test', ...process.argv.slice(2)],
        { stdio: 'inherit', env: { ...process.env, E2E_BASE_URL: base } },
      )
      exitCode = playwright.status ?? 1
      if (exitCode !== 0) printContainerLogs()
    }
  }
} finally {
  // By NAME, unconditionally: a container left on host networking holds the port
  // the next run needs, and the failure path is exactly when a human stops
  // reading and forgets.
  removeContainer(name)
  console.log(`\nRemoved container ${name}.`)
}

process.exit(exitCode)
