/**
 * Compiler-backed foundation for `structure:check`.
 *
 * Every architecture check reads the REAL import/export graph through the
 * TypeScript API — a `ts.Program` loaded ONCE from `tsconfig.json` — never a
 * regex over source text. Aliased (`@/…`) and relative (`../…`) specifiers both
 * resolve to the same absolute file, so a check classifies by where a module
 * ACTUALLY lives, not by how the importer spelled the path.
 *
 * The same abstraction drives two roots:
 *   - the repo tree (default), for the real gate; and
 *   - a fixture directory, for the tests — each check is proven to bite on a
 *     purpose-built bad tree and stay silent on a good one.
 * A check therefore classifies tiers/paths RELATIVE to `rootDir`, so a fixture
 * mirrors only the sub-paths it needs (`lib/`, `features/`, `app/(app)/…`).
 *
 * The repo-root program EXCLUDES `scripts/structure/__fixtures__/**`: those files
 * are deliberately-broken samples and must never count as real violations. The
 * exclusion is the single lynchpin that lets the fixtures live in-tree (typechecked
 * by the normal `tsc`) without failing the real gate.
 */
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import ts from 'typescript'

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

/** One import/export edge out of a source file. */
export interface ImportEdge {
  /** The specifier text as written (`@/lib/x`, `./y`, `server-only`). */
  spec: string
  /** Absolute resolved target, or undefined for an unresolvable/ambient module. */
  resolved: string | undefined
  /** A `import type …` / `export type …` edge — erased at runtime, no bundle pull. */
  isTypeOnly: boolean
  /** A bare side-effect import (`import 'x'`) — no bindings. */
  isSideEffect: boolean
  /** Imported binding identifiers (named + default + namespace). */
  names: string[]
}

export interface StructureProgram {
  readonly rootDir: string
  readonly program: ts.Program
  /** Project source files under `rootDir`, excluding node_modules/.next/worktrees
   *  and (for the repo root) the harness's own `__fixtures__`. */
  sourceFiles(): ts.SourceFile[]
  /** Posix path of `file` relative to `rootDir`. */
  rel(file: string): string
  /** The source file whose rel path equals `rel`, or undefined. */
  byRel(rel: string): ts.SourceFile | undefined
  /** Resolve `spec` from `fromFile` to an absolute target file, or undefined. */
  resolve(fromFile: string, spec: string): string | undefined
  /** Import/export edges out of `sf`. */
  importEdges(sf: ts.SourceFile): ImportEdge[]
  /** Whether `sf` carries the `'use client'` directive prologue. */
  hasUseClient(sf: ts.SourceFile): boolean
  /** Whether `sf` carries the module-level `'use server'` directive — a server
   *  action boundary: a client importing it gets RPC stubs, so its own imports
   *  are NOT pulled into the client bundle. */
  hasUseServer(sf: ts.SourceFile): boolean
  /** Whether `sf` imports the `server-only` marker module. */
  hasServerOnly(sf: ts.SourceFile): boolean
  /** `export * from '…'` (bare wildcard) re-exports declared in `sf`. */
  wildcardExports(sf: ts.SourceFile): { spec: string }[]
}

/**
 * ONE entry, the repo-root program — never fixture roots.
 *
 * A `ts.Program` retains every source file it parsed, and the default lib plus
 * the `@types` set dwarf the fixture itself: a fixture root of a few files
 * measured 407 source files and ~146MB of heap. Each fixture root is analysed
 * EXACTLY ONCE (one call per check per variant, all distinct dirs), so caching
 * them could never hit — it only pinned all 32 live at once, ~4.7GB against the
 * 2GB vitest worker heap. Uncached, each becomes garbage once its check has run.
 */
let repoProgram: StructureProgram | undefined

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

function loadTsconfig(): { options: ts.CompilerOptions; fileNames: string[] } {
  const configPath = path.join(REPO_ROOT, 'tsconfig.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error) {
    throw new Error(
      `structure: cannot read tsconfig.json — ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`,
    )
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, REPO_ROOT)
  return { options: parsed.options, fileNames: parsed.fileNames }
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry)
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === '.next') continue
        stack.push(full)
      } else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
        out.push(full)
      }
    }
  }
  return out
}

/** Prologue directives (`'use client'`, `'use server'`) precede all other code. */
function directiveTexts(sf: ts.SourceFile): string[] {
  const texts: string[] = []
  for (const statement of sf.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteralLike(statement.expression)
    ) {
      texts.push(statement.expression.text)
    } else {
      break
    }
  }
  return texts
}

