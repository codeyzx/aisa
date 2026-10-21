# Data contract

- Type: Normative reference contract
- Owns: the `schema -> collection -> repo -> action` path every Firestore entity
  follows, and the query cost rules that ride on it (composite indexes, cursors,
  search prefixes, counts)
- Source of truth: `features/<entity>/*` (reference: `features/asset/*`),
  `lib/data/*`, `lib/firebase/collections.ts`, and `firestore.indexes.json`
- Verified by: `pnpm test && pnpm indexes:check` inside ONE emulator session
  (`pnpm test:emulator`), plus `pnpm templates:check` and `pnpm lint:rules`
- Read when: adding, querying, paginating, searching, counting, or deleting an
  entity — before writing the first `.where()`
- Does not define: who may call an action (`docs/reference/contracts/auth.md`),
  how a component renders the rows (`docs/reference/contracts/ui.md`), what fills
  the `indexes:check` report (`docs/reference/contracts/testing.md`), or when a
  route is allowed to exist (`docs/reference/contracts/http-api.md`)

The contract for how data flows through this starter, for both humans and
agents. Every entity follows the same four-layer path.

## The layers

Every entity's files live together in `features/<entity>/` (reference:
`features/asset/`) — schema, repo, action, form-opts, and the collection
binding. `lib/` holds only the shared, domain-agnostic plumbing.

```
schema            features/<entity>/<entity>.schema.ts
  |   Zod object = the single source of truth for the stored shape.
  |   Reads are hydrated (parsed) through it; writes are validated by it.
  v
collection        features/<entity>/<entity>.collection.ts
  |   Typed accessor: <entities>Collection() returns a live
  |   CollectionReference<Entity> with the FULL Firestore query API + the Zod
  |   converter bolted on. It never hides or narrows .where()/.orderBy()/etc.
   |   The generic typedCollection machinery stays shared in
   |   lib/firebase/collections.ts; this feature owns its dependency-free path
   |   and binds it to the entity schema here.
  v
repo              features/<entity>/<entity>.repo.ts   (REUSED-ONLY — thin by design)
  |   ONLY cache()'d reads, cursor pagination, and transactions live here.
  |   One-off queries do NOT — they run direct off <entities>Collection().
  v
action            features/<entity>/<entity>.action.ts   (ONE entry per operation)
      Server actions grouped by entity. Two entry kinds, by naming:
      <verb><Entity>Action (programmatic -> ActionResult) and
      <verb><Entity>FormAction (form -> redirect/formState). Both auth-gate,
      validate input, call the repo, and revalidate. Shared form field config
      sits beside them in features/<entity>/<entity>.form-opts.ts.
```

Reads flow up (`collection -> repo/call-site -> RSC`); writes flow down
(`action -> runAction -> repo transaction -> collection`).

The `lib/` (shared) vs `features/` (domain) boundary is enforced by the 3-way
import rule (`no-import-feature-or-app-from-shared`, ast-grep in `rules/`):
`lib/` must never import `@/features/*`, so a feature stays deletable without
touching shared plumbing.

## The anti-sprawl rule (MUST / MUST-NOT)

> **Repo functions are for reused logic and transactions ONLY. One-off queries
> go DIRECT via `<entities>Collection()` — never add a repo method just to
> wrap a single `.where()`. Query power is never hidden.**

- **MUST** put a function in the repo only when it earns its place: it needs
  React `cache()` dedupe, cursor pagination, a transaction, or it is genuinely
  reused across call sites.
- **MUST** build one-off reads and filters right at the call site, straight off
  the typed accessor, e.g. in an RSC:

  ```ts
  const snap = await assetsCollection()
    .where('status', '==', 'retired')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get()
  const items = snap.docs.map((d) => d.data()) // already typed + hydrated
  ```

- **MUST NOT** add a pass-through wrapper like `getRetiredAssets()` that only
  hides a single `.where()`. It caps what callers can express and forks a path
  that should stay uniform. The converter already travels with the accessor, so
  the call site loses no type safety by querying directly.
