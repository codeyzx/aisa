/**
 * Install the git hooks. Wired as the `prepare` lifecycle script, so it runs on
 * every `pnpm install`.
 *
 * SELF-CONTAINED ON PURPOSE — do not add an import of another repo module. The
 * Containerfile's deps layer copies THIS FILE ALONE (`COPY scripts/install-hooks.ts`)
 * because `prepare` runs there too and a MISSING prepare script is a
 * MODULE_NOT_FOUND that fails the whole image build. An import of, say,
 * `./_safety.ts` would reintroduce exactly that failure.
 *
 * WHY IT ANNOUNCES EVERY OUTCOME. The previous version was `if (existsSync('.git'))`
 * and nothing else, which is wrong in two ways at once and silent in both. `.git`
 * is a FILE, not a directory, inside a `git worktree` — `existsSync` happens to
 * return true there, but the same "does the path exist" reasoning is what fails in
 * a CI checkout or an exported tarball, and either way the developer learned
 * nothing. Now the question is asked of git itself (`git rev-parse --git-path
 * hooks`, which resolves the real hooks directory through a worktree's gitfile and
 * through `core.hooksPath`), and every branch says what it did and why. A hook
 * installer that no-ops in silence is indistinguishable from one that worked, and
 * the first time you find out is a commit that skipped every check.
 */
import { execSync } from 'node:child_process'

/**
 * `CI` is the de-facto standard flag (GitHub Actions, GitLab, CircleCI, Vercel
 * all export `CI=true`). `false`/`0` are excluded because some tools set the
 * variable explicitly to opt OUT, and reading that as "yes, CI" would skip hook
 * installation on a developer machine that had merely been careful.
 */
function isCi(): boolean {
  const ci = process.env.CI
  return Boolean(ci) && ci !== 'false' && ci !== '0'
}

/**
 * The real hooks directory, or `undefined` when this tree is not a git checkout
 * at all. `--git-path` is the only spelling that is correct in every layout:
 * a plain clone, a `git worktree` (where `.git` is a gitfile pointing into the
 * main repo's `worktrees/<name>/`), and a repo that has moved its hooks with
 * `core.hooksPath`. stderr is captured rather than inherited so the "not a git
 * repository" case is reported in this script's own words below.
 */
function gitHooksPath(): string | undefined {
  try {
    return execSync('git rev-parse --git-path hooks', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return undefined
  }
}

if (isCi()) {
  // Deliberate, not incidental: CI checks out fresh for every job and never
  // commits, so a hook would cost install time and protect nothing.
  console.log('install-hooks: skipped — CI is set, and CI never commits.')
  process.exit(0)
}

const hooksPath = gitHooksPath()
if (!hooksPath) {
  // The container build and any tarball export land here: no `.git` in the
  // context at all. Genuinely nothing to install, so this is a success — but it
  // says so, because "no hooks were installed" must never be inferred silently.
  console.log(
    'install-hooks: skipped — not a git checkout, so there are no hooks to install.\n' +
      '  Expected inside a container build or an exported archive. If you are in a\n' +
      '  clone and see this, run `git status` here: the checkout is broken, not the script.',
  )
  process.exit(0)
}

console.log(`install-hooks: installing lefthook hooks into ${hooksPath}`)
try {
  // `execSync` with a shell COMMAND STRING (not execFile + args) is the
  // cross-platform form: the shell resolves `lefthook.cmd` on Windows (via
  // PATHEXT) and `lefthook` on POSIX. Node's execFile cannot launch a
  // `.cmd`/`.bat` shim directly (EINVAL since the CVE-2024-27980 hardening),
  // which broke a Windows developer's very first `pnpm install` after cloning
  // right here. The command is a fixed literal.
  execSync('lefthook install', { stdio: 'inherit' })
} catch {
  // A git checkout WITH no hooks installed is the dangerous state — the one the
  // old silent no-op left people in — so this exits non-zero and names the fix.
  console.error(
    'install-hooks: FAILED to run `lefthook install`.\n' +
      '  Your commits will not be checked until this succeeds.\n' +
      '  Try: pnpm install (lefthook is a devDependency), then `pnpm exec lefthook install`.\n' +
      '  If you are deliberately working without hooks, run installs with CI=1.',
  )
  process.exit(1)
}
