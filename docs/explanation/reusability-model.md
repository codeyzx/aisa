# The reusability model: the standard path owns the mechanics once

Adding a normal entity to this starter should be almost all _domain_ work — the shape of the
thing, how it reads, who may touch it — and almost no _plumbing_ work. The plumbing that every
list-and-form entity repeats (envelope, cursor, table, delete handling) should be owned once by
the shared core, so a consumer writes what is unique to their entity and inherits the rest.

The failure mode this model exists to prevent is the opposite of missing abstraction. It is the
`BaseCrud` with thirty flags: a core so eager to own everything that an entity with one unusual
requirement has to fight it. So the rule has two halves, and the second is load-bearing:

> **The standard entity path owns the repeated mechanics once. An unusual entity replaces a
> repo, an action, a form, a page, or a policy — explicitly — without fighting the core.**

The escape hatch is _replacement_, not configuration. A feature that needs a different query
policy writes its own query; it does not pass `sortable: false` to a mega-helper. The core earns
its place only for the mechanics that are genuinely identical across entities, and it stays out
of the way for everything else.

## Three owners

Every line a feature touches belongs to exactly one of three owners.

**The shared core (`lib/`) owns the domain-agnostic mechanics.** These never mention an entity
and are reused verbatim:

- The action envelope — `runAction` / `runFormAction`, the closed `ACTION_ERROR_CODES` +
  `ACTION_ERROR_MESSAGE`, the `DomainError` hierarchy, correlation-id minting, and the `audit`
  logger (`lib/data/action-result.ts`, `action.contract.ts`, `form-action.ts`, `domain-error.ts`,
  `audit.ts`). The wrapper shape and the one-entry-per-operation rule are **machine-enforced** by
  `action-wrapper-shape` and `single-operation-entry` in `scripts/structure/`.
- The typed accessor and converter — `typedCollection` / `typedCollectionGroup` / `rawCollection`
  and `zodConverter` (`lib/firebase/collections.ts`, `lib/data/converter.ts`).
- Write-safety primitives — `withDeadline`, `FIRESTORE_BATCH_LIMIT`, `nextCode` /
  `formatCode`, `toSearchPrefixes` / `toSearchTerm`, `TimestampSchema`.
- The cursor codec and its Firestore adapter — `encodeCursor` / `decodeCursor` + `paginate`
  (`lib/data/pagination.contract.ts`, `pagination.firestore.ts`). All serialization is generic;
  a feature supplies only the ordered-set identity (its sort and its `scope` string).
- The list engine — the URL-backed toolbar state machine and its React binding
  (`lib/list-toolbar/**`), the server-rendered `DataTable` family (`components/ui/data-table.tsx`),
  and the pure selection-set logic (`components/ui/data-table-selection.ts`).