- **MUST NOT** duplicate a collection path string. The owning feature or
  infrastructure module exports the dependency-free path constant; server reads
  use its typed accessor and client consumers receive the path from their server
  parent.

## `typedCollection` or `typedCollectionGroup`?

Both live in `lib/firebase/collections.ts`, and both hand back the full Firestore
query API with the Zod converter bolted on. They differ only in **what they scan**:

- **`typedCollection(path, Schema)`** — one collection at one path (`assets`). The
  default, and what every feature's `<entities>Collection()` accessor binds. Reach
  for it unless a query genuinely has to cross parents.
- **`typedCollectionGroup(name, Schema)`** — every sub-collection named `name`
  wherever it is nested, across all parents at once. Reach for it when the entity is
  **nested under a parent** and you need to query it parent-agnostically — every
  `lineItems` under every `invoice`, say.

The real fork is a **data-model** one, decided when you add the entity, not a query
convenience:

- **Nest a sub-collection** when a child only ever exists inside one parent and is
  mostly read through it. A collection-group query is then how you occasionally ask
  across all of them — and it needs its own composite index declared with
  `"queryScope": "COLLECTION_GROUP"` in `firestore.indexes.json` (the shipped
  indexes are all `"COLLECTION"`; a group query is invisible to them).
- **Keep it top-level** when the entity stands on its own and is usually queried
  globally. A flat collection with a `parentId` field is simpler than a group query
  and indexes more cheaply. `assets` is top-level for exactly that reason; nothing
  in the boilerplate nests yet.

## Adding a new entity

**The procedure is owned by [add a Firestore-backed feature](../../how-to/add-feature.md)**
— which `features/_template/_template.*` files to copy, the case-sensitive token
passes, and the order to wire them in. It is deliberately not repeated here: a
second copy of a click-by-click list is a second thing to keep in sync, and this
one had already drifted from the templates it described.

What this contract requires of the result, whatever produced it:

- **The four layers, in the order above** — schema, collection, repo, action —
  with the repo held to the anti-sprawl rule.
- **The feature owns its collection path.** The dependency-free path constant lives
  in `features/<entity>/<entity>.path.ts` and is bound to the entity schema in
  `features/<entity>/<entity>.collection.ts`, which exports the
  `<entities>Collection()` accessor (reference: `assetsCollection()` in
  `features/asset/asset.collection.ts`). Call sites import that accessor from the
  feature — never a method off a shared `collections` object, and never a second
  spelling of the path string.
- **A filtered + ordered list needs its composite index** declared in
  `firestore.indexes.json`, in the same commit as the query (below).

