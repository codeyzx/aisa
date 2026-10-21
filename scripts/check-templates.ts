/**
 * Prove the copy-me entity templates actually COMPILE.
 *
 * The templates (`features/_template/_template.*`, `scripts/migration/_template.ts`)
 * are excluded from the normal typecheck by their `_template.*` name (tsconfig
 * `exclude`) — they carry unresolved placeholder tokens (`__Entity__`, …) that
 * are not valid on their own. That exclusion is what lets them drift: a template
 * importing a shared helper that was renamed, or calling `runAction` with the
 * wrong shape, typechecks green because it is never typechecked at all — and the
 * breakage lands on the forker who copies it, with the least context to debug it.
 *
 * This gate closes that hole. `template-generate.ts` materializes a real `Widget`
 * from every discovered template — the same one the emulator-driven test runs, so
 * the compiled entity and the executed entity cannot be different entities — into
 * a fresh temp directory OUTSIDE the repository. A
 * generated tsconfig there extends the repo's, so `@/…` and bare specifiers
 * resolve exactly as they would in a real fork, and `tsc --noEmit` runs over the
 * generated files ONLY — no repo-wide typecheck, so this reports template drift
 * and nothing else. The worktree is never written to, on success or on failure.
 *
 * tsc proves the SHARED-API usage (runAction, audit, paginate, typedCollection,
 * nextCode-free repo, the Migration/MigrationContext contract, …) still holds.
 * The domain-specific parts a forker fills in are their own concern. Two things
 * it cannot see are checked around it, because both are valid TypeScript and
 * both ship real damage: an unresolved `__token__`, and a capability this
 * application already declares. This gate never renders anything, so nothing it
 * reports is evidence about behaviour.
 */
import { execSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

import { CAPABILITIES } from '../lib/auth/rbac.ts'
import { buildStructureProgram } from './structure/program.ts'
import { CHECKS } from './structure/registry.ts'
import { REPO_ROOT, generateTemplates } from './template-generate.ts'

const REPO = REPO_ROOT

/**
 * Double-underscore names that are REAL and must survive substitution. Named
 * one by one, never as a loosened pattern: a placeholder and a sentinel are
 * structurally identical, so the only thing that can tell them apart is someone
 * saying so here.
 *
 * `__name__` is Firestore's document-id field path — `orderBy('__name__')` in
 * `scripts/migration/infrastructure.ts` and `lib/data/pagination.firestore.ts`.
 */
const SENTINELS: ReadonlySet<string> = new Set(['__name__'])

/**
 * A `__token__` the table above does not know, still sitting in generated code.
 *
 * tsc cannot see this: `list__Entities__` is a perfectly valid identifier, so a
 * template that names a token nobody substitutes compiles green here and ships
 * the literal placeholder to the forker. That is the whole failure mode this
 * gate exists to prevent, arriving through the one door tsc does not watch — and
 * it had already happened, to the plural in `_template.repo.ts`.
 */
function unresolvedTokens(source: string): string[] {
  const found = source.match(/[A-Za-z0-9]*__[A-Za-z0-9]+__[A-Za-z0-9]*/g) ?? []
  return [...new Set(found)].filter((token) => !SENTINELS.has(token))
}

/**
 * A capability this application ALREADY declares, appearing in generated code.
 *
 * A copied entity must name its own authority. Keeping a declared one — the
 * reference feature's `…:write`, or any other in `CAPABILITIES` — is the failure
 * with no symptom: every gate passes, every test passes, and the new entity is
 * readable by exactly the people entitled to the OLD one. Read from
 * `CAPABILITIES` rather than a hardcoded prefix, so this follows a fork that
 * renames or replaces the reference feature.
 */
function declaredCapabilities(source: string): string[] {
  return CAPABILITIES.filter((capability) => source.includes(capability))
}

/**
 * The literals a generated entity declares as its own — the
 * `: Capability = 'widget:read'` in its `*.capability.ts`.
 *
 * These MUST NOT typecheck. `Capability` is a closed union, so a fresh copy's
 * capability does not exist until the forker adds it to `CAPABILITIES`, and the
 * refusal is the feature: it is what stops them shipping an entity gated on
 * somebody else's authority. This gate therefore asserts the failure rather than
 * the absence of one — and asserts that it is the ONLY failure.
 */
function ownCapabilityLiterals(source: string): string[] {
  const found = source.matchAll(/:\s*Capability\s*=\s*'([^']+)'/g)
  return [...new Set([...found].map(([, literal]) => literal))]
}

