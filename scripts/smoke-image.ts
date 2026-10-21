/**
 * `pnpm smoke:image` — build the production image, run it, and prove the seven
 * things about the ARTIFACT that no other gate in this repo can see.
 *
 * WHY IT EXISTS: `pnpm verify` ends by naming its own hole out loud — "production
 * container smoke, and E2E" — because every check before it runs against the
 * WORKING TREE. `next build` proves the app compiles; it proves nothing about the
 * image the Containerfile assembles from that build. The failures this catches
 * are all failures of the ASSEMBLY, and each one is invisible to typecheck, lint,
 * build and the unit suite:
 *
 *   - a forgotten `COPY .next/static` — the app boots, answers 200, and serves
 *     an unstyled page with no JS (the single most-repeated standalone-output
 *     mistake, and the reason the static-asset check is not "does / return 200")
 *   - a `USER nextjs` line lost to a rebase — the container runs as root
 *   - `BUILD_SHA`/`BUILT_AT` set in the wrong STAGE — /api/health reports
 *     `unknown` on a stamped build, so every deploy is unidentifiable afterwards
 *   - `poweredByHeader`/`headers()` regressions — the security baseline is
 *     configuration, and configuration silently stops applying
 *   - a HEALTHCHECK that never passes — the orchestrator restarts a working
 *     container forever
 *   - an npm/pnpm wrapper reintroduced as CMD — the wrapper eats SIGTERM and
 *     every deploy becomes a hard kill of in-flight requests
 *   - a missing `Cache-Control: no-store` on the API envelope — an authenticated
 *     JSON response a proxy is allowed to cache is a cross-user data leak, and
 *     the header is owned by `lib/api/response.ts` rather than by a config file,
 *     so it can be lost to an ordinary refactor
 *
 * WHAT IT DELIBERATELY DOES NOT PROVE: anything that needs data. The container is
 * started with the emulator host variables SET BUT NOT REACHABLE (see
 * `runtimeEnv` below), which is enough for the boot fail-fast and enough for
 * /api/health — a liveness route that never touches Firestore. Sign-in and every
 * Firestore read are E2E's job (`pnpm test:e2e:ci`), not this
 * script's, and this script must not be read as covering them.
 *
 * USAGE
 *   pnpm smoke:image                      build from the working tree, then smoke it
 *   pnpm smoke:image -- --image ref:tag   smoke an image someone else built (CI)
 *
 * With `--image`, the build-identity check has nothing to compare against unless
 * you also pass the values that image was built with:
 *   SMOKE_EXPECT_BUILD_SHA=… SMOKE_EXPECT_BUILT_AT=… pnpm smoke:image -- --image ref:tag
 * Without them that one check reports NOT RUN and the run FAILS, rather than
 * quietly passing on a check it never made.
 */
import { spawnSync } from 'node:child_process'

import {
  LOCAL_TAG,
  buildProductionImage,
  containerName,
  docker,
  minimalRuntimeEnv,
  removeContainer,
  requireDocker,
} from './_container.ts'

/** How long the image's own HEALTHCHECK gets to reach `healthy`. */
const HEALTH_TIMEOUT_MS = 120_000

/** How long `docker stop` waits after SIGTERM before it escalates to SIGKILL. */
const STOP_TIMEOUT_S = 30

/**
 * A UNIX process killed by signal N exits 128+N, so SIGTERM is 143. Asserted as
 * a NUMBER rather than "not zero": Next's App Router server installs its own
 * SIGTERM handler, drains in-flight requests and then re-raises the signal
 * (node_modules/next/dist/docs/01-app/02-guides/self-hosting.md, "Manual Graceful
 * Shutdowns"). A 0 here would mean something ELSE handled the signal and exited
 * cleanly — which is what a shell wrapper reintroduced as CMD looks like — and
 * 137 would mean nothing handled it and docker escalated to SIGKILL after the
 * grace period. Both are regressions this check exists to catch, so neither may
 * be folded into the assertion.
 */
const EXPECTED_SIGTERM_EXIT = 143

/**
 * The security-header baseline, RESTATED here rather than imported from
 * `next.config.ts`.
 *
 * Two reasons, and the first is not the convenient one. `next.config.ts` calls
 * `validateClientEnv()` at module scope, so importing it from a script would
 * demand a full public env before this could check a header. The second is the
 * one that would keep this copy even if that were free: an expectation read out
 * of the file under test asserts only that the file equals itself. This list is
 * an INDEPENDENT statement of what the shipped artifact must answer with, and a
 * deliberate edit to the baseline is supposed to fail here until someone agrees
 * it twice.
 *
 * Keep in sync with `securityHeaders` in next.config.ts.
 */
