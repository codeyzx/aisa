/**
 * A collection reference must carry its Zod converter — never be taken raw off
 * the Admin handle.
 *
 * `typedCollection(path, Schema)` is the sanctioned accessor: it returns a live
 * `CollectionReference<T>` with the whole Firestore query API intact, plus the
 * converter that validates reads and scrubs `undefined` from writes. Reaching
 * past it — `adminDb().collection('assets')` — hands back an untyped
 * `CollectionReference<DocumentData>`. Nothing then validates a read, so a
 * document that drifted from the schema flows into the app as if it were valid,
 * and the failure surfaces far from the query that caused it.
 *
 * WHAT IS *NOT* FLAGGED, and why it matters: `adminDb().runTransaction(…)` is
 * correct and common — it is how a repo makes a create-plus-counter-mint atomic —
 * and the refs used inside it still come from `typedCollection()`, so they keep
 * their converter. This check is deliberately narrow for that reason: it flags
 * only the three members that MINT a reference (`collection`, `doc`,
 * `collectionGroup`), never the handle itself. Naming the handle "unsafe" would
 * libel the transaction idiom and teach forkers to avoid the one API that makes
 * multi-document writes safe.
 *
 * Aliases count: `const db = adminDb()` then `db.collection(…)` is the same
 * bypass spelled over two lines, so a local bound to an `adminDb()` call is
 * tracked and treated identically.
 *
 * The ONE exemption is structural, not a list: `lib/firebase/collections.ts` is
 * where the converter is attached, so it is the single module that legitimately
 * takes a raw reference — that is its entire job.
 *
 * UNVALIDATED READS ARE STILL POSSIBLE, and deliberately so: that module also
 * exports `rawCollection(path)`. Deletion and repair MUST work on a document the
 * schema rejects — a converted read would throw on exactly the corrupt row you
 * most need to remove — so the hatch has to exist. What this check buys is that
 * it has a NAME: `rg rawCollection` lists every unvalidated read in the tree,
 * which an incidental `adminDb().collection(…)` never did.
 */
import ts from 'typescript'

import type { StructureProgram } from '../program.ts'
import type { Check, Violation } from '../types.ts'
import { forEachNode } from '../ast.ts'

/** The accessor layer that ATTACHES the converter — the one legitimate caller. */
const CONVERTER_MODULE = 'lib/firebase/collections.ts'

/** The Admin handle a raw reference would be minted from. */
const ADMIN_HANDLE = 'adminDb'

/** Members that mint a reference, and so must go through `typedCollection`. */
const REFERENCE_MINTING = new Set(['collection', 'doc', 'collectionGroup'])

/** Whether `node` is a direct `adminDb()` call. */
function isAdminHandleCall(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === ADMIN_HANDLE
  )
}

/** Locals bound to an `adminDb()` call: `const db = adminDb()`. */
function adminHandleAliases(sf: ts.SourceFile): Set<string> {
  const aliases = new Set<string>()
  forEachNode(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return
    if (!ts.isIdentifier(node.name) || !node.initializer) return
    if (isAdminHandleCall(node.initializer)) aliases.add(node.name.text)
  })
  return aliases
}

export const check: Check = {
  id: 'converter-bypass',
  describe:
    'no reference is minted off the raw Admin handle — collection/doc/collectionGroup go through typedCollection',
  run(program: StructureProgram) {
    const violations: Violation[] = []

    for (const sf of program.sourceFiles()) {
      const rel = program.rel(sf.fileName)
      if (rel === CONVERTER_MODULE) continue

      const aliases = adminHandleAliases(sf)

      forEachNode(sf, (node) => {
        if (!ts.isCallExpression(node)) return
        const callee = node.expression
        if (!ts.isPropertyAccessExpression(callee)) return
        if (!REFERENCE_MINTING.has(callee.name.text)) return

        const receiver = callee.expression
        const fromHandle =
          isAdminHandleCall(receiver) ||
          (ts.isIdentifier(receiver) && aliases.has(receiver.text))
        if (!fromHandle) return

        violations.push({
          file: rel,
          contract: 'converter-bypass',
          detail:
            `mints a reference with .${callee.name.text}() off the raw ${ADMIN_HANDLE}() handle, ` +
            'so reads are never validated — use typedCollection/typedCollectionGroup ' +
            `from ${CONVERTER_MODULE} (adminDb().runTransaction is fine)`,
        })
      })
    }

    return violations
  },
}
