/**
 * Small AST helpers shared by the call-site checks. These walk the real syntax
 * tree (never a regex) but need no type-checker — they read structure only.
 */
import ts from 'typescript'

/** Depth-first visit of every node under `root`. */
export function forEachNode(
  root: ts.Node,
  visit: (node: ts.Node) => void,
): void {
  const recurse = (node: ts.Node): void => {
    visit(node)
    node.forEachChild(recurse)
  }
  recurse(root)
}

/** The callee identifier name of a call, if it is a bare `name(...)`. */
export function calleeName(node: ts.CallExpression): string | undefined {
  return ts.isIdentifier(node.expression) ? node.expression.text : undefined
}

/** Every string-literal argument of a call, in order. */
export function stringArgs(node: ts.CallExpression): string[] {
  return node.arguments
    .filter((arg): arg is ts.StringLiteralLike => ts.isStringLiteralLike(arg))
    .map((arg) => arg.text)
}

/** Names of exported top-level function declarations in a source file. */
export function exportedFunctionDeclarations(
  sf: ts.SourceFile,
): ts.FunctionDeclaration[] {
  return sf.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      !!statement.name &&
      !!ts.getCombinedModifierFlags(statement) &&
      (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0,
  )
}

/**
 * An exported top-level action definition and the node its body lives in — the
 * unit the action-wrapper check searches for a `runAction`/`runFormAction` call.
 * `body` is a block or a concise-arrow expression, or `undefined` for a
 * declaration with no body.
 */
export interface ExportedAction {
  name: string
  body: ts.Node | undefined
}

function isExported(node: ts.Declaration): boolean {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0
}

/**
 * Every exported top-level action in a source file, across BOTH the shapes a
 * `'use server'` file can present a browser-reachable action as:
 *
 *  - `export [async] function NAME(...) { ... }` — a function declaration;
 *  - `export const NAME = [async] (...) => ...` / `= [async] function () { ... }`
 *    — a const bound to an arrow or function expression.
 *
 * `exportedFunctionDeclarations` sees only the first; the second is an equally
 * valid, equally callable server action, so an unwrapped one would skip the
 * capability gate while every static check stayed green. Non-function exports
 * (`export const X = someCall()`, `export const N = 1`) are deliberately NOT
 * returned — only arrow / function-expression initializers are action-shaped.
 */
export function exportedActions(sf: ts.SourceFile): ExportedAction[] {
  const out: ExportedAction[] = []
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (isExported(statement)) {
        out.push({ name: statement.name.text, body: statement.body })
      }
      continue
    }

    if (ts.isVariableStatement(statement)) {
      // Export lives on the statement, but `getCombinedModifierFlags` reads it up
      // from the VariableDeclaration (a Declaration) — the standard pattern.
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        if (!isExported(declaration)) continue
        const init = declaration.initializer
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          out.push({ name: declaration.name.text, body: init.body })
        }
      }
    }
  }
  return out
}

/** Whether any call to one of `callees` occurs anywhere inside `root`. */
export function callsAnyOf(root: ts.Node, callees: Set<string>): boolean {
  let found = false
  forEachNode(root, (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      if (name && callees.has(name)) found = true
    }
  })
  return found
}

/** String-literal values assigned to a property named `key` anywhere in `sf`. */
export function propertyStringValues(sf: ts.SourceFile, key: string): string[] {
  const out: string[] = []
  forEachNode(sf, (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === key) ||
        (ts.isStringLiteralLike(node.name) && node.name.text === key)) &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      out.push(node.initializer.text)
    }
  })
  return out
}

/** String literals inside an exported `const NAME = [...] as const` array. */
export function exportedStringArray(
  sf: ts.SourceFile,
  name: string,
): string[] | undefined {
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        let init: ts.Node = declaration.initializer
        if (ts.isAsExpression(init)) init = init.expression
        if (ts.isArrayLiteralExpression(init)) {
          return init.elements
            .filter((element): element is ts.StringLiteralLike =>
              ts.isStringLiteralLike(element),
            )
            .map((element) => element.text)
        }
      }
    }
  }
  return undefined
}