/**
 * The architecture contracts that MEAN something over a generated tree, named
 * one by one rather than run wholesale.
 *
 * `buildStructureProgram(root)` takes any root, but a check's reach stops at it:
 * `sourceFiles()` drops everything outside `rootDir`, so a check that resolves
 * its vocabulary from a repo file (`route-guard-inventory` reading the guard
 * names out of `lib/auth/guards.ts`, `capability-completeness` reading
 * `CAPABILITIES`) finds nothing and returns zero violations. Running the whole
 * registry here would print those as passes. A green tick that inspected nothing
 * is worse than no tick: it is the report claiming coverage it does not have.
 *
 * The five below need only the generated files themselves, so they hold:
 * `action-wrapper-shape` and `single-operation-entry` key on the `.action.ts`
 * suffix the generated entity has; `converter-bypass` and
 * `collection-path-constant` walk every file with no path predicate;
 * `client-server-boundary` traces the generated client island to
 * the generated `server-only` modules, which is where a template would break it.
 */
const GENERATED_TREE_CONTRACTS = [
  'action-wrapper-shape',
  'single-operation-entry',
  'converter-bypass',
  'collection-path-constant',
  'client-server-boundary',
]

/** One `path(line,col): error TS…: message` line of `tsc --pretty false`. */
interface TscError {
  /** Absolute path of the GENERATED file tsc complained about. */
  file: string
  /** `line,col` — valid for the source template too: substitution is same-line. */
  position: string
  /** `error TS…: …`, verbatim. */
  message: string
}

function parseTscErrors(output: string): TscError[] {
  return output
    .split('\n')
    .map((line) => /^(.+?)\((\d+,\d+)\): (error TS\d+: .*)$/.exec(line))
    .filter((match) => match !== null)
    .map(([, file, position, message]) => ({
      file: resolve(REPO, file),
      position,
      message,
    }))
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'aixel-template-check-'))

