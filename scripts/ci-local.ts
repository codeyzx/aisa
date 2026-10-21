/**
 * `pnpm ci:local` — run this repo's REAL `.github/workflows/ci.yml` locally, in
 * containers, via nektos/act. There is no second list of steps to keep in sync:
 * ci.yml is the single source of truth, and this wrapper only supplies the flags
 * act needs to run it faithfully and safely.
 *
 * WHY THIS EXISTS: the container `artifact` job runs on CI only at merge-to-main
 * (see ci.yml), and a Free-plan minute budget can run out. This is the fallback —
 * the whole workflow on your own machine, on the SHIPPED Node (act runs the
 * workflow's own `setup-node@.node-version`, so 24.18, not whatever this host's
 * version manager serves). That closes the local-vs-container skew this repo's
 * CLAUDE.local.md documents.
 *
 * THE act BINARY IS FETCHED ON FIRST USE, not at install. `@kie/act-js` pins the
 * act version but its download postinstall is disabled in pnpm-workspace.yaml
 * (`'@kie/act-js': false`) so a normal `pnpm install` and the Containerfile deps
 * layer never pull a ~30MB tool the app does not run. We run that same postinstall
 * here, once, when it is actually needed.
 *
 * FIDELITY IS ~90%, NOT 100%. act's images are containers, not GitHub's VMs, and
 * the `artifact` job runs docker-in-docker (image build + Trivy) through the host
 * daemon socket act mounts — the part most likely to differ. Treat a green run
 * here as strong local evidence, not as the authority; GitHub's runners remain
 * that. See docs/how-to/verify-change.md.
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/**
 * The act version to run — PINNED HERE, not inherited from `@kie/act-js@2.6.2`,
 * which hardcodes 0.2.61. act itself flags 0.2.61 as vulnerable to CVE-2026-34041
 * and CVE-2026-34042 and asks for >= 0.2.86; 0.2.89 is the release it names.
 * act-js is only the DOWNLOAD MECHANISM (its postinstall honors an ACT_VERSION
 * env) and its programmatic API is unused, so the version is ours to choose and
 * audit. Bump this the way the Trivy pin is bumped — deliberately, on a notice.
 */
const ACT_VERSION = '0.2.89'

/** The act version currently on disk, or undefined if the binary is absent/broken. */
function installedVersion(bin: string): string | undefined {
  if (!existsSync(bin)) return undefined
  try {
    return execFileSync(bin, ['--version'], { encoding: 'utf8' }).match(
      /(\d+\.\d+\.\d+)/,
    )?.[1]
  } catch {
    return undefined
  }
}

/**
 * Resolve the act binary, fetching the PINNED version on first use (or replacing a
 * stale one). `@kie/act-js`'s download postinstall is disabled in
 * pnpm-workspace.yaml, so a normal `pnpm install` and the Containerfile deps layer
 * never pull it — this is the one place that does, and only when actually running.
 * `ACT_BINARY` is act-js's own override hook, honored so a contributor can point at
 * a system act (they own its version then).
 */
function actBinary(): string {
  const override = process.env.ACT_BINARY
  if (override) return override

  const pkgDir = dirname(require.resolve('@kie/act-js/package.json'))
  const bin = join(
    pkgDir,
    'build',
    'bin',
    process.platform === 'win32' ? 'act.exe' : 'act',
  )

  if (installedVersion(bin) !== ACT_VERSION) {
    // Reuse act-js's downloader with OUR version. Its postinstall reads ACT_VERSION
    // from the env when no version arg is passed, and writes to build/bin/.
    console.log(`ci-local: fetching pinned act ${ACT_VERSION} on first use...`)
    execSync('node scripts/postinstall.js', {
      cwd: pkgDir,
      env: { ...process.env, ACT_VERSION },
      stdio: 'inherit',
    })
    if (installedVersion(bin) !== ACT_VERSION) {
      throw new Error(
        `ci-local: act ${ACT_VERSION} still not present after fetch at ${bin}.`,
      )
    }
    // Mirror the binary to the package's declared bin path so pnpm stops warning it
    // cannot create the `.bin/act-js` link on the next install (cosmetic, harmless).
    const declaredBin = join(pkgDir, 'bin', 'act')
    mkdirSync(dirname(declaredBin), { recursive: true })
    copyFileSync(bin, declaredBin)
  }
  return bin
}

// `--fresh` is ours, not act's: everything else passes straight through to act
// (e.g. `-j gate` to run one job, `-n` for a dry run, `-l` to list).
const passthrough = process.argv.slice(2)
const fresh = passthrough.includes('--fresh')
const forwarded = passthrough.filter((a) => a !== '--fresh')

// Forge a push-to-`main` event. ci.yml gates the `artifact` job on
// `github.event_name == 'push' && github.ref == 'refs/heads/main'`; a full local
// run should EXERCISE that job, not skip it the way a feature-branch push would.
// A single-key payload is enough — act fills the rest of the context from defaults.
const eventDir = mkdtempSync(join(tmpdir(), 'ci-local-'))
const eventPath = join(eventDir, 'event.json')
writeFileSync(eventPath, JSON.stringify({ ref: 'refs/heads/main' }))

const args = ['push', '--eventpath', eventPath]
if (fresh) {
  // Full from scratch: no restored actions/cache hits (deps, emulators, browsers
  // all re-fetched) and a forced image re-pull.
  args.push('--no-cache-server', '--pull')
} else {
  // Reuse the persistent cache server (act's default, ~/.cache/actcache) and the
  // already-pulled image, so a repeat run is fast.
  args.push('--pull=false')
}
args.push(...forwarded)

console.log(
  `ci-local: running ci.yml via act (${fresh ? 'fresh — caching OFF' : 'cached'}).\n` +
    'ci-local: the FIRST run pulls a multi-GB runner image and the emulator/browser\n' +
    'ci-local: toolchains; later runs reuse them. This mirrors CI, it is not the authority.',
)

const result = spawnSync(actBinary(), args, {
  cwd: process.cwd(),
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
