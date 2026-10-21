/**
 * Materialize the copy-me entity templates into a real `Widget` feature.
 *
 * The generation ONLY — no checking. It exists as its own module because two
 * callers need the same `Widget`, and the moment they each build their own the
 * two stop being the same entity: `check-templates.ts` typechecks it and holds
 * it to the architecture contracts, and `test/integration/template-widget.test.ts`
 * runs its CRUD against the emulator. A helper whose token table or file
 * discovery differed between those two would let a template pass the gate and
 * fail the drive, or the reverse, with nothing to say which `Widget` was wrong.
 *
 * Every `_template.<kind>.<ext>` under a root below is discovered at runtime —
 * no hardcoded list, so dropping a new template in is enough.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root, from this module's own location — never `process.cwd()`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Where the copy-me templates live, and what a generated copy is called. For
 * `scripts/migration/_template.ts` the `<kind>` is empty.
 */
const TEMPLATE_ROOTS: {
  dir: string
  outDir: string
  rename: (kind: string, ext: string) => string
}[] = [
  // The entity feature templates: `_template.<kind>.<ext>` -> `widget.<kind>.<ext>`
  // in a generated `features/_check-widget/`. Sibling imports (`./__entity__.schema`
  // -> `./widget.schema`) resolve inside the generated directory.
  {
    dir: 'features/_template',
    outDir: 'features/_check-widget',
    rename: (kind, ext) => `widget.${kind}.${ext}`,
  },
  // The migration template. A `_check-` name is never picked up by the runner's
  // `NNNN-` discovery, so it can never actually run.
  {
    dir: 'scripts/migration',
    outDir: 'scripts/migration',
    rename: (_kind, ext) => `_check-migration.${ext}`,
  },
]

/** Placeholder token → concrete substitution. Case-distinct, order-independent. */
const SUBSTITUTIONS: [RegExp, string][] = [
  [/__ENTITY__/g, 'WIDGET'],
  [/__ENTITIES__/g, 'WIDGETS'],
  [/__Entity__/g, 'Widget'],
  // PascalCase PLURAL, for the identifiers that name a set rather than one row
  // (`listWidgets`, `ListWidgetsArgs`). `__Entity__` cannot serve here: it does
  // not match this token (`Entity` vs `Entities`), so its absence left the
  // plural unresolved rather than merely awkward.
  [/__Entities__/g, 'Widgets'],
  [/__entities__/g, 'widgets'],
  [/__entity__/g, 'widget'],
  // Migration-template-only tokens — no-ops for the feature templates.
  [/__field__/g, 'checkField'],
  [/__value__/g, 'checkValue'],
  [/__migration_id__/g, '0000-check-migration'],
]

const PREFIX = '_template.'

/** The collection the generated entity writes to — `__entities__` substituted. */
export const GENERATED_COLLECTION = 'widgets'

export interface GeneratedFile {
  /** Absolute path of the written file. */
  file: string
  /**
   * Repo-relative path of the `_template.*` it came from.
   *
   * Carried so a failure can name the file someone can actually EDIT. Every path
   * a checker sees is a generated one in a temp directory that no longer exists
   * by the time they read the message, and `widget.action.ts` is not a file in
   * this repository.
   */
  template: string
  /** The directory it was written into. */
  generatedDir: string
  /** The template directory it came from, for resolving orphan imports. */
  originalDir: string
}

function substitute(source: string): string {
  return SUBSTITUTIONS.reduce(
    (text, [token, value]) => text.replace(token, value),
    source,
  )
}

/**
 * `_template.form-opts.ts` -> `{ kind: 'form-opts', ext: 'ts' }`;
 * `_template.ts` -> `{ kind: '', ext: 'ts' }`.
 */
function splitTemplateName(name: string): { kind: string; ext: string } {
  const rest = name.slice(PREFIX.length)
  const dot = rest.lastIndexOf('.')
  return dot === -1
    ? { kind: '', ext: rest }
    : { kind: rest.slice(0, dot), ext: rest.slice(dot + 1) }
}

/**
 * A relative import that names no generated sibling must point back at the REPO
 * file the template meant — `scripts/migration/_template.ts` imports
 * `./infrastructure.ts`, which exists in the repo and is not generated here. It
 * is resolved against the template's ORIGINAL directory, so module identity is
 * preserved exactly and real drift still surfaces. Relative imports that DO name
 * a generated sibling (`./widget.schema`) are left alone. `.ts`/`.tsx` suffixes
 * are optional in this repo (`allowImportingTsExtensions`), so try both shapes.
 */
function rewriteOrphanImports(
  source: string,
  generatedDir: string,
  originalDir: string,
): string {
  return source.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.[^'"]*)\2/g,
    (match, lead: string, quote: string, spec: string) => {
      const candidate = resolve(generatedDir, spec)
      const generatedExists = [
        candidate,
        `${candidate}.ts`,
        `${candidate}.tsx`,
      ].some((path) => existsSync(path))
      if (generatedExists) return match
      const repoPath = resolve(originalDir, spec).replaceAll('\\', '/')
      return `${lead}${quote}${repoPath}${quote}`
    },
  )
}

/**
 * Write a generated `Widget` under `outRoot` and return every file written.
 *
 * Two passes: substitute all of them first, then repoint the relative imports
 * that name no generated sibling — the second pass has to see every sibling
 * already on disk before it can tell an orphan from a neighbour.
 */
export function generateTemplates(outRoot: string): GeneratedFile[] {
  const generated: GeneratedFile[] = []
  for (const root of TEMPLATE_ROOTS) {
    const originalDir = join(REPO_ROOT, root.dir)
    const generatedDir = join(outRoot, root.outDir)
    mkdirSync(generatedDir, { recursive: true })
    for (const name of readdirSync(originalDir).toSorted()) {
      if (!name.startsWith(PREFIX)) continue
      const { kind, ext } = splitTemplateName(name)
      const file = join(generatedDir, root.rename(kind, ext))
      writeFileSync(
        file,
        substitute(readFileSync(join(originalDir, name), 'utf8')),
      )
      generated.push({
        file,
        template: `${root.dir}/${name}`,
        generatedDir,
        originalDir,
      })
    }
  }

  for (const { file, generatedDir, originalDir } of generated) {
    writeFileSync(
      file,
      rewriteOrphanImports(
        readFileSync(file, 'utf8'),
        generatedDir,
        originalDir,
      ),
    )
  }

  return generated
}
