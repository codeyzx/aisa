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
- The list rendering — the server-rendered `DataTable` family (`components/ui/data-table.tsx`)
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
- Application composition — a navigation entry.

**Opt-in domain extensions are feature-owned and off by default.** The standard baseline is CRUD
plus status filtering and cursor pagination. Everything below is argued per entity, never assumed:
a human `code` counter (`nextCode`, `lib/repos/counter.repo.ts`), server-owned `searchPrefixes`
search, a bulk-write cap, and optimistic-conflict handling. A plain entity lights up none of them.

## The standard baseline, and what is opt-in

- **Baseline (every entity gets it):** create, read, update, delete; a status filter; cursor
  pagination in both directions.
- **Opt-in (argued per entity):** search, bulk operations, a human code counter.

Do not carry an extension's wiring into an entity that has no use for it.

## Where the code is today

What has one owner today: the server-owned id/timestamp stamp
(`stampCreated` / `stampUpdated`, `lib/data/stamps.ts`), the not-found throw (`requireFound`,
`lib/data/domain-error.ts`), the form-validation protocol (`toFormErrors`,
`lib/data/form-validation.ts`) and the client form bridge (`useServerForm`,
`hooks/use-server-form.ts`, which deliberately does not wrap `useForm` so a form keeps its own
options and types). Still copied per entity: the two-line cached read, the query/filter chain
(per entity on purpose — query power is never hidden), the `toXInput` projection (domain, not
mechanics), and the `search-params.ts` href module.

`features/_template/**` is where a standard entity's copies live, and it now carries a delivery
surface — a form, the URL/href module, and route templates — rather than data files alone.
`scripts/check-templates.ts` generates a `Widget` from it in a temp directory and typechecks it.
What that gate does and does not prove, exactly: it REFUSES a `__token__` no substitution
resolved, which tsc cannot see because an unresolved placeholder is a valid identifier — a real
defect that had already shipped the plural into the generated repo. It also refuses any
capability `CAPABILITIES` already declares, and requires the generated entity's OWN capability
to be rejected by the closed `Capability` union, so a copy cannot compile while gated on
an existing feature's authority. It never renders anything, so nothing here is browser evidence.
