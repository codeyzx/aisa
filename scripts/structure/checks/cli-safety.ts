/**
 * Tooling scripts must not shell out to a raw destructive remove, AND every
 * script that can mutate a database must stand behind a declared safety gate.
 *
 * BUILDER (durable): enumerates every script under `scripts/**` and inspects its
 * child-process invocations (`execSync`, `exec`, `execFileSync`, `spawn`,
 * `spawnSync`) by reading the command STRING off the AST — not a text regex.
 *
 * SHALLOW ASSERTION: no script passes a command whose program is `rm` / `rmdir`,
 * or that uses find's `-delete`. The house rule is to delete through `trash`
 * (recoverable) or a scoped `node:fs` call, never a shell `rm` that can be
 * mis-aimed at the wrong path. Green today: the scripts that remove files do so
 * via `node:fs`, and the rest shell out only to `pnpm` / `lefthook`.
 *
 * DEEP ASSERTION (the mutating-script safety manifest, now live): a script that
 * BOTH (a) can reach a database and (b) performs a mutating operation on one must
 * import one of the two sanctioned gates from `scripts/_safety.ts`:
 *   - `requireProjectIdConfirmation` — plan by default, then type the project id
 *     back on the controlling terminal (`migration/run.ts`, `snapshot/restore.ts`);
 *   - `requireEmulatorTarget` — refuse to run unless the emulator hosts are set,
 *     so the script provably cannot reach a real database (`seed-emulator.ts`).
 * Those two are the whole manifest. A gate is recognised as an IMPORT EDGE, which
 * is why `seed-emulator.ts`'s fence was moved into `_safety.ts`: hand-rolled
 * `if (!host) process.exit(1)` control flow is invisible to a structure check, so
 * an exemption from confirmation has to be EARNED by a checkable edge.
 *
 * EACH CRITERION HAS TWO FORMS, because the Admin SDK is not the only way to
 * reach a database from this repo. (a) is satisfied by an Admin-SDK import edge OR
 * by addressing an `/emulator/v1/` admin endpoint — the emulator's own REST
 * surface, reached over plain `fetch` with no import to follow. (b) is satisfied
 * by a mutating method name OR by a state-changing HTTP method (`DELETE`, `POST`,
 * `PUT`, `PATCH`) written as a `method:` property — a `fetch` request init, in
 * practice, but any object literal counts. `db-reset.ts` is why: it wipes every
 * Firestore document and every Auth account by `DELETE`-ing two emulator REST
 * paths, importing only node builtins and `./_safety.ts` — so under an
 * Admin-SDK-only criterion (a), the most destructive script in the repo was the
 * one script the manifest could not see, and deleting its fence left this check
 * green. Both forms of (a) are followed TRANSITIVELY by the same walk, so a
 * script that reaches the emulator through a helper is covered too.
 *
 * TRANSITIVE, AND TYPE-ONLY EDGES EXCLUDED — both deliberately. `snapshot/restore.ts`
 * gets its client through `./_admin.ts` and its only DIRECT `firebase-admin` import
 * is `import type` — a type-only edge is erased at runtime and can never carry a
 * client, so following it would flag files that cannot touch a database.
 *
 * DELIBERATELY OVER-APPROXIMATE. Criterion (b) is a NAME match on property-access
 * calls (`set`, `update`, `delete`, `commit`, `add`, `createUser`, …), so a
 * `someMap.set(...)` inside a file that also reaches the Admin SDK counts. That is
 * the correct bias for a safety check: the failure mode is "a script is told to
 * declare a gate it may not strictly need", never "a script that wipes a database
 * slips through". A receiver-type check via the type checker would be more precise
 * and less durable — it is NOT wanted here. The conjunction is what keeps it
 * tractable: `structure/program.ts` and `scripts/docs/*.ts` call `.set(`/`.add(`
 * on Maps and Sets but never reach a database, so they are not flagged. A
 * genuinely-unaffected file uses the normal exemption mechanism
 * (`scripts/structure/exemptions.ts`), not a loosening of this rule.
 *
 * The two forms of each criterion CROSS-PAIR, and that is a widening worth saying
 * out loud: a file that addresses an emulator endpoint and calls `map.set(…)`
 * would be flagged, as would one that reaches the Admin SDK and `POST`s somewhere
 * unrelated. Same bias as above — the cost is a gate a script may not need, never
 * a wipe that slips through. `check-indexes.ts` is the case that shows this is not
 * hypothetical: it reads an `/emulator/v1/` endpoint, so criterion (a) hits, and
 * it stays green only because it does nothing mutating at all — a `GET` and no
 * mutating method name. Read-only emulator tooling is fine; the day it grows a
 * `.set(` on a Map, this check will ask it for a gate.
 *
 * SCOPE OF THE DEEP ASSERTION: executed scripts only — `*.test.ts` is excluded,
 * because a vitest suite is not a CLI an operator runs at a database. It is a
 * structural exclusion (a file kind), not a per-file escape hatch, and it is
 * narrow: the shallow shell-remove assertion still covers every file under
 * `scripts/**`, tests included. `snapshot/codec.test.ts` is the case in point —
 * it value-imports `firebase-admin/firestore` for `Timestamp` and calls
 * `Object.create(…)` against a hand-made fake `Firestore`, so both criteria hit
 * on a file that cannot reach any database at all.
 */
