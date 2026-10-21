/**
 * Shared plumbing for the scripts that run the PRODUCTION IMAGE:
 * `smoke-image.ts` (does the artifact hold together?), and `e2e-container.ts`
 * with its sharded driver `e2e-fast.ts` (does a browser get a working app out
 * of it?).
 *
 * Extracted rather than copied because the copy that drifted would be the one
 * that stopped building the artifact under test — a smoke of one image and an
 * E2E against a different one, both green, is the worst outcome available here.
 *
 * The `_` prefix marks a shared, non-entry module: imported, never run, the same
 * way `_safety.ts` and `snapshot/_admin.ts` are.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

import { PUBLIC_ENV_FIXTURE } from './public-env-fixture.ts'

/** Tag `smoke-image.ts` builds when it is not handed an image. */
export const LOCAL_TAG = 'aisa:smoke'

/**
 * Tag the E2E runners build. Separate from `LOCAL_TAG` because an E2E image is
 * a different artifact: it carries `E2E_PUBLIC_EXTRAS` in its client bundle.
 */
export const E2E_TAG = 'aisa:e2e'

export interface DockerResult {
  status: number
  stdout: string
  stderr: string
}

/**
 * Run docker and capture its output. `shell: false` with an argv array: unlike
 * `pnpm`, `docker` is a real executable on every platform (no `.cmd` shim), so it
 * spawns directly — and it must, because the argv carries a generated secret and
 * an argv element is never re-parsed by a shell.
 */
export function docker(
  args: string[],
  options: { quiet?: boolean } = {},
): DockerResult {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : ['ignore', 'pipe', 'inherit'],
    // Docker build output is long; give it room rather than truncating at the
    // default 1MB and leaving a failure unreadable.
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

/** Exit 1 with a reason unless a docker daemon is actually reachable. */
export function requireDocker(what: string): void {
  if (
    docker(['version', '--format', '{{.Server.Version}}'], { quiet: true })
      .status !== 0
  ) {
    console.error(
      `Docker is not available (or the daemon is not running), so NOTHING was\n` +
        `${what}. Exiting 1 rather than reporting an empty pass.`,
    )
    process.exit(1)
  }
}

/**
 * The `NEXT_PUBLIC_*` build arg that makes an image an E2E test artifact: the
 * browser signs in by talking to the Auth emulator ITSELF
 * (lib/firebase/client-auth.ts), and it only does that when this host is
 * inlined into the client bundle. Without it the browser tries real Firebase
 * with the fixture's dummy API key and every test dies on the login page.
 *
 * `127.0.0.1:9099` is the BROWSER's view: Playwright runs on the host, where the
 * Auth emulator is bound. Because it is baked in at build time, every run of an
 * E2E image needs an Auth emulator on exactly this port.
 */
export const E2E_PUBLIC_EXTRAS = {
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
} as const

export interface BuildOptions {
  tag: string
  sha: string
  builtAt: string
  /**
   * Extra `NEXT_PUBLIC_*` build args. Only the E2E runners pass any
   * (`E2E_PUBLIC_EXTRAS`) — see the warning on that ARG in the Containerfile.
   * An image built with it is a test artifact.
   */
  publicExtras?: Record<string, string>
}

/**
 * The full `docker` argv that builds the production image from the working
 * tree — returned rather than run, so a caller that has other work to do while
 * the image builds (`e2e-fast.ts`) can spawn it asynchronously.
 *
 * The six `NEXT_PUBLIC_FIREBASE_*` build args come from the shared fixture unless
 * the caller exported real ones. They are INLINED into the client bundle, so an
 * image built this way is a test artifact and not a deployable one — but the six
 * must be PRESENT, because `next.config.ts` fails the build without them.
 */
export function productionBuildArgs(options: BuildOptions): string[] {
  const buildArgs = [
    ...Object.entries(PUBLIC_ENV_FIXTURE),
    ...Object.entries(options.publicExtras ?? {}),
  ].flatMap(([key, value]) => [
    '--build-arg',
    `${key}=${process.env[key] ?? value}`,
  ])
  const commonArgs = [
    '--tag',
    options.tag,
    '--file',
    'Containerfile',
    ...buildArgs,
    '--build-arg',
    `BUILD_SHA=${options.sha}`,
    '--build-arg',
    `BUILT_AT=${options.builtAt}`,
    '.',
  ]

  // Persist BuildKit LAYERS across CI runs, so an unchanged deps layer is reused
  // rather than a full `pnpm install` on every merge build. ONLY on a real GitHub
  // runner: `GITHUB_ACTIONS` is set there and `ACT` is not (act sets `ACT=true`).
  // The `type=local` cache export needs a docker-container builder, which ci.yml
  // stands up with docker/setup-buildx-action ONLY on that same condition — under
  // act and on a laptop the plain `docker build` below runs unchanged, the
  // fresh-machine build these scripts have always done. `--cache-from` a missing
  // dir is a clean miss on the first run, not an error.
  const ciLayerCache =
    process.env.GITHUB_ACTIONS === 'true' && process.env.ACT !== 'true'

  return ciLayerCache
    ? [
        'buildx',
        'build',
        '--load',
        '--cache-from',
        'type=local,src=/tmp/.buildx-cache',
        '--cache-to',
        'type=local,dest=/tmp/.buildx-cache-new,mode=max',
        ...commonArgs,
      ]
    : ['build', ...commonArgs]
}

/** Build the production image (see `productionBuildArgs`); exit 1 on failure. */
export function buildProductionImage(options: BuildOptions): void {
  if (docker(productionBuildArgs(options)).status !== 0) {
    console.error('\n`docker build` failed — see the output above.')
    process.exit(1)
  }
}

/** The short commit the build stamp reports, or `e2e` outside a git checkout. */
export function shortSha(): string {
  return (
    spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).stdout?.trim() || 'e2e'
  )
}

/**
 * The MINIMUM runtime env `lib/env/registry.ts` accepts, and no more — a run that
 * only works with a fully-populated production `.env` would not tell a deployer
 * which variables the container actually needs.
 *
 * The emulator hosts are the caller's to choose, and the choice is load-bearing:
 * setting them makes `isEmulatorTarget()` read true, which is what lets the
 * container boot with NO Firebase credential. Whether anything is LISTENING on
 * them is a separate question that this env cannot answer — see each caller.
 */
export function minimalRuntimeEnv(
  emulatorHost: string,
): Record<string, string> {
  return {
    FIREBASE_PROJECT_ID: 'demo-aisa',
    FIRESTORE_EMULATOR_HOST: `${emulatorHost}:8080`,
    FIREBASE_AUTH_EMULATOR_HOST: `${emulatorHost}:9099`,
    // Required at boot. Dummy, test-only values: the container they reach is a
    // local test artifact talking to emulators.
    AISA_API_URL: process.env.AISA_API_URL ?? 'http://127.0.0.1:8787',
    AISA_API_KEY: process.env.AISA_API_KEY ?? 'local-test-key',
  }
}

/**
 * A container name these scripts can always clean up by, even when `docker run`
 * itself failed.
 *
 * This exists because of a real hole: a `docker run` that fails AFTER the daemon
 * created the container (the classic case is "driver failed programming external
 * connectivity") leaves a container in `created`, and a cleanup keyed on the id
 * that `docker run` never printed cannot remove it. A name chosen BEFORE the run
 * is knowable on every path.
 */
export function containerName(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`
}

/** Remove a container by name, forced, ignoring "no such container". */
export function removeContainer(name: string): void {
  docker(['rm', '--force', name], { quiet: true })
}
