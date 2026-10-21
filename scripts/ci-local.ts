/**
 * `pnpm ci:local` — run this repo's REAL `.github/workflows/ci.yml` locally, in
 * containers, via nektos/act. There is no second list of steps to keep in sync:
 * ci.yml is the single source of truth, and this wrapper only supplies the flags
 * act needs to run it faithfully and safely.
 *
 * WHY THIS EXISTS: the container `artifact` job runs on CI only at merge-to-main
 * (see ci.yml), and a Free-plan minute budget can run out. This is the fallback —
 * the whole workflow on your own machine, on the SHIPPED Node (act runs the
 * workflow's own `setup-node@.node-version`, not whatever this host's
 * version manager serves). That closes the local-vs-container skew this repo's
 * CLAUDE.local.md documents.
 *
 * THE act BINARY IS FETCHED ON FIRST USE, not at install, so a normal
 * `pnpm install` and the Containerfile deps layer never pull a ~30MB tool the app
 * does not run. It comes straight from the nektos/act GitHub release and is
 * checked against a sha256 pinned below before it is ever executed.
 *
 * FIDELITY IS ~90%, NOT 100%. act's images are containers, not GitHub's VMs, and
 * the `artifact` job runs docker-in-docker (image build + Trivy) through the host
 * daemon socket act mounts — the part most likely to differ. Treat a green run
 * here as strong local evidence, not as the authority; GitHub's runners remain
 * that. See docs/how-to/verify-change.md.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The act version to run. act flags releases below 0.2.86 as vulnerable to
 * CVE-2026-34041 and CVE-2026-34042; 0.2.89 is the release it names. Bump it the
 * way the Trivy pin is bumped — deliberately, on a notice — and replace the
 * digests below from that release's `checksums.txt` in the same change.
 */
const ACT_VERSION = '0.2.89'

/** sha256 of each release archive this script will run, keyed `<os>_<arch>`. */
const ACT_SHA256: Record<string, string> = {
  Linux_x86_64:
    '0191d6f1f3b716b5c55820032605d05fc3c1cdbf581ebeff655019e5dd1524c0',
  Linux_arm64:
    'daa8679ba9615a74d2d0cec321dc593f21948a2a11bb65862b063d8b930f4bcb',
  Darwin_x86_64:
    '41b31488e7c254baec31cce12c7dade3e35973b8a31b9486206ad43f233d814e',
  Darwin_arm64:
    '48ae218af96725f7635a66de2b87e1e346893b02add0f16b92f560296b2151fc',
}

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

/** The release asset name for this host, or a thrown error naming what is unsupported. */
function actAsset(): string {
  const os = { linux: 'Linux', darwin: 'Darwin' }[process.platform as string]
  const arch = { x64: 'x86_64', arm64: 'arm64' }[process.arch as string]
  const key = `${os}_${arch}`
  if (!os || !arch || !ACT_SHA256[key]) {
    throw new Error(
      `ci-local: no pinned act build for ${process.platform}/${process.arch}; set ACT_BINARY to a system act.`,
    )
  }
  return key
}

/**
 * Resolve the act binary, fetching the PINNED version on first use (or replacing a
 * stale one) into node_modules/.cache, which every install keeps out of git and the
 * image. An archive whose sha256 differs from the pin is refused before extraction.
 * `ACT_BINARY` points at a system act instead (its owner owns its version then).
 */
async function actBinary(): Promise<string> {
  const override = process.env.ACT_BINARY
  if (override) return override

  const dir = join(process.cwd(), 'node_modules', '.cache', 'act', ACT_VERSION)
  const bin = join(dir, 'act')
  if (installedVersion(bin) === ACT_VERSION) return bin

  const key = actAsset()
  const url = `https://github.com/nektos/act/releases/download/v${ACT_VERSION}/act_${key}.tar.gz`
  console.log(`ci-local: fetching pinned act ${ACT_VERSION} on first use...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ci-local: ${url} answered ${res.status}.`)
  const archive = Buffer.from(await res.arrayBuffer())
  const digest = createHash('sha256').update(archive).digest('hex')
  if (digest !== ACT_SHA256[key]) {
    throw new Error(
      `ci-local: act archive sha256 ${digest} does not match the pinned ${ACT_SHA256[key]}; refusing to run it.`,
    )
  }
  mkdirSync(dir, { recursive: true })
  const archivePath = join(dir, 'act.tar.gz')
  writeFileSync(archivePath, archive)
  execFileSync('tar', ['-xzf', archivePath, '-C', dir, 'act'])
  chmodSync(bin, 0o755)
  if (installedVersion(bin) !== ACT_VERSION) {
    throw new Error(
      `ci-local: act ${ACT_VERSION} still not runnable at ${bin}.`,
    )
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

const result = spawnSync(await actBinary(), args, {
  cwd: process.cwd(),
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
