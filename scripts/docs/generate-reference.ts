/**
 * `docs:generate` — produce the GENERATED reference docs from source.
 *
 * Four reference facts in `docs/reference/` are not written by hand: the command
 * list, the environment matrix, the capability toggles, and the directory map.
 * Each is derived here from the code that owns the fact, and each is paired with
 * `docs:check`'s `generated-drift` rule (see `scripts/docs/context.ts`), so the
 * SAME render function decides both what is written and what is expected. That
 * pairing is the whole design: hand-editing a generated doc fails the check, and
 * so does changing a source without regenerating.
 *
 * WHAT IS DERIVED VS WHAT IS AUTHORED. Everything that can rot is derived: which
 * scripts exist and what they run, which environment variables exist and whether
 * each is required, which capabilities are registered and what gates them, which
 * directories exist. The prose that explains WHY you would reach for a thing is
 * authored once here, keyed by the derived name — and every table below is
 * FAIL-LOUD: a source that grows an item with no entry throws by name rather than
 * rendering a doc with a hole in it. A generated doc nobody notices is stale is
 * worse than no doc, because it reads as current.
 *
 * Run: `pnpm docs:generate`
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { GeneratedPair } from './checks.ts'

/** Repo root — this file lives at `<root>/scripts/docs/generate-reference.ts`. */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

const read = (root: string, relPath: string): string =>
  readFileSync(resolve(root, relPath), 'utf8')

/**
 * Every path git knows about that is ALSO on disk.
 *
 * Untracked-and-not-ignored counts on purpose: a directory added but not yet
 * committed is still a directory this reference must describe, so the gate fires
 * before the commit rather than after it.
 *
 * The `existsSync` filter is the same rule pointing the other way, and without it
 * this reference lied in the one situation that matters most. `git ls-files
 * --cached` reads the INDEX, so a file deleted but not yet staged is still listed
 * — measured, a worktree with a feature directory removed from disk still
 * reported every one of its files. So the layout doc went on describing a feature
 * somebody had just deleted, and regenerating did not change a line.
 */
function trackedPaths(root: string): string[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter((relPath) => existsSync(resolve(root, relPath)))
}

/** Thrown when a source grew something this generator has no wording for. */
function missing(what: string, name: string): never {
  throw new Error(
    `${what} "${name}" has no entry in scripts/docs/generate-reference.ts — ` +
      'add one there, then run `pnpm docs:generate`.',
  )
}

/**
 * The banner every generated doc opens with. Kept free of markdown links and of
 * bracket/parenthesis pairs so the docs link checker does not read the comment as
 * a link.
 */
function banner(sources: string[]): string {
  return [
    '<!--',
    'GENERATED FILE — DO NOT EDIT BY HAND.',
    '',
    'Regenerate with: pnpm docs:generate',
    'Generated from:',
    ...sources.map((s) => `  - ${s}`),
    '',
    'Hand edits are overwritten by the next run. `pnpm docs:check` fails its',
    'generated-drift rule for as long as this file disagrees with the sources',
    'above, so a source that moves ahead of this doc is a red check, not a',
    'silently stale page.',
    '-->',
    '',
  ].join('\n')
}

/** Join rendered blocks into a file body with exactly one blank line between. */
const doc = (...blocks: string[]): string =>
  `${blocks
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')}\n`

// ---------------------------------------------------------------------------
// Shared source parsing
// ---------------------------------------------------------------------------

/** Strip block comments and whole-line `//` comments before structural parsing. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** The balanced `{...}` body starting at the `{` found at or after `from`. */
function balancedBody(
  text: string,
  from: number,
  open = '{',
  close = '}',
): string {
  const start = text.indexOf(open, from)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1
    else if (text[i] === close) {
      depth -= 1
      if (depth === 0) return text.slice(start + 1, i)
    }
  }
  return ''
}

/**
 * Split an object body on its TOP-LEVEL commas and read each `key: value` pair.
 * Depth-aware, because an entry's value is routinely an arrow function whose own
 * punctuation must not be mistaken for the end of the entry.
 */
function objectEntries(chunk: string): Record<string, string> {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < chunk.length; i += 1) {
    const ch = chunk[i]
    if (ch === '{' || ch === '[' || ch === '(') depth += 1
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(chunk.slice(start, i))
      start = i + 1
    }
  }
  parts.push(chunk.slice(start))

  const out: Record<string, string> = {}
  for (const part of parts) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const key = part.slice(0, colon).trim()
    if (key) out[key] = part.slice(colon + 1).trim()
  }
  return out
}

/** Split a `[...]`/`{...}` body into its top-level `{...}` chunks. */
function topLevelObjects(body: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (body[i] === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) out.push(body.slice(start + 1, i))
    }
  }
  return out
}

/** `import { a, b } from './x'` → { a: './x', b: './x' } across a whole file. */
function importedFrom(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g
  for (const match of text.matchAll(re)) {
    for (const raw of match[1].split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim()
      if (name) map[name] = match[2]
    }
  }
  return map
}

/** Resolve a relative import specifier against the importing file's directory. */
function resolveSpecifier(fromFile: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier
  return `${resolve('/', dirname(fromFile), specifier).slice(1)}.ts`
}

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

interface EnvVar {
  name: string
  required: boolean
  defaultValue: string | null
  choices: string[] | null
}

/** `export const NAME = ['a', 'b'] as const` → { NAME: ['a', 'b'] }. */
function stringArrayConstants(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const re = /export const ([A-Z][A-Z0-9_]*) = \[([^\]]*)\]/g
  for (const match of text.matchAll(re)) {
    const values = [...match[2].matchAll(/'([^']*)'/g)].map((m) => m[1])
    if (values.length > 0) out[match[1]] = values
  }
  return out
}

