---
name: migrate-database
description: Use when replacing this starter's persistence layer with a different database (PostgreSQL, MySQL, SQLite) while keeping auth, the action contract, and every boundary intact. Names what may change, what must not, and how to prove the swap is real rather than compiling.
---

# Replace the database without replacing the app

This starter is Firestore-backed, but the database is a **seam**, not a foundation. This
skill is the procedure for swapping it. It exists because the naive approach — find every
`firebase-admin` import and rewrite it — silently changes behaviour that nothing tests, and
the result compiles.

## What must NOT change

These are the contracts a fork inherits. Breaking one turns a database swap into a rewrite:

1. **The action contract.** `ActionResult<T>` and the `runAction`/`runFormAction` wrappers
   are database-neutral already. Every mutation still returns the same envelope, still
   carries a correlation id on an internal failure, and still never leaks a driver error to
   a user. See `docs/reference/contracts/data.md`.
2. **Auth.** The Firebase sign-in, the session cookie, the server-authoritative DAL
   and the guard chain store nothing in the database — swapping it must not touch them. See
   `docs/reference/contracts/auth.md`.
3. **Module boundaries.** The import-direction rules are machine-enforced by
   `pnpm structure:check`. A repo layer must not import a feature; a feature must not import
   `app/`. Those checks must still pass, unchanged, afterwards.
4. **The one-entry-per-operation rule.** An operation is exposed through a form action or a
   programmatic action, never both.
5. **The pure data helpers.** `lib/data/stamps.ts` (`stampCreated`/`stampUpdated`),
   `requireFound` in `lib/data/domain-error.ts`, and `toFormErrors` in
   `lib/data/form-validation.ts` import nothing and touch no driver — they decide what the
   SERVER owns on a write, that a missing row is `not_found`, and how a parse failure becomes
   form errors. A fork keeps them as-is. In particular do NOT "port" `stampUpdated` to a
   partial/merge UPDATE: its plain spread is what lets a present-but-undefined key CLEAR a
   field, and a merge-semantics rewrite turns every field-clearing edit into a silent no-op.

## What SHOULD change

- `lib/firebase/*` — the Admin app and the typed-collection helper.
- The repo layer of each feature (`features/*/**.repo.ts`).
- For AISA data, the Python `aisa-api` too: the dashboard only reads AISA collections, and
  every AISA write is made by that service, so moving the data moves its writer.
- Pagination. `lib/data/pagination.contract.ts` is already database-neutral; the Firestore
  cursor implementation behind it is not, and that is the intended replacement point.
- `firestore.rules` and `firestore.indexes.json` disappear. **Their guarantees do not.**
  Read the next section before deleting them.

## The two things forks get wrong

**1. Rules were doing authorization work.** `firestore.rules` is a real access-control layer,
enforced by the database. Today it is deny-all — no client may read or write directly — and
the replacement must keep the same property: the new database reachable only from the
server. If a fork has added carve-outs, enumerate each and re-implement it in the query
layer, then prove it with a test that FAILS without the check.

**2. Composite indexes were hiding a performance contract.** `pnpm indexes:check` exists
because a `.where(A) + .orderBy(B)` query needs a declared composite index that the emulator
does not enforce. A SQL database will happily run the same query with a sequential scan — it
will be CORRECT and it will be slow, and nothing will tell you. Port each declared index in
`firestore.indexes.json` to a real SQL index in the same change.

## Instructions

1. **Inventory before editing.** List every file that imports the Admin SDK, every declared
   composite index, and every rule in `firestore.rules`. That list is the scope; anything
   outside it is not part of this migration.
2. **Replace behind the existing contracts**, one feature at a time. Keep
   `schema → repo → action` — only the repo body changes.
3. **Port the indexes and the rules** as described above, in the same change as the query
   they protect.
4. **Prove data equivalence, not compilation.** Export a snapshot from the old database
   (`pnpm snapshot:export`), import it into the new one, then compare **row counts and a
   sample of full documents by id** in both directions. A migration that loses a field
   typechecks perfectly.
5. **Dry-run first.** `scripts/migration/run.ts` plans by default and only writes under
   `--apply`, behind a typed project-id confirmation on the controlling terminal. Keep that
   shape for any migration you add; see `scripts/_safety.ts`.
6. **Re-run the whole gate, then drive it.** `pnpm verify` plus the driven steps in
   `docs/how-to/verify-change.md`. Sign in, list, create, edit, and paginate past the first
   page in a browser — pagination is where a cursor port breaks, and no static check sees it.

## Fork-tag expectations

If you are forking from a tagged base, say which tag in your first commit, and keep the tag's
verification evidence reachable. The point of a verified fork base is that the fork can state
what was true at the point it diverged — a fork that cannot name its base has inherited
claims it cannot support.

## Done means

The app behaves identically through the UI, `pnpm structure:check` and `pnpm verify` are
green, every ported index and rule has a test that fails without it, and you have compared
real data both ways — not just watched it compile.