try {
  // 1. Generate the same `Widget` the driven test uses.
  const generated = generateTemplates(tmpRoot)
  console.log(`check-templates: generated ${generated.length} file(s):`)
  for (const { file, template } of generated)
    console.log(`  - ${relative(tmpRoot, file)} (from ${template})`)

  // 2. Refuse a placeholder that no substitution resolved. Before tsc, because
  //    tsc will happily compile one and report nothing.
  const unresolved = generated
    .map((entry) => ({
      ...entry,
      tokens: unresolvedTokens(readFileSync(entry.file, 'utf8')),
    }))
    .filter(({ tokens }) => tokens.length > 0)
  if (unresolved.length > 0) {
    for (const { template, tokens } of unresolved) {
      console.error(
        `check-templates: ${template} still holds ${tokens.join(', ')}`,
      )
    }
    throw new Error('unresolved template placeholder')
  }

  // 3. Refuse a capability this application already declares. A copy that keeps
  //    one is gated on somebody else's authority, and nothing downstream can see
  //    it: it typechecks, it passes every test, and it grants the wrong people.
  const leaked = generated
    .map((entry) => ({
      ...entry,
      capabilities: declaredCapabilities(readFileSync(entry.file, 'utf8')),
    }))
    .filter(({ capabilities }) => capabilities.length > 0)
  if (leaked.length > 0) {
    for (const { template, capabilities } of leaked) {
      console.error(
        `check-templates: ${template} names ${capabilities.join(', ')} — ` +
          'an already-declared capability. A copied entity must name its own.',
      )
    }
    throw new Error('reference capability in a template')
  }

  // 4. Make the repo's dependencies and its `@/…` alias resolve from the temp
  //    tree. A `junction` symlink is the Windows-friendly form (no elevation).
  symlinkSync(
    join(REPO, 'node_modules'),
    join(tmpRoot, 'node_modules'),
    'junction',
  )
  const repoPosix = REPO.replaceAll('\\', '/')
  // The repo gets Next's ambient declarations (`server-only`, `client-only`, …)
  // from `next-env.d.ts`. That file also references the build-time
  // `.next/types`, so re-declare just the types reference here instead.
  writeFileSync(
    join(tmpRoot, 'next-ambient.d.ts'),
    '/// <reference types="next" />\n',
  )
  const tsconfigPath = join(tmpRoot, 'tsconfig.json')
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        extends: `${repoPosix}/tsconfig.json`,
        compilerOptions: {
          paths: { '@/*': [`${repoPosix}/*`] },
          // A tsbuildinfo in a temp dir is pointless, and would be written out.
          incremental: false,
        },
        include: ['**/*.ts', '**/*.tsx'],
        // The inherited `exclude` names REPO paths, so it would not keep the
        // symlinked node_modules out of THIS program.
        exclude: ['node_modules'],
      },
      null,
      2,
    )}\n`,
  )

  // 5. Typecheck the generated files ONLY — ordinary repo type errors are not
  //    this gate's business.
  console.log(
    'check-templates: typechecking the generated Widget feature + migration…',
  )
  // `execSync` with a shell command STRING is the cross-platform form: the shell
  // resolves `pnpm.cmd` on Windows (via PATHEXT) and `pnpm` on POSIX. execFile
  // cannot launch a .cmd shim directly. The path is machine-generated; quoted
  // anyway. Output is CAPTURED rather than inherited because a clean run is not
  // a silent one — see below.
  let tsc = ''
  try {
    tsc = execSync(
      `pnpm exec tsc --noEmit --pretty false --project "${tsconfigPath}"`,
      { cwd: REPO, encoding: 'utf8' },
    )
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    tsc = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
  }

  // 6. A fresh copy MUST fail, in one place, for one reason: its capability does
  //    not exist yet. Anything else tsc says is template drift, and the absence
  //    of the expected failure means the entity stopped naming its own authority
  //    — the very thing step 3 exists to refuse. So this asserts the failure and
  //    asserts it is the only one.
  const capabilityFile = generated.find(({ file }) =>
    file.endsWith('.capability.ts'),
  )
  if (!capabilityFile) {
    throw new Error('no generated capability declaration to check')
  }
  const undeclared = ownCapabilityLiterals(
    readFileSync(capabilityFile.file, 'utf8'),
  )
  const errors = parseTscErrors(tsc)
  const templateOf = new Map(
    generated.map(({ file, template }) => [file, template]),
  )
  const rejected = (literal: string) =>
    errors.some(
      (error) =>
        error.file === capabilityFile.file && error.message.includes(literal),
    )
  const isExpected = (error: TscError) =>
    error.file === capabilityFile.file &&
    undeclared.some((literal) => error.message.includes(literal))

  const drift = errors.filter((error) => !isExpected(error))
  if (drift.length > 0) {
    // Reported against the TEMPLATE, at the same line: substitution replaces
    // tokens in place and never adds or removes one, so the position tsc gives
    // for the generated file is the position in the file someone can edit.
    for (const error of drift) {
      console.error(
        `check-templates: ${templateOf.get(error.file) ?? error.file}(${error.position}): ${error.message}`,
      )
    }
    throw new Error('the generated entity does not compile')
  }

  // Cannot fire while step 3 stands: a literal tsc accepts is one `CAPABILITIES`
  // declares, and step 3 already refused the file for holding it. Kept because it
  // is the assertion that survives step 3 being narrowed — not because a test can
  // currently fail without it.
  const accepted = undeclared.filter((literal) => !rejected(literal))
  if (accepted.length > 0) {
    console.error(
      `check-templates: tsc ACCEPTED ${accepted.join(', ')} — a fresh copy's ` +
        'capability must not already exist, or the copy inherits an authority ' +
        'nobody granted it.',
    )
    throw new Error('a template capability is already declared')
  }

  // 7. Hold the generated entity to the same architecture contracts the repo
  //    tree obeys. The templates are invisible to `structure:check` for the same
  //    reason they are invisible to tsc — the `_template.*` name keeps them out
  //    of the program — so this is the only place they are checked at all.
  const contracts = GENERATED_TREE_CONTRACTS.map((id) => {
    const check = CHECKS.find((registered) => registered.id === id)
    // A renamed check must not silently stop running here.
    if (!check) throw new Error(`unregistered structure contract: ${id}`)
    return check
  })
  const structure = buildStructureProgram(tmpRoot)
  const violations = contracts.flatMap((check) => check.run(structure))
  if (violations.length > 0) {
    for (const violation of violations) {
      const source =
        templateOf.get(join(tmpRoot, violation.file)) ?? violation.file
      console.error(
        `check-templates: ${source} breaks ${violation.contract} — ${violation.detail}`,
      )
    }
    throw new Error('the generated entity breaks an architecture contract')
  }

  console.log(
    `check-templates: OK — the entity templates compile, hold ${contracts.length} ` +
      `architecture contract(s), and ${undeclared.join(', ')} is undeclared ` +
      'exactly as a fresh copy should be.',
  )
} catch (error) {
  console.error(
    `\ncheck-templates: FAILED — ${(error as Error).message}. A forker who copies ` +
      'these templates would inherit it. Each path above names the `_template.*` ' +
      'to edit; its line numbers are that file’s, since substitution never ' +
      'moves a line.',
  )
  // Set the code rather than rethrow: the real errors are already printed above,
  // and rethrowing would bury them under an execSync stack. `process.exit()`
  // would skip the `finally` teardown.
  process.exitCode = 1
} finally {
  // Outside the repository, so this is a temp-tree delete, never a worktree one.
  rmSync(tmpRoot, { recursive: true, force: true })
}