/**
 * Every variable declared by the `z.object({...})` schemas in one module.
 *
 * Required vs optional is read off the schema itself — `requiredVar(` means the
 * boundary refuses an absent value, `.optional()` means it tolerates one — rather
 * than trusted to prose, because that distinction is the single fact a reader
 * acts on and the one most likely to change without the doc noticing.
 */
function parseEnvVars(
  text: string,
  constants: Record<string, string[]>,
): EnvVar[] {
  const source = stripComments(text)
  const out: EnvVar[] = []
  const seen = new Set<string>()

  for (const match of source.matchAll(/z\.object\(/g)) {
    const body = balancedBody(source, match.index)
    const entries: { name: string; text: string }[] = []
    for (const line of body.split('\n')) {
      const key = /^ {2}([A-Z][A-Z0-9_]*):(.*)$/.exec(line)
      if (key) {
        entries.push({ name: key[1], text: key[2] })
        continue
      }
      const current = entries.at(-1)
      if (current) current.text += `\n${line}`
    }

    for (const entry of entries) {
      if (seen.has(entry.name)) continue
      seen.add(entry.name)
      const required = entry.text.includes('requiredVar(')
      const optional = entry.text.includes('.optional()')
      if (!required && !optional) {
        throw new Error(
          `environment variable "${entry.name}" is neither requiredVar(...) nor ` +
            '.optional() — scripts/docs/generate-reference.ts cannot classify it.',
        )
      }
      const fallback = /\?\?\s*'([^']*)'/.exec(entry.text)
      const literalEnum = /\.enum\(\[([^\]]*)\]/.exec(entry.text)
      const namedEnum = /\.enum\(([A-Z][A-Z0-9_]*)\)/.exec(entry.text)
      out.push({
        name: entry.name,
        required,
        defaultValue: fallback ? fallback[1] : null,
        choices: literalEnum
          ? [...literalEnum[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
          : namedEnum
            ? (constants[namedEnum[1]] ?? null)
            : null,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// docs/reference/commands.md
// ---------------------------------------------------------------------------

interface CommandNote {
  group: string
  note: string
}

const COMMAND_GROUPS = [
  'Run the app',
  'Local data',
  'Checks',
  'Tests',
  'Build and ship',
  'Lifecycle',
] as const

const COMMAND_NOTES: Record<string, CommandNote> = {
  dev: {
    group: 'Run the app',
    note:
      'The whole local stack in one command. Starts the Firebase emulators (data ' +
      'persisted across restarts in `.emulator-data/` via `--import`/' +
      '`--export-on-exit`), runs `pnpm setup:local` to create `.env` and seed only ' +
      'when the database is empty, then runs `next dev` with hot reload. Ctrl+C ' +
      'exports the emulator data and tears the emulators down. Use `pnpm dev:next` ' +
      'to skip all of that when the emulators and `.env` are already in place.',
  },
  'dev:next': {
    group: 'Run the app',
    note:
      'Just `next dev`, nothing else — for when `pnpm emulators` is already running ' +
      'in another terminal and a `.env` is in place. This is the raw server `pnpm ' +
      'dev` wraps; reach for it when you want the emulators to outlive a server ' +
      'restart, or when debugging the dev server on its own.',
  },
  build: {
    group: 'Build and ship',
    note:
      'The real production build, with the real environment. `next.config.ts` ' +
      'calls the public-env validator, so a malformed `NEXT_PUBLIC_*` (today only ' +
      'the optional Sentry DSN) ' +
      'fails here — which is the only place it can fail, since those values are ' +
      'inlined into the browser bundle and cannot be fixed after the build.',
  },
  start: {
    group: 'Build and ship',
    note:
      'Serve a build produced by `pnpm build`. Note that the shipped container ' +
      'does not use this: the image runs the standalone server entrypoint ' +
      'directly, which is why the container smoke test exists.',
  },
  emulators: {
    group: 'Run the app',
    note:
      'Start the Firebase Auth + Firestore emulators under the `demo-aisa` ' +
      'project. Leave it running in its own terminal; everything local talks to ' +
      'it, and the destructive data scripts refuse to run without it.',
  },
  'setup:local': {
    group: 'Local data',
    note:
      'Get a fresh clone from nothing to a signed-in app: creates `.env` from ' +
      '`.env.example`, waits for the emulators, seeds the accounts and the fake ' +
      'AISA data when `settings/rules` is missing (or only the accounts when ' +
      'data exists but none do), and prints the test accounts. ' +
      'Non-destructive by contract, so re-running it is the supported way to ' +
      'check your setup.',
  },
  'db:reset': {
    group: 'Local data',
    note:
      'Wipe the local emulator database — every Firestore document and every ' +
      'Auth account. Prints the plan and deletes nothing unless you pass ' +
      '`-- --apply`, and refuses to run at all unless both emulator hosts are ' +
      'set, so it cannot reach a real database.',
  },
  seed: {
    group: 'Local data',
    note:
      'Reset the example data: upserts the sign-in-able accounts and rewrites ' +
      'the example assets. Destructive by design — it clears the assets ' +
      'collection first, so anything you made through the UI goes with it. Same ' +
      'emulator-only fence as `db:reset`.',
  },
  migrate: {
    group: 'Local data',
    note:
      'Run the data migrations. Firestore is schemaless, so a migration is a ' +
      'script that rewrites documents rather than DDL. Dry-run by default; ' +
      '`--apply` prints the resolved target and makes you type the project id ' +
      'back before it writes, because reaching production is the whole point of ' +
      'a migration.',
  },
  'snapshot:export': {
    group: 'Local data',
    note:
      'Dump every top-level Firestore collection to diffable JSON. Read-only ' +
      'against the database. Sub-collections nested under a document are out of ' +
      'scope.',
  },
  'snapshot:restore': {
    group: 'Local data',
    note:
      'Write a snapshot directory back into Firestore. Plan-only by default; ' +
      '`--apply` writes, `--wipe` deletes first, and both stand behind schema ' +
      'validation, a project guard, and typed project-id confirmation on the ' +
      'controlling terminal.',
  },
  'indexes:check': {
    group: 'Checks',
    note:
      'Diff the composite indexes the queries you just ran actually needed ' +
      'against the ones declared. Run it after driving the app or the ' +
      'integration suite against a live emulator — the emulator happily runs ' +
      'queries with no index, so this is the only thing standing between a ' +
      'filtered query and a production-only failure. It only knows about ' +
      'queries that really ran.',
  },
  'structure:check': {
    group: 'Checks',
    note:
      'The architecture gate. Loads the TypeScript program and runs the module ' +
      'boundary and safety contracts over the resolved import graph — an aliased ' +
      'and a relative import are the same edge, which a text search cannot see.',
  },
  'node:check': {
    group: 'Checks',
    note:
      'Prove every place that pins a Node version still agrees. Drift between ' +
      'them is invisible to every other check and only surfaces as a ' +
      'production-only failure. A mismatched running interpreter is a warning, ' +
      'not an error, because no commit can fix it.',
  },
  'docs:check': {
    group: 'Checks',
    note:
      'The documentation ownership gate: every doc is tracked and linked, every ' +
      'normative contract carries its ownership metadata, every relative link ' +
      'resolves, no brittle references, and no generated reference has drifted ' +
      'from its source.',
  },
  'docs:generate': {
    group: 'Checks',
    note:
      'Regenerate the generated reference docs from source. Run it whenever ' +
      '`docs:check` reports generated drift, and never edit those files by hand.',
  },
  'templates:check': {
    group: 'Checks',
    note:
      'Prove the copy-me entity templates still compile. They are excluded from ' +
      'the normal typecheck because of their placeholder tokens, which is ' +
      'exactly what lets them rot onto whoever forks next; this substitutes real ' +
      'names outside the worktree and typechecks the result.',
  },
  lint: {
    group: 'Checks',
    note: 'Lint the tree. A warning fails it, same as an error.',
  },
  'lint:fix': {
    group: 'Checks',
    note: 'Lint and apply the fixes the linter can make itself.',
  },
  'lint:rules': {
    group: 'Checks',
    note:
      'Run the repo-specific structural rules and their own tests — the ' +
      'hand-written patterns that guard things a general linter has no opinion ' +
      'about.',
  },
  format: { group: 'Checks', note: 'Format the tree in place.' },
  'format:check': {
    group: 'Checks',
    note: 'Fail if anything is unformatted. This is the CI-shaped form.',
  },
  typecheck: {
    group: 'Checks',
    note: 'Typecheck with no emit. Necessary before shipping, never sufficient.',
  },
  test: {
    group: 'Tests',
    note:
      'The whole suite, serialized. The integration tests want a live emulator, ' +
      'so plain `pnpm test` is for a session where one is already running.',
  },
  'test:unit': {
    group: 'Tests',
    note:
      'Everything that needs no emulator. This is the fast inner loop and the ' +
      'part CI can run without spinning anything up.',
  },
  'test:integration': {
    group: 'Tests',
    note:
      'The emulator-backed tests plus the security-rules tests, started against ' +
      'a throwaway emulator and followed by the index check — so a query that ' +
      'needs an index it does not declare fails here rather than in production.',
  },
  'test:watch': {
    group: 'Tests',
    note: 'The unit tests, re-run as you edit.',
  },
  'test:emulator': {
    group: 'Tests',
    note:
      'The full suite plus the index check inside a managed emulator. Use it ' +
      'when you have no emulator running and want the whole thing in one shot.',
  },
  'test:e2e': {
    group: 'Tests',
    note:
      'The browser suite against whatever the Playwright config points at. Use ' +
      'it while iterating on a spec with your own server already up.',
  },
  'test:e2e:container': {
    group: 'Tests',
    note:
      'The browser suite against the production image rather than the dev ' +
      'server, because a suite driven through the dev server is green while the ' +
      'shipped image serves an unstyled page.',
  },
  'test:e2e:ci': {
    group: 'Tests',
    note:
      'The one-command form used by the pipeline: the same command as ' +
      '`test:e2e:fast`.',
  },
  'test:e2e:fast': {
    group: 'Tests',
    note:
      'Build the E2E image once, then split the browser suite over `--shards N` ' +
      '(1–9, default 4), each shard with its own container (port 3201 upward) ' +
      'and its own seeded Firestore emulator, sharing one Auth emulator on ' +
      '127.0.0.1:9099. Other arguments (spec files, `--grep`) go to every ' +
      "shard's `playwright test`. Each shard costs a container, a JVM and a " +
      'browser in memory; use `--shards 2` on a busy machine.',
  },
  'image:check': {
    group: 'Build and ship',
    note:
      'Refuse an `APP_IMAGE` that is not pinned by digest. Run it in the job ' +
      'that cuts the deploy: `compose.prod.yaml` can only require the value to ' +
      'be present, so a moving tag reaches production otherwise and the build ' +
      'stamp then describes an image you are no longer running. Resolves ' +
      '`APP_IMAGE` the way compose does — exported environment, then the ' +
      'project directory `.env`, never `.env.local`. Shape only; it contacts ' +
      'no registry.',
  },
  'smoke:image': {
    group: 'Build and ship',
    note:
      'Build the production image, run it, and assert the things only the ' +
      'ARTIFACT can be wrong about: static assets actually copied, a non-root ' +
      'user, a real build stamp on the health route, the security headers, a ' +
      'health check that passes, an entrypoint that forwards termination ' +
      'signals, and no-store on API responses.',
  },
  'check:static': {
    group: 'Checks',
    note:
      'Every static gate in one command: Node pins, types, templates, lint, ' +
      'structural rules, formatting, docs, architecture.',
  },
  'build:ci': {
    group: 'Build and ship',
    note:
      'A secret-less build that still validates. It supplies explicit non-secret ' +
      'dummy public values instead of turning validation off, so a green build ' +
      'still means the public schema is satisfied. It proves nothing about ' +
      'server secrets, which are checked at boot.',
  },
  verify: {
    group: 'Checks',
    note:
      'The full non-driven chain: static gates, unit, integration, build. It ' +
      'ends by naming its own hole out loud — sign-in, the browser acceptance ' +
      'matrix, the env fail-fast, the container smoke and the browser suite are ' +
      'not covered and have to be driven.',
  },
  'ci:local': {
    group: 'Checks',
    note:
      'Run the actual .github/workflows/ci.yml locally, in containers, via ' +
      'nektos/act — both jobs, including the merge-only artifact job (image ' +
      'build, container E2E, Trivy). Same file CI runs, so no second list drifts, ' +
      'and it runs on the shipped Node rather than your host, curing the ' +
      'wrong-runtime skew node:check warns about. The fallback when CI is ' +
      'unavailable or the minute budget is spent. `--fresh` disables caching; act ' +
      'is ~90% faithful, not the authority. act is pinned to one release and sha256 ' +
      'and fetched on first use, not at install.',
  },
  prepare: {
    group: 'Lifecycle',
    note:
      'Install the git hooks. Runs automatically on `pnpm install`; you should ' +
      'not need to call it yourself.',
  },
}

function renderCommands(root: string): string {
  const pkg = JSON.parse(read(root, 'package.json')) as {
    scripts: Record<string, string>
  }
  const names = Object.keys(pkg.scripts)
  const byGroup = new Map<string, string[]>()

  for (const name of names) {
    const entry = COMMAND_NOTES[name]
    if (!entry) missing('package.json script', name)
    if (!(COMMAND_GROUPS as readonly string[]).includes(entry.group)) {
      throw new Error(
        `package.json script "${name}" is filed under unknown group ` +
          `"${entry.group}" in scripts/docs/generate-reference.ts.`,
      )
    }
    const block = [
      `### \`pnpm ${name}\``,
      '',
      '```',
      pkg.scripts[name],
      '```',
      '',
      entry.note,
    ].join('\n')
    byGroup.set(entry.group, [...(byGroup.get(entry.group) ?? []), block])
  }

  for (const described of Object.keys(COMMAND_NOTES)) {
    if (!names.includes(described)) {
      throw new Error(
        `scripts/docs/generate-reference.ts describes "${described}", which is ` +
          'no longer a package.json script — remove the entry.',
      )
    }
  }

  const sections = COMMAND_GROUPS.filter((g) => byGroup.has(g)).map((group) =>
    [`## ${group}`, '', byGroup.get(group)!.join('\n\n')].join('\n'),
  )

  return doc(
    banner(['package.json']),
    '# Commands',
    'Every script this repo defines, what it runs, and when you would reach for it.',
    'The fenced block under each heading is the literal command from `package.json`.',
    ...sections,
  )
}

// ---------------------------------------------------------------------------
// docs/reference/configuration.md
// ---------------------------------------------------------------------------

interface EnvGroup {
  /** Module that owns the schema. */
  file: string
  heading: string
  intro: string
}

const ENV_GROUPS: EnvGroup[] = [
  {
    file: 'lib/env/server.ts',
    heading: 'Server runtime config',
    intro:
      'Private values that no deletable capability owns. Read per request rather ' +
      'than at build, so they never enter the image builder.',
  },
  {
    file: 'lib/env/client.ts',
    heading: 'Public Firebase and emulator config',
    intro:
      'Validated at BUILD time by the gate `next.config.ts` calls. These are ' +
      'inlined into the browser bundle, so a missing one has to fail the build — ' +
      'it cannot be fixed afterwards. The browser uses them only to sign in.',
  },
  {
    file: 'lib/aisa-api/config.ts',
    heading: 'AISA API',
    intro:
      'Where the Python `aisa-api` lives and the key it expects. Every dashboard ' +
      'write goes through a server action that calls it, so both are server-only.',
  },
  {
    file: 'lib/observability/config.ts',
    heading: 'Error monitoring',
    intro:
      'Owned by the observability capability. Public by construction — a DSN ' +
      'ships in every browser bundle — and optional, because nobody should need ' +
      'an account with a monitoring vendor to build this starter.',
  },
]

const ENV_NOTES: Record<string, string> = {
  NEXT_PUBLIC_FIREBASE_API_KEY:
    'Firebase web API key. Not a secret, but environment-specific.',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'Firebase auth domain for the web SDK.',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:
    'Firebase project the browser signs in against. Must name the same project ' +
    'as the server-side project id, or sign-in succeeds against an account the ' +
    'server cannot see.',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
    'Firebase storage bucket for the web SDK config.',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    'Firebase messaging sender id for the web SDK config.',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'Firebase web app id.',
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST:
    'Point the BROWSER auth SDK at a local emulator. Unset for a normal run; ' +
    'an image built with it set is a test artifact.',
  FIREBASE_AUTH_SERVICE_ACCOUNT:
    'Optional. The service account Firebase AUTH calls run as, impersonated ' +
    'from the ADC identity through IAM Credentials. For a runtime that holds no ' +
    '`firebaseauth.*` permission and may not mint a key; that identity needs ' +
    '`roles/iam.serviceAccountTokenCreator` on this account. Unset: Auth uses ' +
    'the same credential as Firestore. Ignored against the emulator.',
  FIREBASE_PROJECT_ID:
    'Which project the server talks to. Required on both the emulator and the ' +
    'real-project path, which is why it is separated from the certificate it ' +
    'usually travels with.',
  FIREBASE_CLIENT_EMAIL:
    'Service-account identity from a service-account JSON key. Optional: set ' +
    'it together with FIREBASE_PRIVATE_KEY, or leave both unset to use ' +
    'Application Default Credentials (the Cloud Run runtime service account). ' +
    'Exactly one of the pair set is refused at boot.',
  FIREBASE_PRIVATE_KEY:
    'Service-account private key, the full PEM. A literal backslash-n sequence ' +
    'is normalized to real newlines at read time, because env UIs store it that ' +
    'way.',
  FIRESTORE_EMULATOR_HOST:
    'Point the SERVER Admin SDK at a local Firestore emulator. Setting either ' +
    'emulator host is what makes the process an emulator target: the Admin ' +
    'credential stops being required, and the destructive data scripts agree to ' +
    'run.',
  FIREBASE_AUTH_EMULATOR_HOST:
    'Point the SERVER Admin SDK at a local auth emulator. Same effect as its ' +
    'Firestore twin.',
  LOG_LEVEL:
    'Structured-log threshold. Per-deployment config rather than a product ' +
    'decision, which is why it is an env key at all. A value outside the enum ' +
    'throws at boot instead of silently falling back — config that lies is worse ' +
    'than config that fails.',
  BUILD_SHA:
    'Commit stamp reported by the health route, populated by the image build. ' +
    'Never set it by hand.',
  BUILT_AT:
    'Build timestamp reported by the health route, populated by the image build.',
  AISA_API_URL:
    'Absolute base URL of the Python `aisa-api`. Every write the dashboard makes ' +
    '(responses, category corrections, rules, STOP/LANJUT, uploads) goes there.',
  AISA_API_KEY:
    'Shared key sent as the `X-AISA-Key` header on every `aisa-api` call. Server ' +
    'only; never reaches the browser.',
  NEXT_PUBLIC_SENTRY_DSN:
    'Where error events go. Unset means the SDK is never initialized and every ' +
    'capture is a no-op — no network request is made and no UI depends on it.',
  NEXT_PUBLIC_BUILD_SHA:
    'The same commit as the server-side build stamp, in the form the BROWSER can ' +
    'see, so a client event and a server event about one deploy carry the same ' +
    'release. Two keys for one fact because only a public var is inlined into ' +
    'the client bundle.',
}

/**
 * Runtime modules that read `process.env` and own NO schema in `ENV_GROUPS`.
 *
 * Named one at a time, with the reason, because the alternative is the one way
 * this generator can be wrong in SILENCE. Every other list here fails loudly: an
 * undescribed variable, command or directory throws. But `ENV_GROUPS` is the
 * list of files to LOOK IN, so a capability that owns its config in a seventh
 * module is not undescribed — it is unseen, and `configuration.md` simply never
 * mentions its variables. Someone deploying then discovers them from a crash.
 *
 * The values are what makes an entry reviewable: neither of these is deployment
 * configuration, which is the only reason they may sit outside a schema.
 */
const ENV_READERS_WITHOUT_SCHEMA: Record<string, string> = {
  'lib/auth/cookie-options.ts':
    "NODE_ENV — the framework's own build flag, not a value anyone sets per deployment.",
}

/** Runtime trees whose modules must not read `process.env` unnoticed. */
const ENV_SCANNED_DIRS = new Set([
  'app',
  'components',
  'features',
  'hooks',
  'lib',
])

/**
 * Refuse a runtime module that reads `process.env` and is neither an
 * `ENV_GROUPS` source nor a named exception above.
 */
function checkEnvCoverage(root: string, paths: string[]): void {
  const owned = new Set(ENV_GROUPS.map((group) => group.file))
  for (const path of paths) {
    if (!ENV_SCANNED_DIRS.has(path.split('/')[0])) continue
    if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path)) continue
    if (path.includes('_template.')) continue
    if (owned.has(path) || path in ENV_READERS_WITHOUT_SCHEMA) continue
    // Comments stripped first: this repo explains itself at length, and a
    // docblock that MENTIONS `process.env` is not a module that reads it.
    if (!stripComments(read(root, path)).includes('process.env')) continue
    missing('module reading process.env', path)
  }
}

function renderConfiguration(root: string): string {
  checkEnvCoverage(root, trackedPaths(root))
  const constants = stringArrayConstants(read(root, 'lib/log/levels.ts'))
  const sections: string[] = []
  const described = new Set<string>()

  for (const group of ENV_GROUPS) {
    const text = read(root, group.file)
    const serverOnly = text.includes("import 'server-only'")
    const vars = parseEnvVars(text, constants)
    const blocks = vars.map((variable) => {
      const note = ENV_NOTES[variable.name]
      if (!note) missing('environment variable', variable.name)
      described.add(variable.name)

      const requirement = variable.required
        ? 'REQUIRED — the boundary refuses an absent or empty value'
        : variable.defaultValue !== null
          ? `optional — defaults to \`${variable.defaultValue}\``
          : 'optional — may be left unset'
      const scope = variable.name.startsWith('NEXT_PUBLIC_')
        ? 'client — INLINED into the browser bundle at build time, so treat it as public'
        : serverOnly
          ? 'server only — read at run time and never sent to the browser'
          : 'server — read at run time'

      return [
        `### \`${variable.name}\``,
        '',
        `- Requirement: ${requirement}`,
        `- Scope: ${scope}`,
        ...(variable.choices
          ? [
              `- Accepted values: ${variable.choices.map((c) => `\`${c}\``).join(', ')}`,
            ]
          : []),
        '',
        note,
      ].join('\n')
    })

    sections.push(
      [
        `## ${group.heading}`,
        '',
        `Declared in \`${group.file}\`. ${group.intro}`,
        '',
        blocks.join('\n\n'),
      ].join('\n'),
    )
  }

  for (const name of Object.keys(ENV_NOTES)) {
    if (!described.has(name)) {
      throw new Error(
        `scripts/docs/generate-reference.ts describes environment variable ` +
          `"${name}", which no schema declares any more — remove the entry.`,
      )
    }
  }

  return doc(
    banner([...ENV_GROUPS.map((g) => g.file), 'lib/log/levels.ts']),
    '# Configuration',
    'Every environment variable this repo reads, whether it is required, and ' +
      'whether it reaches the browser.',
    'Two facts here are load-bearing and everything else follows from them. ' +
      'REQUIRED means the boundary refuses to proceed without it — there is no ' +
      'bypass flag anywhere in the env layer, so a missing required value is a ' +
      'failed build or a refused boot, never a warning. And a `NEXT_PUBLIC_` ' +
      'variable is INLINED into the browser bundle: it is public whatever it ' +
      'contains, and it is fixed at build time rather than at run time.',
    'Where a value is validated follows from that split. Public variables are ' +
      'checked during the build, because a bundle that already shipped cannot be ' +
      'corrected. Private variables are checked at boot, capability by ' +
      'capability, so a deployment that ships an enabled capability refuses to ' +
      'start without its secret instead of failing on the first request that ' +
      'needed it.',
    ...sections,
  )
}

// ---------------------------------------------------------------------------
// docs/reference/capabilities.md
// ---------------------------------------------------------------------------

const CAPABILITY_NOTES: Record<string, string> = {
  'Firebase project':
    'Which project the server talks to. Not a capability you can remove: ' +
    'without a project there is nothing to talk to, so this differs in kind ' +
    'from everything below it.',
  'Firebase Admin credential':
    'The project id plus, optionally, a service-account key pair; with no key ' +
    'the Admin SDK uses Application Default Credentials. Not checked against an ' +
    'emulator target, which authenticates with nothing.',
  'aisa-api':
    'The Python service every dashboard write goes through (responses, ' +
    'corrections, rules, STOP/LANJUT, uploads). Required: without it the ' +
    'dashboard would render but every action would fail.',
}

const CLIENT_CAPABILITY_NOTES: Record<string, string> = {
  getFirebaseClientConfig:
    'The public Firebase web config. Not removable — it is how the browser ' +
    'reaches the project at all.',
  getClientEmulatorConfig:
    'The browser-side Auth emulator target. Unset in a normal run, which is ' +
    'what makes a build sign in against real Firebase.',
  getObservabilityConfig:
    'Error monitoring. Off unless a DSN is set: with none, the SDK is never ' +
    'initialized and every capture is a no-op.',
}

function renderCapabilities(root: string): string {
  const registryFile = 'lib/env/registry.ts'
  const clientFile = 'lib/env/client.ts'
  const availabilityFile = 'lib/auth/capability-availability.ts'

  const registryText = read(root, registryFile)
  const registryImports = importedFrom(registryText)
  const registrySource = stripComments(registryText)
  // Anchor on the assignment, not on the identifier: the type annotation
  // `CapabilityConfig[]` carries a bracket pair of its own.
  const arrayBody = balancedBody(
    registrySource,
    registrySource.indexOf('= [', registrySource.indexOf('CAPABILITY_CONFIGS')),
    '[',
    ']',
  )

  const owner = (fn: string, importer: string): string => {
    const specifier = importedFrom(read(root, importer))[fn]
    return specifier ? resolveSpecifier(importer, specifier) : importer
  }

  const blocks = topLevelObjects(arrayBody).map((chunk) => {
    const entry = objectEntries(chunk)
    const name = /^'([^']+)'$/.exec(entry.name ?? '')?.[1]
    if (!name) {
      throw new Error(
        `a CAPABILITY_CONFIGS entry in ${registryFile} has no string name — ` +
          'scripts/docs/generate-reference.ts cannot describe it.',
      )
    }
    const note = CAPABILITY_NOTES[name]
    if (!note) missing('registered capability', name)

    const enabled = entry.enabled
    const validate = entry.validate ?? '(none)'
    const validateModule = registryImports[validate]
      ? resolveSpecifier(registryFile, registryImports[validate])
      : registryFile

    return [
      `### ${name}`,
      '',
      `- Ships: ${enabled ? 'conditionally — see the gate below' : 'ON, with no toggle'}`,
      ...(enabled ? [`- Gate: \`${enabled}\``] : []),
      `- Config validated by: \`${validate}\` in \`${validateModule}\``,
      '',
      note,
    ].join('\n')
  })

  const clientSource = stripComments(read(root, clientFile))
  const clientBody = balancedBody(
    clientSource,
    clientSource.indexOf('export function validateClientEnv'),
  )
  const clientCalls = [...clientBody.matchAll(/(\w+)\(\)/g)].map((m) => m[1])
  const clientBlocks = clientCalls.map((fn) => {
    const note = CLIENT_CAPABILITY_NOTES[fn]
    if (!note) missing('build-time config group', fn)
    return `- \`${fn}\` in \`${owner(fn, clientFile)}\` — ${note}`
  })

  const availabilityText = stripComments(read(root, availabilityFile))
  const withheld = [
    ...balancedBody(
      availabilityText,
      availabilityText.indexOf('export function unavailableCapabilities'),
    ).matchAll(/'([a-z][\w:-]*)'/g),
  ].map((m) => m[1])

  return doc(
    banner([registryFile, clientFile, availabilityFile]),
    '# Capabilities',
    'What this starter ships that a fork can turn off or delete, and what ' +
      'decides whether each one is on.',
    'There are two different questions here and they must not be collapsed. ' +
      '"Does this deployment ship the feature at all" is answered by ' +
      'configuration, below. "May this person use it" is answered by roles, ' +
      'which is a separate mechanism. Why they stay separate: ' +
      '[the capability model](../explanation/capability-model.md).',
    '## Server capabilities validated at boot',
    'Each entry is one line in the capability manifest. Every ENABLED entry is ' +
      'forced to parse its config when the server starts, and every failure is ' +
      'collected rather than stopping at the first — a fresh clone sees ' +
      'everything it has to fix in one boot. A capability that reads ' +
      'environment without being registered here is not in that pass — why ' +
      'registration is the single act that prevents it is argued in ' +
      '[the capability model](../explanation/capability-model.md).',
    blocks.join('\n\n'),
    '## Public config groups validated at build',
    'The public-side counterpart. A capability that owns public configuration ' +
      'is listed by one call here rather than declaring its schema centrally, so ' +
      'deleting the capability removes a line instead of leaving an orphan ' +
      'schema behind.',
    clientBlocks.join('\n'),
    '## Permissions withheld by deployment config',
    withheld.length > 0
      ? `While its capability is switched off, the following permission is ` +
          `refused at the server boundary and never advertised in the UI: ` +
          `${withheld.map((c) => `\`${c}\``).join(', ')}.`
      : 'No permission is currently withheld by deployment config.',
    'The variables each capability requires are listed in ' +
      '[`configuration.md`](configuration.md), which owns that detail.',
  )
}

// ---------------------------------------------------------------------------
// docs/reference/project-layout.md
// ---------------------------------------------------------------------------

/**
 * Directories that are NOT expanded a level. `docs/` is mapped by the docs index
 * itself, and duplicating that map here would mean two lists to keep in step.
 */
const UNEXPANDED = new Set(['docs'])

const LAYOUT_NOTES: Record<string, string> = {
  // Top level.
  '.agents': 'Runnable procedures for agents, shared across agent tooling.',
  '.claude':
    'Claude-specific entry points, symlinked at the shared procedures.',
  '.github': 'CI configuration and dependency automation.',
  '.vscode':
    'Editor settings and recommended extensions, checked in so the tree formats the same for everyone.',
  app: 'Routes. Pages, layouts and HTTP route handlers.',
  components: 'Shared presentation. Nothing here reaches for a feature.',
  docs: 'The documentation surface. Its own index maps it.',
  e2e: 'Browser specs driven against a running app.',
  features:
    'Vertical slices, one directory per entity, each owning its schema, repo, actions and UI.',
  hooks: 'Shared React hooks that no single feature owns.',
  integrations:
    'Code that runs outside this app and feeds AISA (the Google Apps Script form hook).',
  lib: 'Shared non-visual code: the seams every feature builds on.',
  public: 'Static assets served as-is.',
  rules: 'Repo-specific structural lint rules.',
  'rule-tests':
    'Fixtures proving the structural lint rules fire and do not over-fire.',
  scripts: 'Executable tooling. Runs under plain Node, no build step.',
  services:
    'The Python AISA services (aisa-api). Owned outside this app; the dashboard only calls them.',
  test: 'Test infrastructure shared across suites.',

  // Second level.
  '.agents/skills': 'The procedures themselves, one directory each.',
  'integrations/apps-script':
    'The Apps Script bound to the intake Google Form; posts each response to `aisa-api`.',
  '.claude/skills': 'Symlinks to the shared procedures.',
  '.github/workflows': 'The pipeline definition.',
  'app/(app)': 'The authenticated shell: the AISA pages.',
  'app/403': 'The refusal page a denied capability lands on.',
  'app/api': 'HTTP route handlers — session and health.',
  'app/login': 'Sign-in: Firebase email/password, then a session cookie.',
  'e2e/acceptance':
    'Acceptance specs for the AISA screens and write buttons, with a mock `aisa-api` the container calls.',
  'components/shell':
    'The application shell: sidebar, header, command menu, notifications, and user menu.',
  'components/ui':
    'The primitive component set the rest of the UI is built from.',
  'features/aisa':
    'The AISA read model: zod mirrors of the Firestore contract, repos, labels, and the server actions that call `aisa-api`.',
  'features/_template':
    'The copy-me entity template. Excluded from the normal typecheck, checked separately.',
  'lib/aisa-api':
    'The server-only client for the Python `aisa-api`: config, fetch, and outcome shape.',
  'lib/api':
    'The HTTP contract: response envelope, error taxonomy, correlation id, typed client fetcher.',
  'lib/auth': 'The session DAL, roles and capabilities, guards.',
  'lib/data':
    'The data path shared by every entity: the action contract, converters, pagination, counters, timestamps, batching.',
  'lib/env': 'Environment configuration and the boot-time capability manifest.',
  'lib/firebase':
    'SDK bootstrap for both runtimes, plus the typed collection accessors.',
  'lib/format': 'Display formatting: currency, dates, numbers, locale.',
  'lib/http': 'Rate limiting and origin checks.',
  'lib/log': 'The structured logger and its levels.',
  'lib/observability':
    'Error monitoring: config and the field allow-list that decides what may leave.',
  'lib/repos': 'Repositories no single feature owns.',
  'lib/schemas': 'Schemas no single feature owns.',
  'scripts/docs': 'The documentation gate and this generator.',
  'scripts/migration': 'The migration runner and its template.',
  'scripts/snapshot': 'Database export and restore.',
  'scripts/structure': 'The architecture gate.',
  'services/api':
    'aisa-api: the FastAPI service every dashboard write goes through, and the Pydantic models the Firestore contract mirrors.',
  'test/builders': 'Fixture builders shared by suites.',
  'test/integration': 'Emulator-backed tests.',
  'test/stubs': 'Module stubs the unit runner substitutes.',

  // Root files that carry behaviour.
  'instrumentation-client.ts': 'Browser-side startup.',
  'instrumentation-node.ts':
    'Server startup, where the boot-time capability check runs.',
  'instrumentation.ts': 'The runtime-dispatching startup entry point.',
  'next.config.ts':
    'Framework configuration, the security-header baseline, and the build-time public-env gate.',
  'playwright.config.ts': 'Browser-suite configuration.',
  'proxy.ts': 'The request-path middleware.',
  'vitest.config.ts': 'Test-runner configuration.',
}

function renderProjectLayout(root: string): string {
  // Tracked plus untracked-but-not-ignored: what the repo intends to contain,
  // without build output or anything else `.gitignore` already excludes.
  const paths = trackedPaths(root)

  const topDirs = new Set<string>()
  const subDirs = new Set<string>()
  const rootFiles = new Set<string>()
  for (const path of paths) {
    const parts = path.split('/')
    if (parts.length === 1) {
      if (path.endsWith('.ts') && !path.endsWith('.test.ts'))
        rootFiles.add(path)
      continue
    }
    topDirs.add(parts[0])
    if (parts.length > 2 && !UNEXPANDED.has(parts[0])) {
      subDirs.add(`${parts[0]}/${parts[1]}`)
    }
  }

  const describe = (key: string): string => {
    const note = LAYOUT_NOTES[key]
    if (!note) missing('directory or root file', key)
    return note
  }

  const lines: string[] = []
  for (const dir of [...topDirs].toSorted()) {
    lines.push(`- \`${dir}/\` — ${describe(dir)}`)
    for (const sub of [...subDirs].toSorted()) {
      if (sub.startsWith(`${dir}/`)) {
        lines.push(`  - \`${sub.split('/')[1]}/\` — ${describe(sub)}`)
      }
    }
  }

  const fileLines = [...rootFiles]
    .toSorted()
    .map((file) => `- \`${file}\` — ${describe(file)}`)

  const known = new Set([...topDirs, ...subDirs, ...rootFiles])
  for (const key of Object.keys(LAYOUT_NOTES)) {
    if (!known.has(key)) {
      throw new Error(
        `scripts/docs/generate-reference.ts describes "${key}", which is not in ` +
          'the tree any more — remove the entry.',
      )
    }
  }

  return doc(
    banner(['the working tree, as git reports it']),
    '# Project layout',
    'Where things live, one level down. Enumerated from the tree rather than ' +
      'maintained by hand, so a directory that appears without a line here is a ' +
      'failed check rather than a surprise six months later.',
    'What is listed: every directory the repository intends to contain, plus one ' +
      'level inside it, plus the behaviour-carrying TypeScript files at the root. ' +
      'Individual files inside a directory are deliberately not listed — that is ' +
      'what the tree itself is for.',
    '## Directories',
    lines.join('\n'),
    '## Root files',
    fileLines.join('\n'),
  )
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * The generated docs, paired with the sources they are derived from. Consumed
 * both by the CLI below (which writes them) and by `scripts/docs/context.ts`
 * (which asserts what is on disk equals what these render) — one render function,
 * so the writer and the checker cannot disagree.
 */
export const generatedReferencePairs: GeneratedPair[] = [
  {
    generated: 'docs/reference/commands.md',
    sources: ['package.json'],
    render: renderCommands,
  },
  {
    generated: 'docs/reference/configuration.md',
    sources: [...ENV_GROUPS.map((g) => g.file), 'lib/log/levels.ts'],
    render: renderConfiguration,
  },
  {
    generated: 'docs/reference/capabilities.md',
    sources: [
      'lib/env/registry.ts',
      'lib/env/client.ts',
      'lib/auth/capability-availability.ts',
    ],
    render: renderCapabilities,
  },
  {
    // No file source: the tree ITSELF is the source, so there is nothing to
    // existence-check. Drift is still caught, because the renderer re-reads the
    // tree on every run.
    generated: 'docs/reference/project-layout.md',
    sources: [],
    render: renderProjectLayout,
  },
]

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  for (const pair of generatedReferencePairs) {
    writeFileSync(resolve(repoRoot, pair.generated), pair.render(repoRoot))
    console.log(`docs:generate — wrote ${pair.generated}`)
  }
}