How the entity's capability is declared and granted is the auth contract's:
[how to extend roles / capabilities](auth.md#how-to-extend-roles--capabilities).
Which gate each surface calls is under "When to gate" below.

### A required number field cannot use `z.coerce.number()` alone

`z.coerce.number()` turns an empty submit (`''`) into a real `0` — so a
**required** numeric field would silently persist a value the user never chose,
the kind of quiet corruption a green build never catches. Require a number OR a
non-empty trimmed string instead, so a blank ERRORS while an explicit `0` stays
valid and a hydrated read (already a number) is a no-op:

```ts
value: z.union([z.number(), z.string().trim().min(1, 'Value is required')])
  .transform((v) => Number(v))
  .pipe(z.number().int().min(0))
```

Worked example: the `value` field in `features/asset/asset.schema.ts`. The base
`_template` has no numeric field, so this pattern lives here, not in a template
you copy.

## When to gate

- **One entry per operation** — every mutation has exactly ONE entry point,
  grouped by entity in `features/<entity>/<entity>.action.ts`, chosen by the UI that
  triggers it. Both kinds are auth-gated + zod-validated server-side and are a
  public POST endpoint (the real security boundary), so both re-check auth and
  re-validate. Two kinds, distinguished by naming:
  - **Form-triggered (create, edit) → `<verb><Entity>FormAction`, wraps
    `runFormAction`.** The form POSTs FormData to this `'use server'` entry.
    `runFormAction` (the form counterpart to `runAction`, in `lib/data/`) owns
    the shared flow: auth-gate with redirects → `createServerValidate` (zod) →
    repo write → `redirect`; validation errors merge back through `mergeForm`.
    Progressive enhancement — submits without JS. Shared field config lives in
    `features/<entity>/<entity>.form-opts.ts` (a plain module so both the client
    form and the action import it). An edit form reuses the SAME form component,
    passing the loaded values as `defaultValues` and binding the id
    (`updateAssetFormAction.bind(null, id)`). Canonical: `createAssetFormAction` +
    `updateAssetFormAction` + `asset-form.tsx` (create at `assets/new`, edit at
    `assets/[id]/edit`). Keep the stored-entity-to-form projection in the feature
    (for example, `assetFormValues`) so optional fields normalize identically
    wherever the form is rendered.
    Classify Zod issues with `classifyFormValidationIssues` from `lib/data/` so
    field errors, first-issue precedence, and pathless form errors do not drift
    between features.
    **The success redirect uses `RedirectType.replace`** — the submitted form's
    URL is REPLACED in history rather than pushed over, so a reader who saves and
    then presses Back returns to wherever they came from and never onto the form
    they just submitted. It lives in `runFormAction`, so no feature decides it
    and none can drift.
  - **Button / imperative (delete, archive, toggle) → `<verb><Entity>Action`,
    wraps `runAction`.** A typed call returning a discriminated `ActionResult` —
    never throws across the RSC boundary, never redirects, so the caller can
    toast / update optimistically and stay on the page. Canonical:
    `deleteAssetAction` + its consumer `_components/asset-row-actions.tsx`.
  - Both wrappers are called INSIDE the exported async action (never
    `export const x = runFormAction(...)`): Next only detects a `'use server'`
    export that is syntactically an async function.
  - **Never expose the same operation through both kinds** (enforced by the
    `single-operation-entry` structure check: a `<verb><Entity>FormAction` and a
    `<verb><Entity>Action` that reduce to the same base fail the gate), and never
    call a repo write outside an entry. If one operation genuinely must be
    triggered both ways (rare), extract a shared core function and let both
    wrappers call it.
- **Every protected page/RSC calls `requireCapability(capability)` first**, at
  the top, before reading data. Guards own redirects: no session ->
  `/login`, wrong role -> `/403`.
- Gate reads and writes with matching capabilities (e.g. `asset:read` for the
  list page, `asset:write` for the create action). The action re-checks authz
  even when the page already did — the action is a public POST endpoint, so it
  is the real security boundary; client-side checks are UX only.

## Bulk writes (the batch ceiling, and one gate for many rows)

A bulk mutation (multi-delete, multi-archive) is not just "the single op in a
loop" — it has three rules the single op does not, all shown by
`deleteAssets` / `deleteAssetsAction`:

- **Two independent limits, enforced at two layers.** A **product cap**
  (`ASSET_BULK_DELETE_MAX`, owned by the schema + the selection UI) and
  Firestore's **500-writes-per-batch** infrastructure floor
  (`FIRESTORE_BATCH_LIMIT`, `lib/data/batch.ts`) are different facts. Keep the
  product cap `<=` the floor so a full UI selection always commits in ONE atomic
  batch, and assert the floor **at the repo** — the one place holding the
  `batch` — as a LOUD throw _before_ a single `delete()` is staged, so there is
  no partial commit to reach. The cap arithmetic lives in `lib/data/batch.ts`
  precisely so a test can reach it without the credential boundary the repo sits
  behind. Reject duplicate ids there too.
- **The gate is the SAME boundary as the single op — bulk changes the count, not
  the reach.** `runAction('<entity>:write')` re-checks the capability
  server-side per call; a principal holding it may name any id, including ids it
  never saw. That is exactly the reach the single delete already has. An entity
  with **per-row ownership** cannot lean on the batch for it: a batch cannot
  short-circuit, so the ownership check must run INSIDE the loop, per id.
- **Audit one entry per document, under the single op's action name.** Write
  `audit(session, '<entity>.delete', id)` per row — never a bulk-specific event.
  A separate event forks the audit trail, so the same fact ("this row was
  deleted") would have to be searched for two ways. ([Observability
  contract](observability.md) owns audit; this is its bulk shape.)

