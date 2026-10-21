/**
 * Prove the Node version agrees in every place that pins one.
 *
 * Four files independently name a Node version, and nothing else forces them to
 * match: `.node-version` (what a version manager gives a contributor),
 * `package.json#engines.node` (what pnpm warns about), `Containerfile`'s
 * `ARG NODE_VERSION` (what the SHIPPED artifact actually runs), and the CI
 * workflow (what the gate ran on). Drift between them is invisible to every
 * other check in this repo — typecheck, lint and the test suite all pass on the
 * wrong runtime, and the difference only shows up as a production-only failure
 * on a Node API that exists in one patch and not the other.
 *
 * `.node-version` is the SOURCE, and it is deliberately the ONLY version-manager
 * file here: it is the near-universal format (fnm, nvm, asdf, nodenv, mise and
 * actions/setup-node all read it), so it is the one file a contributor's tooling
 * already obeys without being told. This starter pins no specific manager and
 * ships no manager-specific field — that choice belongs to the project that
 * forks it, not to whatever happened to be installed on the machine that wrote
 * this. A contributor whose manager needs its own file keeps it out of the tree.
 *
 * TWO DIFFERENT FAILURES, DELIBERATELY GRADED:
 *
 *   1. FILE DRIFT is an ERROR. Someone edited one pin and not the others; that
 *      is a repo defect, it is always the committer's to fix, and it is fixed by
 *      editing a tracked file. Exit 1.
 *
 *   2. A RUNNING-INTERPRETER MISMATCH is a WARNING. That is a property of the
 *      contributor's machine, not of the tree, and a gate that goes red for a
 *      condition no commit can fix is a gate people learn to pass with `|| true`.
 *      It still has to be SAID, because it silently invalidates local evidence:
 *      "I verified it locally" is a claim about whatever interpreter ran, not
 *      about the one in the image.
 *
 * THE TRAP THAT MOTIVATED (2), because it is genuinely hard to see: `node` and
 * `pnpm` can resolve to DIFFERENT runtimes in the SAME directory, even with the
 * project correctly pinned. Several version managers run a GLOBALLY INSTALLED
 * package's binaries with the Node that package was installed with, ignoring the
 * project pin. When `pnpm` arrives that way — commonly via a globally installed
 * `corepack` — `node --version` reports the pinned runtime while every
 * `pnpm <script>` runs the other one. Observed on one machine as `node` → 24.18.0
 * and `pnpm exec node` → 24.12.0, in a correctly pinned checkout.
 *
 * Per-command "run under version X" wrappers look like they dodge this, and for
 * a LEAF script they do. They need not survive NESTING, and every composite
 * script here (`verify`, `check:static`) shells out to a nested `pnpm` that
 * re-resolves however it was installed. Measured on one such manager: the leaf
 * form reported parity while one extra level reported the wrong runtime again.
 * That is worse than a known gap — the first line of `pnpm verify` then claims a
 * runtime nothing underneath it used. Reinstalling the package that provides
 * `pnpm` under the pinned Node is the fix that holds; a wrapper is not one.
 *
 * This script runs under `pnpm`, so `process.version` here is the interpreter
 * that actually runs the verify chain — the only one whose version is evidence
 * about anything.
 *
 * Run with `node scripts/check-node-version.ts`; it rides `pnpm check:static`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.cwd()

/** Where each pin lives, and how to recover the version string from that file. */
interface Pin {
  /** Repo-relative path, for the failure message. */
  file: string
  /** What the reader should edit — named in the operator's terms. */
  describe: string
  /** The version this file names, or null when the file does not name one. */
  read(source: string): string | null
}

/** `v24.18.0` and `24.18.0` are the same pin; compare on the bare number. */
const bare = (version: string) => version.trim().replace(/^v/, '')

const SOURCE_FILE = '.node-version'

