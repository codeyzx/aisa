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

## Read the worked example while you do it

`features/asset/` is the one entity deliberately wired through **every** seam at once,
so a reader can see that the capabilities actually compose rather than sitting on a
shelf. It is generic on purpose: a real app renames it and keeps the wiring. When you
need to see how a strand is done, this is where to look:

- **Data path** — `asset.schema.ts` → the converter that hydrates every read →
  `asset.path.ts` / `asset.collection.ts` → `asset.repo.ts` (transactional create,
  update and delete; the bulk delete commits as ONE atomic batch and refuses more ids
  than Firestore's per-batch cap rather than splitting them across commits). Adding a
  field touches only the schema: the converter builds
  from it and the repo writes the whole input, so neither needs an edit.
- **RBAC** — the capability check is the first line of the page, and every mutation runs
  through the action wrappers, which re-check it server-side.
- **Form** — TanStack Form with the Next server-action integration, shared options in
  `asset.form-opts.ts`. It POSTs `FormData` and submits without JavaScript.
- **Table and pagination** — a server-owned data table with cursor pagination that goes
  both directions. The interactive table view is a client island; the page itself stays
  a Server Component.
- **Search** — a server-owned normalised word-prefix match on a derived field.
- **Audit** — every mutation writes an audit line, including the failure paths.
- **Storage** — the attachment: presigned upload in, presigned download out.
- **Export** — a row action that hands the reader a PDF through the export seam.

Nothing in that list is new capability. The reference feature only **wires** what
already exists. If you find yourself writing a capability instead of calling one, stop —
you are about to fork a path that already has an owner.

## Four decisions the example already made for you

These are the ones a new feature gets wrong most often, and each one cost something to
learn:

- **Persist the upload key the moment it resolves.** Bytes go browser → object storage
  through a presigned PUT, and the resulting key is carried into the form and written
  onto the document. An upload whose key is never written down is an orphan billing you
  forever. Reuse the upload **hook**, not the storage demo component — importing the
  demo would break one-shot deletion of the examples.
- **Read a file by document id, never by a key from the client.** The action reads the
  stored key **off the document** and signs that. The gate on the record _is_ the gate
  on its attachment. Inheriting an authorization policy along with a helper function is
  the subtle version of this mistake: reuse the storage library, decline the demo's
  ownership check. Return the SAME opaque `not found` whether the record is missing or
  simply has no attachment — the failure must not confirm which ids exist.
- **Clean up on all three paths** — single delete, bulk delete, and replace-on-edit —
  as one rule, never a half where single cleans up and bulk does not. Delete the
  document first and the object second: a document pointing at a missing object is
  broken UI on every render, while a stranded object is a billing line. And the object
  delete must never fail the action — the document is already gone, so it records an
  audit line naming the stranded key and reports success.
- **One surface per URL.** Create and edit are ordinary full pages, and
  `pnpm structure:check` enforces it — see
  [module boundaries](../reference/contracts/module-boundaries.md). A dialog over state
  already on screen is fine; open it from client state, not from a route.

One more, because it is an open-redirect vector: the reader's current list URL travels
as a `returnTo` query parameter so a submit lands them back on the exact page, filter,
and sort they left. It is validated on the page **and** re-checked in the action; a
value that is not an internal path falls back to the list.

## Adding an attachment: reuse the lifecycle, don't re-derive it

The three decisions above (promote before write, clean up on all paths, never fail a
completed mutation) are already implemented **once**, generically, in
`lib/storage/attachment-lifecycle.ts`. It has no asset-specific logic, so a new entity
reuses it rather than copying asset's — the only thing you pass in is the audit tag your
orphans are recorded under:

```ts
import {
  promoteAttachment,
  reapAttachment,
  reapPromotionOnFailedWrite,
  requireFreshStagingAttachment,
  requireValidAttachmentUpdate,
} from '@/lib/storage/attachment-lifecycle'

// One per feature — its orphans are attributed to itself.
const INVOICE_ATTACHMENT_ORPHAN = 'invoice.attachment.orphan'
```

The base `_template` deliberately ships **without** an attachment so a feature that has no
upload stays clean. When yours does, `features/asset/` is the worked example — copy the
wiring at each layer it touches:

- **Schema** (`asset.schema.ts`) — an optional `attachmentKey` field, picked into the
  create schema.
- **Form** (`asset.form-opts.ts`) — the field defaults to `''` and is projected on edit;
  the action maps `'' → undefined` so an empty string never lands on the document.
- **Repo** (`asset.repo.ts`) — create writes the promoted key; update returns
  `previousAttachmentKey` **from inside the transaction**; delete (single and bulk)
  returns the key(s) to reap. Reading the prior key off the transaction — not a separate
  pre-read — is what keeps a concurrent edit from double-reaping.
- **Action** (`asset.action.ts`) — the five lifecycle calls threaded with your tag:
  `requireFreshStagingAttachment` / `requireValidAttachmentUpdate` before the write,
  `promoteAttachment` before it, `reapPromotionOnFailedWrite` in the `catch`, and
  `reapAttachment` on replace-on-edit and on both delete paths. Download is a separate
  programmatic action that signs the key read **off the document** (`presignDownload`) —
  never a key from the client.

Reuse the upload **hook** (`hooks/use-upload.ts`), not the storage demo's component or its
ownership policy — the [storage contract](../reference/contracts/storage.md) owns why.

## Verify

```bash
pnpm templates:check   # copies the templates and typechecks them
pnpm verify            # the full green chain
```

Then **drive it**: exercise the new list and form against the emulator in a browser as
each role that should and should not reach it. If you kept a filtered list, exercise
that query and run `pnpm indexes:check` — nothing else catches a missing composite
index. Full steps: [verify a change](verify-change.md).

## When you delete it again

Removing an entity follows the checklist in the
[`data` contract](../reference/contracts/data.md#removal-checklist-deleting-an-entity).
It is **not** a one-`trash` job: the checklist walks all five layers a wired entity
touches — the feature folder, its route(s) and any export routes, its
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