## Composite indexes (the query rule nothing else enforces)

> **Any `.where(A, '==', …)` combined with an `.orderBy(B, …)` on a DIFFERENT
> field needs a composite index declared in `firestore.indexes.json`. Firestore
> auto-creates single-field indexes only.**

This bites every paginated list that also filters, because `paginate()` always
adds `.orderBy(orderByField).orderBy('__name__')`. So the moment a repo does

```ts
base.where('status', '==', 'active') // + paginate orders by createdAt
```

the query needs `(status ASC, createdAt DESC)` in `firestore.indexes.json`.
Firestore appends `__name__` implicitly in the last explicit field's direction,
which is exactly what `paginate()` asks for — no `__name__` entry needed.

- **An UNFILTERED paginated list needs nothing.** The automatic single-field
  index serves it, because `paginate()` derives both `orderBy` directions from
  the same `direction` argument, so the `__name__` tiebreaker always matches the
  sort.
- **Add the index in the same commit as the query.** Then deploy it —
  `firebase deploy --only firestore:indexes`. An index is a deploy artifact; the
  file alone changes nothing.
- **`widgets` is the one collection here that no application code writes to.** It
  is the entity generated from `features/_template/`, whose repo
  `test/integration/template-widget.test.ts` drives against the emulator — so its
  filtered list is an observed query shape like any other, and `pnpm
indexes:check` requires its index the same way. That is deliberate: it is how
  the copy-me template's index requirement is proven rather than asserted, and it
  gives a forker a block shaped exactly like the one they need.

### What a sortable column costs

> **Every server-side sortable column is `sortable fields × directions × filters
that can be active alongside it` composite indexes.** Sortability is a bill,
> not a feature flag — which is why it is opt-in and argued per column.

`/assets` is the worked example. TWO sortable fields (`createdAt` and `value`), two
directions each, one filter (`status`) — and its bill is **four** indexes:

- `(status ASC, createdAt DESC)` / `(status ASC, createdAt ASC)` — the filtered
  list, newest and oldest first.
- `(status ASC, value DESC)` / `(status ASC, value ASC)` — the filtered list by
  amount, highest and lowest first.
- Unfiltered, any field, either direction — **free**. The automatic single-field
  index serves it, because `paginate()` takes both `orderBy` directions from the same
  `direction` argument, so the `__name__` tiebreaker always matches the sort.

### ⚠️ Paging BACKWARD is a second index, even on one sort direction

> **A filtered list that offers a Previous link needs the ASCENDING mirror of
> every DESCENDING index it already needs — and vice versa.**

This is not the sortable-column bill above; it bites a list with exactly ONE sort
direction. `paginate()`'s prev branch is `endBefore` + `limitToLast`, and
Firestore serves `limitToLast` by running the query REVERSED, so
`.where('result','==',x)` ordered `startedAt DESC` reports
`(result ASC, startedAt DESCENDING)` going forward and
`(result ASC, startedAt ASCENDING)` coming back. Nothing in the forward index
covers it.

So the real bill for a filtered, bidirectionally paged list is **`filter
combinations × 2`**. `/admin/audit` is the worked example: three optional
equality filters → seven non-empty combinations → **fourteen** composite indexes
(`firestore.indexes.json`), and the unfiltered pages stay free in both directions
because the automatic single-field index serves them.

Drive Previous, not only Next. A suite that walks forward only declares half the
bill, `pnpm indexes:check` reports nothing missing, and the first "Sebelumnya"
click in production is a `FAILED_PRECONDITION` — the same trap as an undriven
filter, one step further in.

**ASC and DESC do NOT share an index.** Driving each filtered query shape against the
emulator's `indexUsage` reports it as its own required entry —
`(status ASC, createdAt DESC, __name__ DESC)`, `(status ASC, createdAt ASC, __name__ ASC)`,
and the matching pair on `value` — even though `status` is pinned by equality and a
reverse index scan looks like it should cover both directions. The same run reports
**nothing** for the unfiltered pages or for either `count()`.