const EXPECTED_SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "frame-ancestors 'none'; frame-src https://storage.googleapis.com https://drive.google.com",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'strict-transport-security': 'max-age=63072000',
  'x-robots-tag': 'noindex, nofollow, noarchive',
}

/** One named check and what actually happened. */
interface CheckResult {
  name: string
  /** `false` covers BOTH a failed check and one that could not be run at all. */
  ok: boolean
  /** What was observed — printed verbatim in the summary, pass or fail. */
  detail: string
}

const results: CheckResult[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`)
}

/**
 * A check that could not be RUN is recorded as a failure with its reason, never
 * skipped. A skipped check reads as a passed one in every summary anybody
 * actually looks at, which is how a smoke test starts lying.
 */
function recordNotRun(name: string, reason: string): void {
  record(name, false, `NOT RUN — ${reason}`)
}

function run(command: string, args: string[]): string | undefined {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  return (result.stdout ?? '').trim()
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const imageFlagIndex = argv.indexOf('--image')
const providedImage =
  imageFlagIndex === -1 ? undefined : argv[imageFlagIndex + 1]

if (imageFlagIndex !== -1 && !providedImage) {
  console.error('--image needs an image reference, e.g. --image app:1.2.3')
  process.exit(1)
}

requireDocker('smoked')

// The identity we will demand back from /api/health. When we build, we choose it
// and it is knowable; when we are handed someone else's image it is only knowable
// if the caller tells us, which is what the SMOKE_EXPECT_* variables are for.
const expectedSha = providedImage
  ? process.env.SMOKE_EXPECT_BUILD_SHA
  : (run('git', ['rev-parse', '--short', 'HEAD']) ?? `smoke-${Date.now()}`)
const expectedBuiltAt = providedImage
  ? process.env.SMOKE_EXPECT_BUILT_AT
  : new Date().toISOString()

const image = providedImage ?? LOCAL_TAG

if (!providedImage) {
  console.log(`Building ${image} …\n`)
  // `expectedSha`/`expectedBuiltAt` are non-null on this branch by construction —
  // they are only optional when the caller supplied an image we did not build.
  buildProductionImage({
    tag: image,
    sha: expectedSha as string,
    builtAt: expectedBuiltAt as string,
  })
}

/**
 * The MINIMUM runtime env `lib/env/registry.ts` accepts, and no more — a smoke
 * that passes only with a fully-populated production `.env` would not tell a
 * deployer which variables the container actually needs.
 *
 * The two emulator hosts are the load-bearing subtlety. They are set so
 * `isEmulatorTarget()` reads true and the Admin credential block is skipped, which
 * is what lets this run with NO Firebase secret at all. Nothing here dials them,
 * and NOTHING IN THIS SCRIPT WOULD NOTICE IF THEY WERE WRONG: /api/health never
 * touches Firestore. That is exactly the quiet failure `compose.yaml` documents —
 * a container that reports HEALTHY while every Firestore read would fail — and it
 * is why data-path coverage is E2E's job and is not claimed here.
 */
const runtimeEnv = minimalRuntimeEnv('127.0.0.1')

// Chosen BEFORE the run, so cleanup can find the container on every path — a
// `docker run` that fails AFTER the daemon created it (the classic case is
// "driver failed programming external connectivity") leaves a container behind
// that no id-based cleanup could ever name. See `containerName`.
const name = containerName('smoke')
let containerId = ''
let stopped = false

try {
  // `127.0.0.1::3000` — loopback only, EPHEMERAL host port. This machine is not
  // the only thing on this machine: a fixed port is a collision with whatever the
  // developer already has on 3000, and the daemon picks a free one on request.
  const started = docker(
    [
      'run',
      '--detach',
      '--name',
      name,
      '--publish',
      '127.0.0.1::3000',
      ...Object.entries(runtimeEnv).flatMap(([key, value]) => [
        '--env',
        `${key}=${value}`,
      ]),
      image,
    ],
    { quiet: true },
  )
  if (started.status !== 0) {
    // NOT `process.exit` here: `process.exit` does not run `finally`, and this is
    // precisely the path that can have left a container behind.
    console.error(`\n\`docker run\` failed:\n${started.stderr}`)
    record('container starts', false, started.stderr || 'docker run failed')
    throw new Error('docker run failed')
  }
  containerId = started.stdout

  const mapping = docker(['port', containerId, '3000/tcp'], { quiet: true })
  const hostPort = mapping.stdout.split('\n')[0]?.split(':').pop()
  const base = `http://127.0.0.1:${hostPort}`
  console.log(`\nContainer ${containerId.slice(0, 12)} → ${base}\n`)

  // --- 1. the image's OWN healthcheck ------------------------------------
  // Inspected, never re-implemented: the point is that the HEALTHCHECK line in
  // the Containerfile works, and a probe written here would pass while that one
  // was broken. It doubles as this script's readiness wait, which is why it runs
  // first — the checks below need a server that is actually listening.
  let health = 'none'
  const healthDeadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < healthDeadline) {
    const inspected = docker(
      ['inspect', '--format', '{{.State.Health.Status}}', containerId],
      { quiet: true },
    )
    health = inspected.status === 0 ? inspected.stdout : `inspect failed`
    if (health === 'healthy' || health === 'unhealthy') break
    // oxlint-disable-next-line no-await-in-loop -- the pause between health probes
    await delay(2000)
  }
  record(
    'image HEALTHCHECK reaches healthy',
    health === 'healthy',
    `.State.Health.Status = ${health}`,
  )

  if (health !== 'healthy') {
    console.log('\n--- container logs ---')
    console.log(docker(['logs', containerId], { quiet: true }).stdout)
    console.log('--- end logs ---\n')
  }

  // --- 2. non-root runtime user ------------------------------------------
  const uid = docker(['exec', containerId, 'id', '-u'], { quiet: true })
  const uname = docker(['exec', containerId, 'id', '-un'], { quiet: true })
  record(
    'runtime user is not root',
    uid.status === 0 && uid.stdout !== '0',
    uid.status === 0
      ? `id -u = ${uid.stdout}, id -un = ${uname.stdout}`
      : `could not exec into the container: ${uid.stderr}`,
  )

  // --- 3. build identity --------------------------------------------------
  const healthResponse = await fetch(`${base}/api/health`).catch(
    (error: unknown) => String(error),
  )
  if (typeof healthResponse === 'string') {
    recordNotRun('build identity reported by /api/health', healthResponse)
    recordNotRun('Cache-Control: no-store on the API envelope', healthResponse)
  } else {
    const body = (await healthResponse.json()) as {
      ok?: boolean
      data?: { status?: string; sha?: string; builtAt?: string }
    }
    const observed = `HTTP ${healthResponse.status} ${JSON.stringify(body)}`
    if (!expectedSha || !expectedBuiltAt) {
      // Name the variable that is ACTUALLY missing. Saying "neither was given"
      // when one of them was sends the reader to re-add something already there,
      // and the entire contract of `recordNotRun` is that the reason is true.
      const absent = [
        expectedSha ? undefined : 'SMOKE_EXPECT_BUILD_SHA',
        expectedBuiltAt ? undefined : 'SMOKE_EXPECT_BUILT_AT',
      ].filter((variable) => variable !== undefined)
      recordNotRun(
        'build identity reported by /api/health',
        `this image was not built by this run and ${absent.join(' and ')} ` +
          `${absent.length === 1 ? 'was' : 'were'} not given, so there is ` +
          `nothing to compare against. Observed: ${observed}`,
      )
    } else {
      const matches =
        body.data?.sha === expectedSha && body.data?.builtAt === expectedBuiltAt
      record(
        'build identity reported by /api/health',
        matches,
        `expected sha=${expectedSha} builtAt=${expectedBuiltAt}; got ${observed}`,
      )
    }
    // Owned by `lib/api/response.ts`, not by next.config.ts — an authenticated
    // JSON envelope that a proxy is allowed to cache is a cross-user data leak,
    // so it is asserted on a real API response rather than assumed.
    const cacheControl = healthResponse.headers.get('cache-control')
    record(
      'Cache-Control: no-store on the API envelope',
      cacheControl === 'no-store',
      `cache-control = ${cacheControl ?? '(absent)'}`,
    )
  }

  // --- 4. security headers on a real page response ------------------------
  const page = await fetch(`${base}/login`).catch((error: unknown) =>
    String(error),
  )
  let html = ''
  if (typeof page === 'string') {
    recordNotRun('security headers on GET /login', page)
    recordNotRun('static assets are served from /_next/static', page)
  } else {
    html = await page.text()
    const wrong = Object.entries(EXPECTED_SECURITY_HEADERS)
      .map(([key, want]) => ({ key, want, got: page.headers.get(key) }))
      .filter((h) => h.got !== h.want)
    // `X-Powered-By` is the inverse assertion — `poweredByHeader: false` means it
    // must be ABSENT, so an equality check over the table above cannot see it.
    const poweredBy = page.headers.get('x-powered-by')
    record(
      'security headers on GET /login',
      wrong.length === 0 && poweredBy === null,
      wrong.length === 0 && poweredBy === null
        ? `HTTP ${page.status}; all ${Object.keys(EXPECTED_SECURITY_HEADERS).length} headers present and exact, no x-powered-by`
        : `HTTP ${page.status}; ` +
            wrong
              .map(
                (h) => `${h.key}: want ${h.want}, got ${h.got ?? '(absent)'}`,
              )
              .join('; ') +
            (poweredBy === null ? '' : `; x-powered-by leaked: ${poweredBy}`),
    )

    // --- 5. static assets ------------------------------------------------
    // The asset URL is READ OUT OF THE PAGE the server just rendered, never
    // guessed: the filenames are content-hashed per build, so a hardcoded path
    // could only ever be stale. This is the check that catches a missing
    // `COPY .next/static` — the page itself returns 200 either way, and only its
    // subresources 404.
    const assetPath = /\/_next\/static\/[^"'\s>]+/.exec(html)?.[0]
    if (!assetPath) {
      recordNotRun(
        'static assets are served from /_next/static',
        'no /_next/static URL appeared in the HTML of /login, so there was ' +
          'nothing to fetch — the page itself may be broken',
      )
    } else {
      const asset = await fetch(`${base}${assetPath}`).catch((error: unknown) =>
        String(error),
      )
      if (typeof asset === 'string') {
        recordNotRun('static assets are served from /_next/static', asset)
      } else {
        const bytes = (await asset.arrayBuffer()).byteLength
        record(
          'static assets are served from /_next/static',
          asset.status === 200 && bytes > 0,
          `${assetPath} → HTTP ${asset.status}, ${bytes} bytes`,
        )
      }
    }
  }

  // --- 6. graceful shutdown ----------------------------------------------
  // `docker stop` sends SIGTERM and waits; the exit code is the answer. This
  // asserts the SIGNAL was handled and the process ended on its own terms — it
  // does NOT prove an in-flight request was drained, which would need a slow
  // route to hold open, and this script does not claim that.
  const stop = docker(
    ['stop', '--timeout', String(STOP_TIMEOUT_S), containerId],
    { quiet: true },
  )
  stopped = stop.status === 0
  const exitCode = docker(
    ['inspect', '--format', '{{.State.ExitCode}}', containerId],
    { quiet: true },
  ).stdout
  record(
    `SIGTERM shutdown exits ${EXPECTED_SIGTERM_EXIT}`,
    exitCode === String(EXPECTED_SIGTERM_EXIT),
    `docker stop --timeout ${STOP_TIMEOUT_S} → .State.ExitCode = ${exitCode}` +
      (exitCode === '137'
        ? ' (137 = SIGKILL: the grace period expired, nothing handled SIGTERM)'
        : exitCode === '0'
          ? ' (0 = something other than the Next server handled the signal)'
          : ''),
  )
} catch (error) {
  // A throw from the block above has already been recorded as a failed check, so
  // the summary below reports it. Re-raising would skip that summary.
  console.error(`\nSmoke aborted: ${String(error)}`)
} finally {
  // Unconditional, forced, and BY NAME rather than by id: a container left
  // running holds an ephemeral port and a few hundred MB, and the failure path
  // is exactly when a human stops reading and forgets. The name is known even
  // when `docker run` never printed an id, which is the case this exists for.
  removeContainer(name)
  console.log(
    `\nRemoved container ${name}${containerId && stopped ? '' : ' (forced)'}.`,
  )
}

const failed = results.filter((r) => !r.ok)
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed.`,
)
if (failed.length > 0) {
  console.error(`FAILED: ${failed.map((r) => r.name).join(', ')}`)
  process.exit(1)
}
console.log(
  `Image ${image} smoked clean. This says nothing about the DATA path — ` +
    'run `pnpm test:e2e:ci` for that.',
)
