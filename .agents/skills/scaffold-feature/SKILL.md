---
name: scaffold-feature
description: Use when adding a new Firestore-backed entity/feature to this repo — a list+form vertical like invoices. Copies the features/_template files and names the wiring nothing else enforces (feature-owned collection path, the RBAC capability, the composite index). NOT for editing an existing feature or a one-off query.
---

# Scaffold a feature from the template

`features/_template/` is the copy-me starter for one entity wired through
`schema → repo → action → form`. Each template file's header self-documents the tokens and the
per-file wiring; this skill is the order and the cross-file wiring that nothing else enforces.

## Steps

1. **Copy the template files.** Nine land in `features/<entity>/<entity>.<part>.ts` — `path`,
   `capability`, `schema`, `repo`, `collection`, `action` always, plus `form-opts`, `form` and
   `search-params` if the entity has a form. The three route templates land under `app/`
   instead: `page` → `app/(app)/<entities>/page.tsx`, `new-page` → `.../new/page.tsx`,
   `edit-page` → `.../[id]/edit/page.tsx`. Those route files import siblings relatively
   (`./__entity__.schema`) because the generated check compiles them side by side; once they
   sit under `app/` none of those imports resolve, so repoint every one at
   `@/features/<entity>/…`. Each file's header says so.
   Then describe the new `features/<entity>/` in `LAYOUT_NOTES`
   (`scripts/docs/generate-reference.ts`) and run `pnpm docs:generate`: until you do,
   `pnpm docs:check` fails `generated-drift` on `docs/reference/project-layout.md`. Routes
   under `app/(app)/` need no entry — only one level below each top-level directory is
   described, and `app/(app)` already has one.
2. **Find-replace the six tokens**, each its own case-sensitive pass. Miss one and it does not
   break: an unresolved token is a valid identifier, so `list__Entities__` compiles and ships.
   `pnpm templates:check` refuses one in the TEMPLATES; nothing checks your copy.
   - `__Entity__` → PascalCase singular (`Invoice`)
   - `__Entities__` → PascalCase plural (`Invoices`) — identifiers naming a set (`listInvoices`)
   - `__entity__` → camelCase singular (`invoice`)
   - `__entities__` → camelCase plural (`invoices`) — collection key + path
   - `__ENTITY__` → SCREAMING singular (`INVOICE`)
   - `__ENTITIES__` → SCREAMING plural (`INVOICES`) — collection-path const
3. **Own the collection path** — set `__ENTITIES___COLLECTION` in the copied
   `<entity>.path.ts`, then bind it in `<entity>.collection.ts`. This keeps shared Firebase
   generic and the feature deletable.
4. **Declare the capability** — the copied `<entity>.capability.ts` does NOT compile until you
   add its two names to `CAPABILITIES` in `lib/auth/rbac.ts` and grant them per role in
   `ROLE_CAPABILITIES`. That refusal is the design: the template cannot ship a working default
   here without shipping the reference feature's authority, so it fails instead. Every gate and
   both action wrappers read the consts, so this is the only place to change in `lib/auth/rbac.ts`
   — but also add the two names to `EXPECTED_GRANTS` in `lib/auth/rbac.test.ts`, the grant matrix
   restated by hand on purpose so the test cannot agree with the implementation by construction.
   `pnpm test:unit` fails until you state who gets them.
5. **Reshape the fields** in the schema for your entity, then delete each template header.
6. **The composite index — the step nothing catches until something runs the query.** If you
   keep the status-filtered list, declare `status` ASCENDING + `createdAt` DESCENDING for your
   collection in `firestore.indexes.json` — the exact shape that query issues, and the `widgets`
   block there is it, generated and driven. Without it the query 500s in production with
   `FAILED_PRECONDITION` while the emulator serves it happily. Paging backwards reuses the same
   index; a sort TOGGLE is what needs the mirrored one. `pnpm indexes:check` can only see query
   shapes something actually ran, so drive your list before trusting it.
7. **Scaffold the test layer — feature-owned, but it lives under `test/`.** Create
   `test/builders/<entity>.ts` (a typed `<Entity>Create` builder) and
   `test/integration/<entity>-repo.test.ts` (modeled on
   `test/integration/template-widget.test.ts`, which drives the template-generated repo). They do NOT go in the feature folder: the
   [testing contract](../../../docs/reference/contracts/testing.md) organizes test code by
   runtime dependency — unit tests colocate, integration tests live in `test/` because they
   need the emulator — and it groups builders into one `test/builders/` toolkit beside
   `signedInAs`. They are still tentacles of your feature, so they are on its
   [removal checklist](../../../docs/reference/contracts/data.md#removal-checklist-deleting-an-entity);
   a feature scaffolded without them is both less tested and misremembered as more deletable
   than it is.

## Verify

`pnpm templates:check` (copies the templates and typechecks them — a broken template fails here),
then the full **`verify`** chain, then **drive** the new list + form against the emulator in a
browser. If you kept a filtered list, exercise it and run `pnpm indexes:check`.

## Common mistakes

- **A pass-through repo wrapper.** The repo is a thin typed accessor — only `cache()`'d reads,
  pagination, and transactions. One-off reads go direct off `<entity>Collection()` at the call site.
- **Re-authoring what the core already owns.** The template calls `stampCreated`/`stampUpdated`
  (`lib/data/stamps.ts`) for the server-owned id and timestamps, `requireFound` for the
  not-found throw, `toFormErrors` for the validator body, `useServerForm`
  (`hooks/use-server-form.ts`) for the action binding and server-answer merge, and
  `formErrorText` for the form-wide message. Keep those calls: hand-writing
  `{ ...input, id, createdAt: now }` or `if (!current) throw new NotFoundError(...)` forks a
  rule that is meant to have one owner. Your transaction, your query, your precondition and
  your side effects stay in your file — the helpers deliberately do not own them.
- **Reading `formState.errors` directly.** form-core types it `never[]` while it holds values
  at runtime, so `String(errors[0])` typechecks and renders a literal "undefined" alert beside
  the real error. That shipped once. Call `formErrorText`, which takes the array without a cast.
- **One operation exposed through both a `FormAction` and an `Action`.** One entry per operation:
  form-kind for form-triggered, programmatic-kind for imperative.
- **Skipping the composite index because it worked locally.** The emulator doesn't enforce it;
  production does.

## Done means

The vertical is wired end to end, its `test/builders/<entity>.ts` and
`test/integration/<entity>-repo.test.ts` exist, `pnpm templates:check` + the verify chain pass,
the composite index (if any filtered list) is registered, and you drove the list + form in a
browser.