import ts from 'typescript'

import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { calleeName, forEachNode, propertyStringValues } from '../ast.ts'

const EXEC_CALLEES = new Set([
  'execSync',
  'exec',
  'execFileSync',
  'spawn',
  'spawnSync',
])

/** The module that owns both gates. Path is relative to the analysed root. */
const SAFETY_MODULE = 'scripts/_safety.ts'

/** The only two sanctioned gates. Importing either satisfies the deep assertion. */
const GATES = ['requireProjectIdConfirmation', 'requireEmulatorTarget']

/**
 * Method names that mutate a Firestore/Auth database. Matched by NAME on a
 * property-access call — see the header on why that over-approximation is wanted.
 */
const MUTATING_METHODS = new Set([
  'set',
  'update',
  'delete',
  'create',
  'commit',
  'recursiveDelete',
  'bulkWriter',
  'add',
  'createUser',
  'updateUser',
  'deleteUser',
  'setCustomUserClaims',
])

/**
 * The URL prefix of the emulator suite's own admin API — the routes that clear
 * Firestore and Auth wholesale. A real Firebase project does not serve them, so
 * a script addressing one is by definition emulator tooling; the fence is what
 * proves it stays that way when the env says otherwise.
 *
 * A REGEX, NOT A STRING, and that is load-bearing: the matcher below reads string
 * and template literals, so writing this pattern as a literal made THIS FILE match
 * its own criterion (a) — and, with `memo.set(…)` below satisfying (b), the check
 * failed on itself the first time it ran. A regex literal is not a string literal
 * node, so the file that names the pattern is not mistaken for a file that calls
 * it. Do not "simplify" this back to a quoted string.
 */
const EMULATOR_ADMIN_PATH = /\/emulator\/v1\//

/** HTTP methods that change server state, as written in a `fetch` request init. */
const MUTATING_HTTP_METHODS = new Set(['DELETE', 'POST', 'PUT', 'PATCH'])

/** Whether `sf` calls any mutating method by name (`x.set(…)`, `x.y.commit(…)`). */
function callsMutatingMethod(sf: ts.SourceFile): boolean {
  let found = false
  forEachNode(sf, (node) => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    if (!ts.isPropertyAccessExpression(callee)) return
    if (MUTATING_METHODS.has(callee.name.text)) found = true
  })
  return found
}

/**
 * Whether `sf` assigns a state-changing HTTP verb to a `method:` property. The
 * URL is a variable at the `fetch` call site in every real case (`db-reset.ts`
 * passes it into a helper), so this is a FILE-level signal like the mutating
 * method names above — not a per-call-site pairing that would miss them all.
 */
function sendsMutatingHttpMethod(sf: ts.SourceFile): boolean {
  return propertyStringValues(sf, 'method').some((value) =>
    MUTATING_HTTP_METHODS.has(value.toUpperCase()),
  )
}

/**
 * Whether `sf` spells an emulator admin URL anywhere. Every quoted fragment
 * counts, template pieces included — the real URLs are built as
 * `` `http://${host}/emulator/v1/projects/${id}/…` ``, so the marker lands in a
 * template SPAN rather than in a whole-string literal.
 */
function addressesEmulatorAdminEndpoint(sf: ts.SourceFile): boolean {
  let found = false
  forEachNode(sf, (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (EMULATOR_ADMIN_PATH.test(node.text)) found = true
    }
  })
  return found
}

/**
 * Whether `sf` can reach a database — the Admin SDK, or an emulator admin
 * endpoint — following runtime (non-type-only) import and re-export edges through
 * the analysed tree. Memoised per program run; the `visiting` set makes an import
 * cycle terminate rather than recurse forever.
 */