function edgeFrom(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
  resolveSpec: (spec: string) => string | undefined,
): ImportEdge | undefined {
  const specifier = node.moduleSpecifier
  if (!specifier || !ts.isStringLiteral(specifier)) return undefined
  const spec = specifier.text

  let isTypeOnly = false
  let isSideEffect = false
  const names: string[] = []

  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause
    if (!clause) {
      isSideEffect = true
    } else {
      if (clause.isTypeOnly) isTypeOnly = true
      if (clause.name) names.push(clause.name.text)
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        names.push(bindings.name.text)
      } else if (bindings && ts.isNamedImports(bindings)) {
        const elements = bindings.elements
        names.push(...elements.map((element) => element.name.text))
        // Whole clause is value-less only if EVERY named element is `type`.
        if (
          !clause.isTypeOnly &&
          elements.length > 0 &&
          elements.every((element) => element.isTypeOnly)
        ) {
          isTypeOnly = true
        }
      }
    }
  } else {
    // export … from '…'
    if (node.isTypeOnly) isTypeOnly = true
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      const elements = node.exportClause.elements
      names.push(...elements.map((element) => element.name.text))
      if (
        !node.isTypeOnly &&
        elements.length > 0 &&
        elements.every((element) => element.isTypeOnly)
      ) {
        isTypeOnly = true
      }
    }
  }

  return { spec, resolved: resolveSpec(spec), isTypeOnly, isSideEffect, names }
}

/** An agent's disposable checkout: `<repo>/.claude/worktrees/<name>/…`. */
const WORKTREE_PATH = /[/\\]\.claude[/\\]worktrees[/\\]/

function make(
  rootDir: string,
  options: ts.CompilerOptions,
  program: ts.Program,
): StructureProgram {
  const insideFixtures = rootDir.includes('__fixtures__')
  /**
   * Whether the root IS an agent worktree — the same escape `insideFixtures`
   * makes, for the same reason.
   *
   * A scan of the repo must not walk the disposable checkouts under
   * `.claude/worktrees/`; a scan OF one must walk nothing else. Without this the
   * filter below excluded every file in such a root and the run reported `OK —
   * every architecture contract holds` having analysed ZERO files. That is worse
   * than no gate, and it lands exactly where it does the most damage: the
   * removal how-to sends a reader to a throwaway worktree to prove a deletion is
   * clean, and `public-path-match` and `capability-completeness` are the two
   * checks that catch a dead nav link and an orphaned capability.
   */
  const insideWorktree = WORKTREE_PATH.test(rootDir)
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep

  const resolve = (fromFile: string, spec: string): string | undefined => {
    const resolved = ts.resolveModuleName(spec, fromFile, options, ts.sys)
    return resolved.resolvedModule?.resolvedFileName
  }

  const sourceFiles = (): ts.SourceFile[] =>
    program.getSourceFiles().filter((sf) => {
      const f = sf.fileName
      if (sf.isDeclarationFile) return false
      if (f !== rootDir && !f.startsWith(rootPrefix)) return false
      if (/[/\\]node_modules[/\\]/.test(f)) return false
      if (/[/\\]\.next[/\\]/.test(f)) return false
      if (!insideWorktree && WORKTREE_PATH.test(f)) return false
      // The lynchpin: never analyse the harness's own bad/good samples as if
      // they were real repo code — except when the root IS a fixture (the tests).
      if (!insideFixtures && f.includes(`${path.sep}__fixtures__${path.sep}`)) {
        return false
      }
      return true
    })

  const rel = (file: string): string => toPosix(path.relative(rootDir, file))

  const byRel = (target: string): ts.SourceFile | undefined =>
    sourceFiles().find((sf) => rel(sf.fileName) === target)

  return {
    rootDir,
    program,
    sourceFiles,
    rel,
    byRel,
    resolve,
    importEdges: (sf) => {
      const resolveSpec = (spec: string) => resolve(sf.fileName, spec)
      const edges: ImportEdge[] = []
      for (const statement of sf.statements) {
        if (
          ts.isImportDeclaration(statement) ||
          ts.isExportDeclaration(statement)
        ) {
          const edge = edgeFrom(statement, resolveSpec)
          if (edge) edges.push(edge)
        }
      }
      return edges
    },
    hasUseClient: (sf) => directiveTexts(sf).includes('use client'),
    hasUseServer: (sf) => directiveTexts(sf).includes('use server'),
    hasServerOnly: (sf) =>
      sf.statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === 'server-only',
      ),
    wildcardExports: (sf) => {
      const out: { spec: string }[] = []
      for (const statement of sf.statements) {
        if (
          ts.isExportDeclaration(statement) &&
          !statement.exportClause && // `export * from` — NOT `export * as ns from`
          statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          out.push({ spec: statement.moduleSpecifier.text })
        }
      }
      return out
    },
  }
}

/**
 * Build the analysis program for a root — memoised for the repo root only.
 *
 * The repo root reuses `tsconfig.json` verbatim so alias resolution matches the
 * real build. A fixture root is compiled ad hoc from the `.ts`/`.tsx` files it
 * contains, under the repo's compiler options, so relative specifiers resolve
 * exactly as they would in the tree — and is rebuilt on every call, so it can be
 * collected (see `repoProgram`).
 */
export function buildStructureProgram(
  rootDir: string = REPO_ROOT,
): StructureProgram {
  const key = path.resolve(rootDir)
  const isRepoRoot = key === REPO_ROOT
  if (isRepoRoot && repoProgram) return repoProgram

  const { options, fileNames } = isRepoRoot
    ? loadTsconfig()
    : { options: loadTsconfig().options, fileNames: walkTsFiles(key) }

  const program = ts.createProgram(fileNames, options)
  const structureProgram = make(key, options, program)
  if (isRepoRoot) repoProgram = structureProgram
  return structureProgram
}