const PINS: Pin[] = [
  {
    file: 'package.json',
    describe: 'the `engines.node` field',
    read: (source) => {
      const manifest: unknown = JSON.parse(source)
      const node = (manifest as { engines?: { node?: unknown } }).engines?.node
      return typeof node === 'string' ? node : null
    },
  },
  {
    file: 'Containerfile',
    describe: 'the `ARG NODE_VERSION=` default',
    // The default on the ARG, not a `--build-arg` a caller may pass: the default
    // is what an unadorned `docker build` ships, which is the case that goes
    // unnoticed. A caller who overrides it has made a deliberate choice.
    read: (source) => /^ARG NODE_VERSION=(\S+)/m.exec(source)?.[1] ?? null,
  },
]

/**
 * The CI pins are checked by SHAPE rather than by value. Every `setup-node` step
 * must read `.node-version` rather than repeat the number, because a literal
 * there is a fifth copy to keep in sync — and the one copy this script could
 * only ever check after it had already drifted.
 */
function ciViolations(): string[] {
  const path = '.github/workflows/ci.yml'
  const source = readFileSync(join(REPO, path), 'utf8')
  const problems: string[] = []

  const literal = source.match(/^\s*node-version:\s*\S+/gm) ?? []
  for (const line of literal) {
    problems.push(
      `${path}: \`${line.trim()}\` hardcodes a Node version. ` +
        `Use \`node-version-file: '${SOURCE_FILE}'\` so CI cannot drift from the tree.`,
    )
  }

  // Counted against BOTH forms, not just the correct one: a step that pins a
  // literal is already reported above, and reporting it a second time as "has
  // neither" would be this check making a claim that is not true of that step.
  const setupNodeSteps = (source.match(/actions\/setup-node@/g) ?? []).length
  const versionFileUses = (source.match(/node-version-file:/g) ?? []).length
  const unpinned = setupNodeSteps - versionFileUses - literal.length
  if (unpinned > 0) {
    problems.push(
      `${path}: ${unpinned} setup-node step(s) pin no version at all, so they ` +
        `silently use the runner's default Node — which is not the one this repo ` +
        `pins. Add \`node-version-file: '${SOURCE_FILE}'\`.`,
    )
  }

  return problems
}

const expected = bare(readFileSync(join(REPO, SOURCE_FILE), 'utf8'))
const problems: string[] = []

for (const pin of PINS) {
  const found = pin.read(readFileSync(join(REPO, pin.file), 'utf8'))
  if (found === null) {
    problems.push(
      `${pin.file}: ${pin.describe} is missing. It must pin ${expected}, ` +
        `to match ${SOURCE_FILE}.`,
    )
    continue
  }
  if (bare(found) !== expected) {
    problems.push(
      `${pin.file}: ${pin.describe} says ${found}, but ${SOURCE_FILE} says ` +
        `${expected}. Upgrade every pin in one commit, or none.`,
    )
  }
}

problems.push(...ciViolations())

if (problems.length > 0) {
  console.error('check-node-version: FAILED — the Node pins disagree.\n')
  for (const problem of problems) console.error(`   ✗ ${problem}`)
  console.error(
    `\n${SOURCE_FILE} is the source. Change it first, then make the rest agree.`,
  )
  process.exit(1)
}

if (bare(process.version) !== expected) {
  console.warn(
    `check-node-version: pins agree on ${expected}, but THIS process is ` +
      `${process.version}.\n` +
      '   Local runs — including every `pnpm test` and `pnpm build` — are ' +
      'therefore evidence\n' +
      '   about a runtime the container does not ship.\n' +
      '   Usually this means `pnpm` was installed globally under a different ' +
      'Node and your\n' +
      '   version manager keeps running it with that one. Ask your manager ' +
      'which runtime it\n' +
      '   gives `pnpm`, then reinstall whatever provides `pnpm` (often ' +
      '`corepack`) under\n' +
      '   ' +
      expected +
      '. That is the fix that holds.\n' +
      '   A per-command "run under ' +
      expected +
      '" wrapper is NOT a workaround: it reaches the\n' +
      '   OUTERMOST pnpm only, and every composite script here (`verify`, ' +
      '`check:static`)\n' +
      '   shells out to a nested `pnpm` that re-resolves the old way — so this ' +
      'line can read\n' +
      '   OK while the work below it runs on the wrong runtime.',
  )
}

console.log(`check-node-version: OK — every pin says ${expected}.`)
