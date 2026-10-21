# Brief: Feature-Scaffold Parity

For the PostgreSQL lead. This repository does not edit that workspace; paths below are
destinations for that repository's own commits.

Status: `OPEN — gap confirmed by static read of both trees`. Effort: L. Severity: parity, with
one authority defect inside it.

## The Gap

The fork's template is this repository's pre-improvement template, ported to Drizzle. It has 5
template files — schema, table, repo, action, form-opts. This repository now has 12.

Missing there:

- The entire **delivery surface**: form, list page, new page, edit page, and the URL contract
  file. A scaffold there still stops at the action layer, so the forker hand-writes the list,
  new and edit routes, the URL contract, and the return-path handling with its open-redirect
  concern.
- The **capability seam**. The fork's template action still hardcodes the reference feature's
  `'asset:write'` at three call sites. That is the silent-authority-inheritance defect this
  repository fixed by making a copied entity's capability a compile error: today, a feature
  copied there quietly runs on the asset feature's authority and nothing says so.

Its `check-templates.ts` is the older self-contained script — it discovers, substitutes and
typechecks, but has none of the four gates added here: refusing an unresolved token, refusing an
already-declared capability, asserting the expected capability failure _and nothing else_, and
running the architecture contracts over the generated tree. There is no generator script and no
driven integration test, so the fork's template is proven to compile and never proven to run.

Two prerequisites are also absent there: the form-error helpers, and the server-action form
bridge (see `pg-form-bridge.md`).

## What Is Firestore-Specific And Must Not Be Ported

The collection and path template files, the composite-index step, the deadline wrapper, the
document-name sentinel set, the migration template root, and this repository's transaction-per-write
repo shape.

Also the list page's **call-site count**. That exists here for a Firestore billing reason, and the
fork's rule is the opposite — all SQL lives in the repo. Copying it would typecheck and would be
actively wrong advice in that codebase.

## Order Of Work

1. **Prerequisites**, because the new templates import them. Add the form-error helpers to
   `lib/data/form-validation.ts` — the existing issue classifier stays; what is missing is the
   safe-parse-result wrapper around it. Port the form bridge hook and its test verbatim; it is
   framework-level, not persistence-level.
2. **The capability file**, verbatim — the type annotation is the whole mechanism. Then rewrite the
   template action to import the generated capability constant instead of the three literals, and
   to use the new error helper in its server-side validation.
3. **The URL contract file**, with two edits: drop the Firestore billing sentence about page size
   (the closed-literal-set rule still holds), and change the list-path comment to contrast with the
   table name rather than the collection constant.
4. **The form template**, verbatim. Every import resolves in the fork already.
5. **The new and edit page templates**, verbatim except the guard comments. This repository
   justifies them by the Admin SDK bypassing Firestore rules; the fork's reason is its own — the
   repo runs as the application's database role and enforces nothing, so the guard is the only lock.
6. **The list page template** — the one file needing real adaptation, not a copy. Delete the
   call-site count and its whole billing and composite-index rationale, and call the repo's count
   instead. Take the pagination flags from the fork's keyset page type rather than this
   repository's page type. Keep the link-row filter, the status label and variant maps, the
   three-way empty state and the count label — all persistence-neutral. Decide explicitly whether
   to expose the last-page cursor the fork's keyset page offers; the minimum is to leave it out and
   say so.
7. **Split the generator out** of `check-templates.ts`, keeping the fork's orphan-import rewriting,
   dropping the migration template root and its tokens. Then rewrite the checker on this
   repository's shape: unresolved-token gate, declared-capability gate, capture the typecheck output
   and assert the only errors are the generated capability literals, then run the structure
   contracts. The contract list becomes the three the fork has — do not name the two Firestore ones,
   since an unregistered id is meant to throw and would.
8. **Add the driven integration test**, adapted. It must create the generated table in the test
   database — from the generated DDL or by applying it — before driving create, read, update,
   not-found, paging both ways, filtering and delete. Do not copy this repository's emulator harness.
9. **Update the docs**: the add-feature how-to's copy-set line, the data contract's numbered copy
   order, and the scaffold skill, so all three name the capability step and the three route
   destinations.

## Risks

- **The checker inverts** from "must compile" to "must fail in exactly one place". If the fork's
  capability union or rbac layout differs from this repository's, the gate either never fires or
  fires everywhere. Verify against the fork's rbac module before wiring it.
- **The driven test needs a real table.** Unlike a schemaless emulator write, there is no way to
  skip this, and the test must own creating and dropping it or it will pollute the migration history.
- **The list page is the file most likely to be copied verbatim by mistake**, and the mistake
  typechecks. See above.
- Lower risk: the capability template makes the template directory a compile-error-by-design
  location, which is safe only because the template glob is excluded from the typecheck program.
  Confirm the fork's exclusion still covers a `.tsx` template.

## Checkable Finish

`pnpm templates:check` generates 11 files, prints the generated list, and fails only on drift. On a
clean run it reports that the generated entity's two capabilities are undeclared — exactly as a
fresh copy should — having found zero unresolved tokens, zero already-declared capabilities, zero
typecheck errors outside the generated capability file, and zero violations of the three
architecture contracts it names.

`pnpm test:integration` runs the generated-entity test against a real database and shows create →
read-back → update → not-found → a forward page, a backward page and a filtered page with the
expected ids → delete → null.

Then hand-copy the template into a real feature plus its three routes, declare the two capabilities,
generate the migration and **read the SQL**, apply it, and drive it in a browser:

- the list renders, the status link-row filters, and the URL changes
- next and previous page both work and preserve the filter
- create saves and returns to the page the reader left, with the return path round-tripping
- edit on a row returns to that same page
- a protocol-relative return path falls back to the list instead of leaving the origin

Report what the browser did, not that the gates were green.

## Files (in the fork)

- `features/_template/` — new: capability, search-params, form, page, new-page, edit-page; edited: action
- `lib/data/form-validation.ts`
- `hooks/use-server-form.ts`, `hooks/use-server-form.test.tsx`
- `scripts/template-generate.ts` (new), `scripts/check-templates.ts`
- `test/integration/template-widget.test.ts` (new)
- `docs/how-to/add-feature.md`, `docs/reference/contracts/data.md`, `.agents/skills/scaffold-feature/SKILL.md`

## Sequencing

Ordered after anything that changes the action or form seam — the form bridge and the form-error
helpers are prerequisites of the form and route templates. If `pg-form-bridge.md` is taken
separately, this brief consumes it rather than duplicating it. Independent of the Better Auth
slices.