function makeReachesDatabase(
  program: StructureProgram,
): (sf: ts.SourceFile) => boolean {
  const memo = new Map<string, boolean>()

  const walk = (
    sf: ts.SourceFile,
    visiting: Set<string>,
    state: { truncated: boolean },
  ): boolean => {
    const cached = memo.get(sf.fileName)
    if (cached !== undefined) return cached
    if (visiting.has(sf.fileName)) {
      // A cycle. Returning false terminates the walk, but that false is only
      // true-so-far — the module may still reach the SDK through an edge this
      // branch has not explored yet. Record that, so nothing below caches it.
      state.truncated = true
      return false
    }
    visiting.add(sf.fileName)

    // The endpoint form of criterion (a) is a property of THIS file's own text —
    // there is no import edge to follow when the database is addressed by URL.
    let reaches = addressesEmulatorAdminEndpoint(sf)
    for (const edge of program.importEdges(sf)) {
      if (reaches) break
      if (edge.isTypeOnly) continue
      if (edge.spec.startsWith('firebase-admin')) {
        reaches = true
        break
      }
      if (!edge.resolved) continue
      const target = program.program.getSourceFile(edge.resolved)
      if (!target || target.isDeclarationFile) continue
      if (walk(target, visiting, state)) {
        reaches = true
        break
      }
    }

    visiting.delete(sf.fileName)
    // A `true` is final — one real path to the SDK is proof. A `false` is only
    // cacheable when this walk never truncated at a cycle; otherwise caching it
    // could make a mutating script in an import cycle look unreachable, and this
    // check must never fail in the direction that lets one through ungated.
    if (reaches || !state.truncated) memo.set(sf.fileName, reaches)
    return reaches
  }

  return (sf) => walk(sf, new Set(), { truncated: false })
}

/** Whether `sf` imports one of the sanctioned gates from `scripts/_safety.ts`. */
function importsGate(program: StructureProgram, sf: ts.SourceFile): boolean {
  const safety = program.byRel(SAFETY_MODULE)
  if (!safety) return false
  return program
    .importEdges(sf)
    .some(
      (edge) =>
        edge.resolved === safety.fileName &&
        edge.names.some((name) => GATES.includes(name)),
    )
}

/**
 * The command text of a child-process call's first argument — a plain string,
 * or the literal HEAD of a `\`rm -rf ${dir}\`` template (enough to see the
 * program name before any interpolation, which is where an `rm` hides).
 */
function commandOf(node: ts.CallExpression): string | undefined {
  const first = node.arguments[0]
  if (!first) return undefined
  if (ts.isStringLiteralLike(first)) return first.text
  if (ts.isTemplateExpression(first)) return first.head.text
  return undefined
}

/** Whether a shell command string invokes a raw destructive remove. */
function isDestructiveShell(command: string): boolean {
  const tokens = command.split(/\s+/).filter(Boolean)
  if (tokens.some((token) => token === 'rm' || token === 'rmdir')) return true
  if (tokens.includes('-delete')) return true
  return false
}

export const check: Check = {
  id: 'cli-safety',
  describe:
    'no script shells out to a raw destructive remove, and every database-reaching mutating script imports a gate from scripts/_safety.ts',
  run(program: StructureProgram) {
    const violations: Violation[] = []
    const reachesDatabase = makeReachesDatabase(program)

    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (!rel.startsWith('scripts/')) continue

      // DEEP: can reach a database AND mutates it ⇒ must declare a gate.
      const inScope = rel !== SAFETY_MODULE && !rel.endsWith('.test.ts')
      const mutatesByName = callsMutatingMethod(sf)
      const mutates = mutatesByName || sendsMutatingHttpMethod(sf)
      if (
        inScope &&
        mutates &&
        reachesDatabase(sf) &&
        !importsGate(program, sf)
      ) {
        // Name the form that actually matched, so the reader is not sent looking
        // for an Admin SDK import in a script that talks HTTP (or vice versa).
        const reach = addressesEmulatorAdminEndpoint(sf)
          ? 'addresses an emulator admin endpoint'
          : 'can reach the Admin SDK'
        const mutation = mutatesByName
          ? 'calls a database-mutating method'
          : 'sends a state-changing HTTP method'
        violations.push({
          file: rel,
          contract: 'cli-safety',
          detail:
            `script ${reach} and ${mutation}, but declares no safety gate — import ` +
            `${GATES.join(' or ')} from ${SAFETY_MODULE} (project-id confirmation, or an emulator-only fence)`,
        })
      }

      forEachNode(sf, (node) => {
        if (!ts.isCallExpression(node)) return
        const name = calleeName(node)
        if (!name || !EXEC_CALLEES.has(name)) return
        const command = commandOf(node)
        if (command && isDestructiveShell(command)) {
          violations.push({
            file: rel,
            contract: 'cli-safety',
            detail: `script shells out to a destructive remove ('${command.trim()}…') — use trash or node:fs`,
          })
        }
      })
    }
    return violations
  },
}