- The server half of the form bridge — `runFormAction`, `classifyFormValidationIssues`, and
  `toFormErrors` (the parse-result → form-errors protocol every entity's validator repeated),
  plus `formErrorText`, which reads the form-wide message back out of the merged client form.
- The client half of the form bridge — `useServerForm` (`hooks/use-server-form.ts`): it binds a
  form server action and merges a rejection back into the form. It renders nothing and does NOT
  wrap `useForm`, so a form keeps its own options, its own generic inference, and its own
  markup; a form wanting a different merge policy passes its own `transform` instead.
- The server-owned write fields — `stampCreated` / `stampUpdated` (`lib/data/stamps.ts`) and
  the `requireFound` not-found throw (`lib/data/domain-error.ts`). Pure: they decide what the
  server owns, never when or where it is written, so the feature keeps its transaction.

**The standard entity (`features/<entity>/` + its route) owns only its domain.** A consumer adding
a normal entity should provide:

- The entity schema and the create/update input projection (`<entity>.schema.ts`).
- Field presentation and table columns — labels, status→badge variants, column specs.
- Query / filter / sort policy _when it differs from the default_.
- Authorization policy _when a single capability is insufficient_.
- Domain transactions and side effects.
- Application composition — a navigation entry, an export route, an AI tool.

**Opt-in domain extensions are feature-owned and off by default.** The standard baseline is CRUD
plus status filtering and cursor pagination. Everything below is argued per entity, never assumed:
a human `code` counter, server-owned `searchPrefixes` search, the attachment lifecycle, export
(CSV/XLSX/PDF), a bulk-delete cap, optimistic-conflict handling, and realtime. `features/asset/**`
lights up all of them precisely so the reference feature exercises the hard paths; a plain entity
lights up none.

## The standard baseline, and what is opt-in

- **Baseline (every entity gets it):** create, read, update, delete; a status filter; cursor
  pagination in both directions.
- **Opt-in (argued per entity):** search, bulk operations, storage/attachments, export, realtime.

An opt-in extension that an entity does not use costs it nothing — deleting the capability's
directory removes its config with no dangling reference (see
[the capability model](capability-model.md)). The reference entity is the exception, not the
template: do not carry asset's counter, search, or attachment wiring into an entity that has no
use for them.

## Where the code is today

This model is the target the [reusability-hardening train](../handoffs/2026.07.22-0050-reusability-hardening/README.md)
delivers, not a description of a finished state. The core mechanics above are real and shared
today. What a standard entity **still copies** — the extraction gap that train closes — is listed
below. Part of it is closed; each bullet says what now has one owner and what does not,
because a list that overstates the gap is as misleading as one that understates it.

- **The repo CRUD surface, and it is SMALLER than it looks.** Measured against source rather
  than assumed: `count` and `deleteMany` exist only in `features/asset/asset.repo.ts` — the
  template has neither, so they are asset behaviour, not a copied mechanic. `delete` is copied
  in NAME only; asset reads `attachmentKey` in the deleting transaction through
  `rawCollection`, the template does a converted fire-and-forget, and the two share nothing.
  What genuinely repeated was the cached read, the server-owned id/timestamp stamp, and the
  not-found throw. The last two now have one owner — `stampCreated`/`stampUpdated`
  (`lib/data/stamps.ts`) and `requireFound` (`lib/data/domain-error.ts`) — and both features
  call them. Still copied: the two-line cached read, and the query/filter chain, which stays
  per entity on purpose (query power is never hidden).
- **The action projection.** `toXInput` is a per-entity field mapping — domain, not mechanics,
  and it stays. The validator BODY no longer is: `toFormErrors`
  (`lib/data/form-validation.ts`) owns the success/failure protocol every
  `createServerValidate` repeated verbatim, while the schema and the projection stay at the
  call site so what is validated remains the feature's business.
- **The client form bridge — measured, and it was never copied.** This entry used to claim the
  `useActionState` + `mergeForm` wiring was hand-copied per feature and route. Source said
  otherwise: it existed in exactly ONE production file. `impersonate-row.tsx` uses bare React
  `useActionState`, and the login and admin account forms use client-only `useForm` with no
  server merge at all. So there was nothing to de-duplicate; what there was, was a piece
  subtle enough that the SECOND writer would get it wrong. It now has one owner —
  `useServerForm` (`hooks/use-server-form.ts`), which binds the action and merges a rejection
  back, and deliberately does not wrap `useForm` so a form keeps its own options and types.
  Reading the form-wide message out of the merged result is `formErrorText`
  (`lib/data/form-validation.ts`), beside the `toFormErrors` that produced it.
- **The toolbar / URL layer.** The typed toolbar value-set, the cursor-policy navigation adapter,
  the selection store, and the ~30-export `search-params.ts` href module are re-authored per list
  over the shared engine. Still open, and unmeasured — treat the shape of this gap as a claim
  to check rather than a finding, given the two above that did not survive contact with source.

`features/_template/**` is where a standard entity's copies live, and it now carries a delivery
surface — a form, the URL/href module, and route templates — rather than data files alone.
`scripts/check-templates.ts` generates a `Widget` from it in a temp directory and typechecks it.
What that gate does and does not prove, exactly: it REFUSES a `__token__` no substitution
resolved, which tsc cannot see because an unresolved placeholder is a valid identifier — a real
defect that had already shipped the plural into the generated repo. It also refuses any
capability `CAPABILITIES` already declares, and requires the generated entity's OWN capability
to be rejected by the closed `Capability` union, so a copy cannot compile while gated on the
reference feature's authority. It never renders anything, so nothing here is browser evidence.

## The proof pair

Every extraction in this model is proven against two entities at once:

- **The generated `Widget`** — the _standard_ entity, materialized from the templates by
  `scripts/check-templates.ts`. It stands in for "a consumer's plain entity" and must stay free of
  copied mechanics.
- **`features/asset/**`** — the _custom_ entity, carrying counter, search, attachment lifecycle,
  conflict handling, bulk limits, and export.

The test of a shared helper is that fixing a bug in it changes both Widget and asset behavior with
no parallel copy to keep in sync — while the asset path keeps every domain-specific behavior above
explicit and correct. An extraction that can only serve the standard entity by making the custom
one lie about what it does is not extracted; it is a `BaseCrud` in disguise, and this model refuses
it.
