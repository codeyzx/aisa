# Add a Firestore-backed feature

A feature here is one entity wired through `schema → repo → action → form`, living in a
single folder: `features/<entity>/`. Everything it needs is in that folder, which is
what makes it deletable later.

## Scaffold it

`features/_template/` is the copy-me starter, and each template file's header documents
its own tokens and wiring. **The `scaffold-feature` skill owns the procedure** — which
files to copy, the six case-sensitive token passes, and the cross-file wiring the copy
cannot do for itself. Run it rather than reading the templates cold.

The three pieces of that wiring, so you recognise them in the skill — and only the
middle one tells you when you got it wrong:

- **The feature owns its collection path.** The path constant lives in
  `<entity>.path.ts` and is bound in `<entity>.collection.ts`. Shared Firebase code
  stays generic, so the feature FOLDER trashes without touching shared plumbing (the
  whole vertical spreads wider than the folder — see "When you delete it again").
- **The capability, which is not optional.** The copied `<entity>.capability.ts` names
  the entity's own read and write capabilities, and `Capability` is a closed union built
  from `CAPABILITIES` in `lib/auth/rbac.ts` — so the copy does not compile until both
  names are added there and granted per role in `ROLE_CAPABILITIES`. Refusing to compile
  is the design: a template that shipped a working default here would ship the reference
  feature's authority, gating your rows on somebody else's permission with every check
  still green. The action wrappers re-check the capability server-side; UI gating is
  never the boundary.
- **The composite index.** If you keep a filtered list, register its index in
  `firestore.indexes.json` — what the query costs and why nothing local catches a missing
  one is in the [`data` contract](../reference/contracts/data.md).

The rules the scaffold obeys live in the [`data` contract](../reference/contracts/data.md).
Read it before you reshape the schema — it owns the whole `schema → repo → action` path
and the search scheme.

## Decisions already made for you

- **One surface per URL.** Create and edit are ordinary full pages, and
  `pnpm structure:check` enforces it — see
  [module boundaries](../reference/contracts/module-boundaries.md). A dialog over state
  already on screen is fine; open it from client state, not from a route.

One more, because it is an open-redirect vector: the reader's current list URL travels
to the create/edit page as a `?returnTo` query parameter. The page validates it with
`safeInternalPath` (`lib/safe-path.ts`), and a value that is not an internal path falls
back to the list. The template's form actions redirect to the list root on success; they
do not read the posted `returnTo`.

## Verify

```bash
pnpm templates:check   # copies the templates and typechecks them
pnpm verify            # the full green chain
```

Then **drive it**: exercise the new list and form against the emulator in a browser,
signed in as the seeded `manager@aisa.test` (admin) and `viewer@aisa.test` (user,
read-only) — password `password123`, printed by `pnpm seed` — so both sides of the
capability check are reachable in the browser. If you kept a filtered list, exercise
that query and run `pnpm indexes:check` — nothing else catches a missing composite
index. Full steps: [verify a change](verify-change.md).

## When you delete it again

Removing an entity follows the checklist in the
[`data` contract](../reference/contracts/data.md#removal-checklist-deleting-an-entity).
It is **not** a one-`trash` job: the checklist walks every layer a wired entity
touches — the feature folder, its route(s), its
`test/builders/<entity>.ts` + `test/integration/<entity>-repo.test.ts` and e2e specs,
its seed rows, and its nav + capability + index wiring. The general workflow is
[remove a capability](remove-capability.md).

## Common mistakes

- **A pass-through repo wrapper.** The repo is a thin typed accessor — cached reads,
  pagination, transactions. A one-off read goes directly off the collection accessor at
  the call site.
- **One operation exposed twice**, as both a form action and a programmatic action. One
  entry per operation.
- **Skipping the composite index because it worked locally.** Run `pnpm indexes:check`
  against an emulator you drove.