Adding `value` as a second sortable field is exactly this cost realised: it did not
add one index, it added two (`firestore.indexes.json`). A second FILTER would double
the whole table again. "Make every column sortable" is not a safe default on
Firestore; it is a combinatorial index explosion — which is why the sortable set
stays two fields and each is argued. Server-owned **search** (below) carries its own,
separate index family on `searchPrefixes`.

- **Nothing in the toolchain catches a missing index by itself.** Not `typecheck`,
  not `lint`, not `build` — and **not the emulator**, which by design "does not
  track composite indexes and will instead execute any valid query"
  ([Google's docs](https://docs.cloud.google.com/firestore/native/docs/emulator);
  firebase-tools#2027 has been open since 2020). A filtered query passes every
  local check, then throws `FAILED_PRECONDITION` in production at RSC render time.

### So run `pnpm indexes:check`

The emulator does not _enforce_ indexes, but it does _compute_ the one each query
would need. `scripts/check-indexes.ts` reads that back and diffs it against
`firestore.indexes.json`, so a missing index is caught locally — no real Firestore
project needed:

```bash
pnpm emulators          # terminal 1
pnpm seed               # terminal 2
pnpm dev                # ...then exercise the queries (or run integration tests)
pnpm indexes:check      # exit 1 + paste-ready JSON for anything undeclared
```

Read the caveats before trusting it:

- **It is not static analysis.** It only knows about query shapes that ACTUALLY
  RAN against that emulator instance. A query no test exercises is invisible.
  Coverage comes from driving the app, not from this script.
- **An empty report is not a pass** — the script exits 1 if no queries ran, so a
  CI job that forgot to drive the app fails instead of reporting a green tick.
- **The endpoint is undocumented** (`/emulator/v1/projects/{p}:indexUsage`,
  discovered via [firestore-index-gen](https://github.com/ericvera/firestore-index-gen))
  and may change without notice. The script fails loudly on any non-200 rather
  than passing silently — a guard that silently stops guarding is worse than none.
- **It answers "which indexes do the queries need", not "are they deployed".**
  Deploying is still `firebase deploy --only firestore:indexes`.

## Sorting and the cursor (the rule that has no safe default)

> **A cursor belongs to ONE sort AND ONE filter.** `paginate()` stamps both the
> sort and a `scope` — an opaque name for the filter already applied — into every
> token it mints, and `decodeCursor(token, sort, scope)` returns `null` for a token
> minted under any other, so a stale `?cursor` drops and paging restarts at page one.

A cursor is not a row number. It is `{ sort, scope, sortValue, docId, nav }`, and
`startAfter` means _"resume just past this value, scanning this way"_. Paging is
**bidirectional**: `paginate()` returns a `Page<T>` with both `prevCursor` and
`nextCursor`, each token baking its own `nav` (`'next'` → `startAfter`, `'prev'` →
`endBefore` + `limitToLast`), so one `?cursor` param drives Previous and Next alike
with no page-number model. A position
only means something relative to the set it was measured in, so **both** halves of
that set's identity travel with the token — how it was ordered, and what it was
filtered to. Change either and the same token addresses somewhere else entirely:

- **Different field** — the boxed value came from the old `orderByField`, so
  Firestore usually throws on the type mismatch (it requires the cursor value's
  type to match the ordered field's). Loud, but only by luck: two string fields
  would swap silently.
- **Different direction** — **nothing throws.** The same value, scanned the other
  way, returns the rows on the other side of it. A plausible page of wrong rows,
  and no typecheck, lint, build, or emulator run will mention it.
- **Different filter (`scope`)** — **nothing throws either.** `?status=retired`
  carrying a cursor minted with no filter passes every sort check cleanly — same
  field, same direction — and then `startAfter` resumes the _retired_ set from an
  offset counted through the _unfiltered_ one, handing the reader a plausible page
  of rows belonging to neither answer. `scope` is the half a sort check cannot see.
  The caller names its own filter set (any stable string, e.g. `'status=retired'`)
  and `paginate()` only ever compares that name to itself — it never learns what the
  filter _is_, so it never becomes the place every entity's filters collect.

Two layers keep it right, and both are needed:

- **`paginate()` refuses the mismatch** (`lib/data/pagination.firestore.ts`). This is the
  guarantee: it holds for hand-typed URLs, stale bookmarks, and every entity that
  ever calls it. `decodeCursor` takes `sort` **and** `scope` as required arguments,
  not courtesy checks — together they are the whole reason a caller cannot resume
  one result set from another one's token. It returns `null` rather than throwing
  because `?cursor` is reader-supplied view state — the same policy `?status` and
  `?sort` have. A token carrying no `scope` must read as "matches nothing", never
  "matches anything" — a hand-typed URL is the case that rule is for.
- **The page cannot OFFER a bad link** (`app/(app)/(examples)/assets/search-params.ts`).
  Every /assets href comes from one module: `assetsPageHref` (next page — keeps the
  filter and sort) and `assetsViewHref` (new filter/sort — takes
  `Partial<Omit<AssetsQuery, 'cursor'>>`, so "page 3 of a different sort" is not
  spellable). Do not hand-build a link to a paginated list beside these.

## Server-owned search (prefix `array-contains`)

Search is server-owned like sort and paging: the repo narrows the query, the URL
carries the term, nothing filters client-side. The scheme is a normalised
word-prefix `array-contains`, generic in `lib/data/search-prefix.ts`; WHICH fields
feed it is the feature's call (`features/asset/*` derives from `code` + `name`).

- **On write**, `toSearchPrefixes(values)` derives a `searchPrefixes` array — every
  prefix of length 2..15 of each normalised word (lowercased, punctuation-split),
  capped at 12 words per doc. **Derive it on write from the trusted field values —
  never accept a client-supplied `searchPrefixes`**, or a client could make a doc
  match (or hide from) any search.
- **On query**, `toSearchTerm(raw)` normalises to ONE prefix token and the repo asks
  `.where('searchPrefixes', 'array-contains', term)`.

Its limits ARE its contract — name them so nobody expects full-text:

- **Word-START prefixes only** — `chair` finds `Office Chair`; `hair` does not. No
  substring, no typo tolerance, no relevance rank.
- **First word only** for a multi-word query — `array-contains` takes one value, so
  `office chair` searches `office` and does not intersect the two words.
- **Minimum 2 characters** (`MIN_SEARCH_PREFIX`); a shorter term normalises to "no
  search" — a view preference like `?status`, never an error.
- **Bounded both sides** — prefix length caps at 15 (`MAX_SEARCH_PREFIX`), so a
  longer query still matches on its first 15 chars rather than finding nothing.

### Adding a derived field after deployment

`searchPrefixes` is required and every create, update, and seed writes it, so
`assets` needs no backfill — do not add one, or a runtime readiness gate, for
data that was never without the field.

When a **deployed** collection gains a derived query field, make the field
optional temporarily, dual-write it, run an idempotent migration, and only then
make the query/UI depend on it. `scripts/migration/` ships the dry-run-first
runner and the copy-me template for that.

Search carries its own composite-index family (`searchPrefixes` CONTAINS combined
with `status` / `createdAt` / `value` — see `firestore.indexes.json`), separate from
the sortable-column bill above. And the search term is part of both the cursor
`scope` and the selection `scope` (`assetScope` = status AND search): a page or a
bulk selection from one search can never resume or act under another.

## Counting rows (the list total)

A cursor page knows how many rows it holds, never how many exist. The total comes
from a server-side `count()` aggregation — only the number crosses the wire.
Canonical: `countAssets` in `features/asset/asset.repo.ts`.

> **A `count()` has no order. Never give it an `orderBy`.**

That is a cost rule, not a style one. `.where('status','==',x).count()` is served
by Firestore's automatic single-field index. Bolt on the `.orderBy('createdAt')`
that `paginate()` uses and the same count demands the composite
`(status, createdAt)` — a **deploy artifact** — to answer a question ordering
cannot affect. With the `orderBy` the emulator's `indexUsage` reports
`(status ASC, createdAt DESC, __name__ DESC)`; without it, the report is empty.

- **`count()` is billed** (one read per 1000 documents counted), so spend it where
  a reader sees the number. **Never run two counts to learn one fact:** with no
  filter active `total` IS `filtered`, so an unfiltered list page costs ONE
  aggregation and a filtered one costs TWO. `/assets` is the worked example.
- **The count shares the list's filter.** `listAssets` and `countAssets` both build
  on one `assetsQuery(status)`. This is the case where a repo function earns its
  slot despite the anti-sprawl rule: it is not hiding a `.where()`, it is holding
  the invariant that the denominator and the rows describe the same set. Let them
  drift and the table reports a number for a query it never ran.
- **The label states only what it knows.** See `countLabel` in
  `components/ui/data-table.tsx` for why there is no `21–40` range — and for the
  recipe if you ever want one.

## Read hydration is fail-loud (the tradeoff)

Every read is parsed through the entity schema by the collection's Zod
converter. This is deliberate:

- **Win:** data that reaches your code is already the correct shape — timestamps
  are real `Date`s, defaults are applied, unknown/garbage docs cannot silently
  masquerade as valid entities.
- **Cost:** a malformed document (schema drift, a hand-edited doc, a bad
  migration) makes `.data()` **throw at parse time** rather than returning a
  half-valid object. That is the intended behavior: fail loud at the boundary,
  not deep in business logic. If you change a schema, migrate existing docs or
  widen the schema (e.g. `.optional()`, `.catch()`) to absorb old shapes.

## Removal checklist (deleting an entity)

Deleting the example loses no KNOWLEDGE — the reusable rules it demonstrated live
in the surviving docs, not in the example: the `schema → repo → action` path and
its gotchas (required numeric fields, bulk writes, search, composite indexes) are
in this contract, the attachment lifecycle is generic in
`lib/storage/attachment-lifecycle.ts` + [storage contract](storage.md), and the
wiring cookbook is in [add a feature](../../how-to/add-feature.md). The example
only WIRES what those own.

But it is **not a one-shot delete**, and it is a mistake to describe it as one:
the `asset` vertical has tentacles in SEVEN layers, and a `trash` that stops at the
route group leaves files that still typecheck against a schema that is gone. The
feature folder is deletable without touching shared plumbing (the import rule buys
that); it is NOT the only thing that has to go.

Driven, on this tree: the deletion is **55 files removed and 14 edited**, and the
four `trash` targets below cover 53 of the 55 — it is the EDITS that are easy to
miss. Nine of the fourteen were found by a failing gate rather than by this list,
which is why each entry now says what speaks when you skip it. Remove all seven:

- **The feature** — `trash features/asset/`: schema, repo, action, form-opts,
  feature-owned path, collection binding, and its five colocated unit tests
  (`asset.*.test.ts`). The generic accessor in `lib/firebase/collections.ts` has
  no registration to remove.
- **The UI** — `trash "app/(app)/(examples)"`: the whole route group at once. It
  MUST go as a unit because `state`, `realtime`, `export`, and `ai` all demo
  against `asset` and stop building the moment it is gone (`storage` does not — it
  is asset-independent, but it lives in the same group).
- **The export routes** — `trash "app/api/export/assets"` (csv, xlsx, pdf). These
  are NOT under the route group above and a group-only delete misses them.
- **The test layer** — `trash test/builders/asset.ts` and
  `trash test/integration/asset-repo.test.ts`; repoint
  `test/data-layer-reachable.test.ts` at a surviving repo (it imports `asset.repo`
  only as a concrete data-layer sample, to prove the public-env fixture unlocks
  the import).
- **The e2e specs** — `trash e2e/assets.spec.ts` and `e2e/unhydrated.spec.ts`;
  repoint the `/assets` reference in `e2e/auth.spec.ts` at a surviving protected
  route. `e2e/target.ts` needs no edit — it names assets only in prose. **Nothing
  speaks here**: a `/assets` string is invisible to typecheck, and the e2e suite
  needs Docker, so this one is found by reading or not at all.
- **The wiring** — remove `seedAssets`/`buildAssets` from
  `scripts/seed-emulator.ts` (trim, don't trash — it also seeds users); the
  `ASSETS_COLLECTION` import in `scripts/setup-local.ts` and the asset count its
  seed decision branches on; the `/assets` expectations in `app/navigation.test.ts`;
  the `Aset` item (and the emptied `Contoh` section) from `app/navigation.ts`; the
  `asset:*` capabilities from `lib/auth/rbac.ts` (`CAPABILITIES` +
  `ROLE_CAPABILITIES`) AND from `EXPECTED_GRANTS` in `lib/auth/rbac.test.ts`, the
  grant matrix restated by hand so the test cannot agree with the implementation by
  construction, once nothing references them; and **all thirteen** `assets` blocks
  from `firestore.indexes.json` — the reference feature is sortable and searchable,
  so it owns a family, not one entry, and a stale index is a lie about what the app
  queries. Neither script nor test fails quietly — `scripts/setup-local.ts` stops
  typechecking the moment `features/asset/` is gone (and its whole "is this emulator
  already seeded" decision is built on the asset count, so it needs rewriting, not a
  line deleted), and `app/navigation.test.ts` fails in `pnpm test:unit` once the nav
  item goes.
- **Every other file that SPELLS a capability you removed.** Dropping `asset:*` from
  `CAPABILITIES` closes the union, so each one becomes a type error naming the file:
  `components/shell/nav-config.test.ts`, `lib/auth/session.test.ts`,
  `lib/data/action-result.test.ts`. Loud, but only AFTER the rbac edit — they cannot
  be found by grepping for `asset` before you start.
- **The Firestore rules.** `firestore.rules` carries a named carve-out for the
  `assets` collection (the realtime listener reads it directly), and
  `firestore.rules.test.ts` asserts that carve-out across a whole `describe`. Neither
  is reachable from typecheck, lint, `structure:check` or `docs:check` — a rules file
  granting access to a collection that no longer exists survives a fully green
  `pnpm verify`, and only the emulator rules suite would notice.

Then **grep for stragglers**: search `asset` and the collection key `assets`
across the repo to catch remaining imports, `revalidatePath` targets, and links.

**What stays behind with every gate green**, measured rather than guessed — none of
it is reported by anything, so it is a reading job:

- **Capabilities the deletion orphans without naming.** Removing the export routes
  leaves `export:read` declared and enforced nowhere. `structure:check`'s
  `capability-completeness` DOES catch this one — run it, and run it from outside a
  disposable worktree.
- **Dependencies that now serve nothing.** `@react-pdf/renderer` and `exceljs` are
  reachable only from `lib/export/**` and `components/pdf/**`, and `zustand` only
  from `lib/list-toolbar/**` — all three of those directories lose their last
  consumer with the examples. They keep building, and they keep shipping.
- **Comments pointing at deleted paths.** The templates cite `features/asset/**` as
  the fuller worked version, and a dozen `lib/` and `components/` files cite the
  example route group. Prose, not imports — nothing resolves them, so nothing
  complains.
- **The generated project layout** needs regenerating — `pnpm docs:generate`, then
  drop the `features/asset` entry from `LAYOUT_NOTES` when the generator tells you
  it describes a directory that is no longer there. It does now notice an unstaged
  delete; it did not before, because `git ls-files --cached` reads the index and
  still lists a file removed from disk.

To remove YOUR OWN entity later, the same layers apply — feature folder,
route(s), export routes if any, `test/builders/<entity>.ts` +
`test/integration/<entity>-repo.test.ts`, e2e specs, seed, and the nav +
capability + index wiring. A feature built with the **scaffold-feature** skill has
these tentacles by construction, so it deletes by the same list rather than a
shorter one.

Use `trash` (recoverable), never `rm`. The shared data-layer deps
(`lib/data/*`, `lib/firebase/*`, `lib/auth/*`) stay — they are not
entity-specific.
