# UI contract

- Type: Normative reference contract
- Owns: how a component is sourced and extended, where the RSC / client boundary
  falls, and which state mechanism a piece of UI is allowed to reach for
- Source of truth: `components/ui/*` (+ `components/ui/README.md` for
  provenance), `components/shell/*`, and the copy-me list page in
  `features/_template/` (`_template.page.tsx`, `_template.search-params.ts`)
- Verified by: `pnpm typecheck && pnpm lint && pnpm lint:rules && pnpm test`,
  then driving the list page in a browser **with the client bundle blocked** as
  well as loaded — a server-owned control that only works once React has hydrated
  is a broken one. Block the bundle rather than disabling scripting: with
  scripting off nobody can sign in at all (the root layout says so), so a JS-off
  run tests nothing about these controls
- Read when: adding or wrapping a component, adding a UI dependency, or adding
  client state of any kind
- Does not define: how the rows are queried, sorted, paged, or counted
  (`docs/reference/contracts/data.md`), who is allowed to see a page
  (`docs/reference/contracts/auth.md`)

How `components/ui` is sourced, extended, and kept honest — and which of the four
state mechanisms a piece of UI is allowed to reach for. Read this before adding a
component, reaching for a UI dependency, or adding client state.

## Where a component comes from (the ladder)

shadcn is a **starting point**, not a fixed standard. Walk the ladder in order
and stop at the first rung that holds:

1. **Registry has it and it matches the Aixel standard** → `shadcn add <name>`,
   keep as-is. Verify it pulled zero `@radix-ui` (this project is Base UI /
   `base-nova`).
2. **Registry has it, minor mismatch** → add it, **commit the raw vendored file
   first**, then adjust in a separate commit. The raw commit is what makes the
   divergence reviewable and re-diffable against a future registry update.
3. **Registry lacks it, or adapting it means fighting the primitive** → build it
   natively on `@base-ui/react` (or plain elements) to the Aixel standard.

Log every result in `components/ui/README.md` under `shadcn base-nova` or
`Custom`. That file is the provenance record — keep it thin.

Vendored shadcn files get a lint escape hatch (`components/ui/**` turns off
`consistent-type-definitions` and a few strict a11y rules in `.oxlintrc.json`).
That override exists to avoid rewriting vendored code — it is **not** a licence
for hand-written components in the same folder. New custom components follow the
house rules: `interface` over type-object, named exports, `cn()`, `data-slot`.

## Client vs server

- **Default to no `'use client'`.** A component earns the directive by needing
  hooks, state, or DOM events — not by living in `components/ui`.
- **A `'use client'` module MUST use flat named exports, never a dotted compound
  object.** A client module's object export becomes a client-reference whose
  `.Root` reads `undefined` from a Server Component. `components/shell/page-container.tsx`
  can be `Page.Root` precisely because it is server-side; `ViewToggle` and
  `ConfirmDialog` cannot. This binds Context-backed compound components too
  (a `Foo.Root` / `Foo.Trigger` pair) the moment they need `'use client'`.
- **Props that are functions cannot cross the RSC boundary.** This is why
  `data-table` has no `'use client'`: its `DataTableColumn.cell` is a function,
  so a list page can define columns inline and stay a Server Component. Making
  the table a client component would force every consumer into an island.
- **Never import a `server-only` module from a client component** — not even for
  a type. `lib/data/pagination.firestore.ts`, `lib/repos/*`, `features/*/*.repo.ts`, and
  `lib/firebase/*` are server-only; a `server-only` type import can still drag
  `firebase-admin` into the client bundle through a schema import.

## Which state mechanism (the ladder — the order IS the rule)

No example route ships these side by side any more; the ladder is the rule, and
`features/_template/_template.search-params.ts` is the reference for rung 2.

```
1. Server state      RSC + server action + revalidatePath/revalidateTag
   |   The DEFAULT for anything persisted. Source of truth = Firestore.
   v
2. URL state         nuqs — features/_template/_template.search-params.ts
   |   View/query state that should be shareable, bookmarkable and
   |   back-button-friendly: filter, sort, pagination, active tab, search.
   v
3. React Context     e.g. SidebarContext in components/ui/sidebar.tsx
   |   Dependency injection / scoped providers (session, theme, feature config)
   |   and the backbone of compound components. NOT a state container — it does
   |   not store state, it TRANSPORTS it down a subtree.
   v
4. zustand           NOT installed — adding it is a deliberate dependency.
       LAST resort. Client-only ephemeral state that deserves neither the URL
       nor persistence: a draft cart, a multi-step wizard, client UI prefs, an
       optimistic queue.
```

**Descend the ladder only when the rung above genuinely does not fit.** Each step
down adds client state that has to be kept in sync with something else — the cost
this ordering minimizes.

### `nuqs` or plain `useSearchParams`?

Both read the URL; they are not interchangeable. Reach for **`nuqs`** when the URL
is a **contract** — typed, writable from the client, usually multi-param (a filter

- sort + cursor that the Server Component parses and an island writes back). That
  is rung 2, and the single `search-params.ts` declaration both sides import is what
  it buys.

Use **`nuqs` for every application page URL-state contract**: route-owned parser
maps, loaders, and internal href serializers. Its scalar parsers must reject
repeated keys through `parseAsStrictSingle`; nuqs otherwise selects the first.

Keep native `useSearchParams` for a one-off security boundary such as login's
`?next`: require exactly one `getAll('next')` value, then call
`safeInternalPath`. Nuqs does not replace cardinality or open-redirect validation.

### Off the ladder: TanStack Query is not shipped

The ladder covers state this repo actually **holds**. Client-side **data fetching**
with a cache — TanStack Query, SWR — is deliberately **not** a dependency: RSC +
server actions cover persisted data. Reach for TanStack Query only
when the app grows a real client-fetch surface the server cannot serve for you —
many genuinely distant components share the same client-fetched data and threading
it through props stops scaling. Until then it is weight the ladder does not need.

### State MUST / MUST-NOT

- **MUST declare a URL contract ONCE**, in a `search-params.ts`, imported by both
  sides — the Server Component reads it through `createLoader`, the client island
  writes it through the same parsers. **This single declaration is the main thing
  nuqs buys over hand-rolling**: spell the contract twice (a page parsing `?status`
  by hand, a filter rebuilding it from an href template) and changing the key on
  one side drifts silently while both halves still compile.
- **MUST derive a parser's value set from the schema that already owns it**, never
  a hand-listed literal copy. `app/(app)/proposal/search-params.ts` parses
  `kategori` and `status` with `CategorySchema` / `ProposalStatusSchema` from
  `features/aisa/aisa.schema.ts` — the enum owns the set, and a copy here would be
  a parallel taxonomy that goes stale in silence.
- **MUST use `shallow: false` when a URL write must re-query the server.** Without
  it the URL changes and the list does not — the Server Component never re-runs.
- **MUST hand nuqs the `startTransition`** if you want `pending` to cover the
  server round-trip rather than only the URL write.
- **MUST NOT reach for `zustand` because "two components need it".** That
  justification dissolves under RSC: a Server Component can wrap two islands in
  one client provider and pass server-rendered `children` straight through, so
  Context closes that case. The honest triggers are **update frequency** and a
  **provider that would have to span genuinely distant subtrees** — not mere
  sharing.
- **MUST NOT put high-frequency state in Context.** Every change re-renders the
  whole consuming subtree — the reason it is barred here and the reason it is
  right for a click-driven compound component.
- **MUST subscribe to zustand by selector** (`useStore((s) => s.slice)`), never
  the bare `useStore()` — the bare call re-renders on every store change,
  including slices you do not read.
- **MUST NOT rely on a module-level store for anything per-request.** One instance
  per browser tab is correct for client-only prefs and WRONG on the server, where
  a module-level store is shared across every user's render. State needing
  server-initial values needs a per-request store in a provider — at which point
  Context is back in the picture anyway.

### nuqs reads in an RSC; it does not write without JS

nuqs's **read** side (`createLoader` in an RSC) is safe. Its **write** side is
client-only — `useQueryState` is a hook, so it does not work without JS. A
shareable filter that must survive a JS-less client needs `<Link>` or
`<form method="get">`.

## DataTable: when to reach for TanStack Table

`components/ui/data-table.tsx` is deliberately layout-only — typed columns,
alignment, an empty slot. It has **no sorting, filtering, or pagination state**,
because in this boilerplate all three are server-side: the repo orders and
filters, and an opaque cursor drives paging.

A sortable header does not change that. The table renders the sort it is
**handed** (`sort.active` → the arrow + `aria-sort`) and links to the next one
(`sort.href`); the URL holds it and the server re-queries. So sorting costs no
client state, keeps the list page a Server Component, and works with JS off.

**Do not add `@tanstack/react-table` "for the DataTable".** With sorting,
filtering, and paging server-owned, it contributes nothing to them —
`manualSorting`/`manualFiltering` mean _you_ do the work, and its pagination
model is offset-based (`pageIndex`/`pageCount`), which `Page<T>` cannot express
at all (no total, no random access; `pageCount: -1` makes `getCanNextPage()`
always return `true`, i.e. it lies about the one fact we need correct). It also
ships no `'use client'` banner while calling `useState`, so adopting it turns
every list page into a client island.

**The trigger is interactive column/row state, not data volume:**

- bulk row selection with a tri-state select-all header
- a column-visibility menu
- column resizing or reordering
- client-side grouping / expanding

No page in this app meets that trigger today, so no page uses
`@tanstack/react-table`; it stays a dependency, pinned at `8.21.3` (v9 is a hard
rename, `useReactTable` → `useTable`), for the first one that does. When it lands,
only that one view becomes an island; the page stays a Server Component.

The split is the whole discipline, and it keeps the library to presentation:

- **The server stays authoritative for every FACT** — data, sort, filter, search,
  paging, counts, and selection scope. A sortable header is still a `<Link>` to the
  next `?sort` (JS-off safe), reusing `data-table.tsx`'s `DataTableSortLink` /
  `ariaSort`; the cursor drives paging; the picked ids follow the pure rules in
  `components/ui/data-table-selection.ts`.
- **TanStack owns only how the handed rows are DRAWN** — `columnPinning` (static:
  actions pinned right), over the CORE row model only. No
  `getSorted/Filtered/PaginationRowModel`: the server already did that work, and
  TanStack's offset pager cannot express a `Page<T>` cursor anyway.

`components/ui/data-table.tsx` stays the simple, server-rendered default. Reach for
the island only when interactive column/row state actually lands.

## Naming a data table

**Every data table carries a REQUIRED `caption`** — `DataTable`'s prop, rendered
by the shared `DataTableCaption` as a visually hidden native `<caption>`. One
strategy, owned by `components/ui/data-table.tsx`; never hand-roll a per-table
answer.

- **Required, not optional**, for the same reason `rowKey` is: a name that can be
  omitted is a name that drifts off. A new table is named or it does not compile.
- **`<caption>`, not `aria-labelledby` at the page `<h1>`.** `Page.Header` renders
  that heading with no `id`, so every call site would have to mint one and keep
  it unique — and a dangling `aria-labelledby` computes an EMPTY name silently.
- **`<caption>`, not `aria-label` on the `<table>`.** ARIA does not get to
  override a native mechanism the element already has.
- **It must be the FIRST element child of `<table>`** — HTML drops a misplaced
  one with no error.
- **Write what the table LISTS, not the page title** — name the columns, e.g.
  "Daftar proposal — nama, sektor, skor, kategori, tanggapan, tanggal masuk".
- A table that does not use `DataTable` still carries a visually hidden caption:
  `app/(app)/proposal/page.tsx` renders `Table` directly with an `sr-only`
  `TableCaption`.

## Which control a list choice gets

Decide by **what the control changes**, never by which component is already built.

- **Changes WHICH ROWS (a filter) → `<Select>` that names its dimension.** Spell
  the "all" option `All statuses`, never a bare `All`: a filter's resting value
  is where most readers learn what it filters. Never a view toggle — it has no
  visible label, so it can only name its dimension to a screen reader.
- **Changes HOW MANY ROWS (page size) → a labelled `<Select>` in the FOOTER**,
  beside the count and the pager.
- **Changes HOW ROWS ARE DRAWN (view, display lens) → `ViewToggle` or `Tabs`.**

**The tell:** if you are writing an `aria-label` to say what dimension a control
is on, the control cannot say so itself — and a filter must.

**When harvesting a constant from a reference repo, read the component that
renders it, not just the value.** A value lifted alone (a page-size array, a
label set) loses the rule it belonged to — the file that owns the convention is
usually one import edge away from where the value is declared.

## Selection and bulk actions

- **The bulk bar mounts on ROWS, not on selection**, and **owns "Select all"**.
  One decision, two payoffs: the bar always has content so it never unmounts
  under the cursor, and a card grid — which has no header row to hang select-all
  on — gets it from the shared bar. The table may keep its own header checkbox
  too, bound to the same handler.
- **Reserve the bar's height** (`min-h-11` for `size="sm"` actions) so the first
  tick changes its contents, not its size.
- **Select-all NAMES ITS SCOPE, visibly, before the first click** — "Pilih semua
  25 proposal di halaman ini", not "Pilih semua". On a server-paginated list the
  control reaches ONE page while the count beside it names the whole filtered set,
  so a bare "select all" beside "Menampilkan 25 dari 87" tells the reader they
  picked 87. The page count in the string is what makes the claim checkable
  against the "25 dipilih" receipt. Every select-all on the surface — bar and
  table header — reads from the same helper, so they cannot disagree.
- **The visible text and the accessible name are ONE string.** Naming the scope
  only in an `aria-label` shows the sighted reader the least true version. Wire it
  with `aria-labelledby` at the visible text node, never a duplicate `aria-label`:
  Chrome folds a wrapping `<label>`'s text into a Base UI checkbox's name, so an
  `aria-label` carrying the same words makes the control STUTTER.
- **Card actions go in `CardFooter`**, not the header's `CardAction` — `Card` and
  `CardFooter` already author the separated strip. `CardAction` is for the card's
  identity affordance (the selection checkbox).

## List page URL state: page size and view

Both are URL state read by the Server Component, so both re-query and re-render
without any client state. No page ships either control today; these are the rules
for the first one that does.

**Which mechanism, and why URL state at all, is the ladder above** (server → URL →
Context → zustand) plus its rule for declaring a URL contract once. This section
covers only what changes when that URL state feeds a **query**: the cost rules
below.

- **A URL param that becomes a query `limit` MUST parse to a closed set.**
  `?pageSize` is not a preference like `?status` — it is a COST INPUT that lands
  in `paginate`'s `limit`, i.e. in documents Firestore bills for. Parse it with
  `parseAsStringLiteral` over a literal tuple, so the type IS the set and anything else falls back to the default. **Never `parseAsInteger`**,
  and a clamp behind one is not a fix: `?pageSize=100000` must not be an integer
  the code path ever holds, and a page that also runs `count()` makes a full scan
  worse. Convert to a number once, at the call site that needs one.
- **The cursor rule splits by what the param changes**, and search-params.ts owns
  both halves so no call site decides:
  - Changes the QUERY (status, sort, search, page size) → a query href, cursor
    **dropped** (`__entities__QueryHref` in the template). For status, sort, and search that is correctness (`paginate`
    refuses such a cursor anyway — the search term is part of the cursor's `scope`).
    For page size it is a product call — `paginate` would accept it, since a cursor
    carries no window size — because a cursor minted at 25 names a boundary a 50-row
    pagination never produces.
  - Changes only the RENDERING (`?view=table|card`) → a render href, cursor
    **kept**. Same rows, same order, same window; resetting paging would take the
    reader's place away to answer a question they did not ask.
- **The empty state belongs to the query, not the view.** Compose it once and
  hand the same node to both branches: "no archived proposals" reads the same in a
  table and a grid. The same node draws differently per view — `DataTable` puts
  it in the body and strips its panel chrome (border, radius); the card grid
  short-circuits to it whole, because there it is the surface.
- **A zero-row table swaps its BODY, never the whole table.** The frame and the
  headers are the surface the reader is filtering; replacing them re-lays-out the
  page, so an empty result reads as a different screen instead of this one with
  nothing in it. It also puts `<Empty>`'s own border inside the table's frame —
  a box in a box. Keep the count and the pager on the page, outside `DataTable`.
- **A card view must carry every column the table shows**, reading the same label
  maps and formatters (WCAG 1.4.10 — data reachable in only one view is data
  someone cannot reach). A card has no column header, so any value whose meaning
  came from one takes the word with it.

## Wrapping a primitive

A wrapper must earn its existence with an **invariant or a contract**, not with
preset props.

- **`ViewToggle`** adds no styling — `toggle-group` already authors the pill
  look (`variant="pill"`: a muted track, the active view raised on it). It
  exists to enforce **exactly-one selection** (Base UI's toggle group emits `[]`
  when the active item is pressed again, and a view toggle must never be empty)
  and to own how a view names itself: `icon` is required and `label` is a
  `string` it renders as visible text beside that icon, so a button is never
  unnamed and a call site never supplies its own markup. `variant="pill"` keeps
  a gap on purpose — `spacing={0}` is the other, segmented mode, and its merged
  borders and shared corners would fight the pills.
- **`ConfirmDialog`** adds no styling — `alert-dialog` is already correct. It
  exists to own **open + pending + `ActionResult`** so no call site re-rolls that
  triple, and to make the footer's button order non-composable (Cancel then
  Confirm — in a destructive dialog that is a safety property, not a style). It
  also forwards the primitive's `finalFocus` for the one case Base UI cannot
  default: a confirm whose success destroys its own trigger. A destructive ROW
  action passes `finalFocus={() => document.getElementById(finalFocusId)}` pointing
  at a `tabIndex={-1}` list wrapper, so when revalidation removes the row, focus
  retreats to the list instead of falling to `<body>`.

Corollary: if the wrapper would only be preset props, don't write it. Pass the
props.

## Row actions

- **A destructive trigger wears `destructive`** — the row button, the bulk-bar
  button, and the confirm inside the dialog. Colour is what separates the
  irreversible action from the one beside it, and it has to say so _before_ the
  click, not after. A neutral trash icon looks exactly like the Edit next to it.
- This is affordable because `destructive` is a **tint**
  (`bg-destructive/10 text-destructive`), not a solid fill — a column of them
  reads as a warning, not a wall of red. **If the variant ever becomes a solid,
  revisit this rule**: the weight is the reason it works.
- **Only the destructive action takes it.** Edit, Download, Cancel, and Clear
  stay neutral in the same group — red means "cannot be undone", and it only
  keeps that meaning if nothing beside it borrows it.
- `destructive` is **opt-in**, never defaulted on.

## Where feedback goes

Split by **where the user's attention is**, not by taste:

- **Failure → inline, next to the action.** The dialog stays open on failure, so
  the explanation belongs on the surface the user is already looking at, and it
  cannot time out before they read it. A `forbidden` error they miss is an error
  they never learn. `ConfirmDialog` does this; `_template.form.tsx` does the same with a
  destructive `<Alert>`.
- **Success → `toast.success()`.** Success closes the dialog and often destroys
  the trigger (a deleted row takes its own buttons with it), so there is no
  inline surface left to write to. The toast is the only thing that can confirm
  it happened, and sonner's live region is what announces it to a screen reader.
  Wire it through `ConfirmDialog`'s `onSuccess`.
- **Forms are the exception, structurally.** The SSR form pattern merges server
  errors back through `mergeForm` and `redirect`s on success, so a form has no
  toast to give — inline is the only option there, not a preference.
- `<Toaster />` is mounted in `app/layout.tsx`, so `toast()` works everywhere.

## Deliberate omissions

Named so their absence reads as a choice, not an oversight:

- **No `loading` prop on `DataTable`.** Loading in an RSC is `loading.tsx` or a
  `<Suspense>` fallback, not a component prop.
- **`DataTableCursorNav` is BIDIRECTIONAL but has no page numbers.** It renders
  both Previous and Next — each a cursor `<Link>` whose token bakes its own nav
  direction (`startAfter` for next, `endBefore` + `limitToLast` for prev, minted by
  `paginate`), and a control renders only when its cursor exists, so it never offers
  a link to nowhere. It still does **not** use `components/ui/pagination`: that
  primitive models page-number pagination (first/last/active, ellipsis windows), and
  an opaque cursor has no total and no random access, so there are no page numbers to
  build — a different model, not a narrowing of that one. `pagination` stays vendored
  for apps that page by offset.
- **No `21–40` range in `countLabel`** — it prints `Showing 20 of 87`, not
  `Showing 21–40 of 87`. Not because the range is impossible: it is
  `count(query.endBefore(cursor)) + 2`, aggregations do honour cursors, and that
  number is honest (re-derived from the cursor every render, so it cannot drift
  the way a page ordinal parked in the URL would). It is omitted because it costs
  a third billed aggregation that — unlike the totals — must carry an `orderBy`,
  dragging in a composite index to decorate a number nobody asked for. The ask
  was "X of X". The full defence and the recipe are in `countLabel`'s doc comment.
- **No sorting on a label column.** A column is sortable **if and only if it
  declares `sortField`** — there is no implicit sortability. Declare it only for
  a column that answers _"which is the most X"_ (dates, amounts, ordered
  statuses). A column that merely identifies a row — name, description, code — is
  not sortable here: alphabetical order looks useful and answers nothing anyone
  came with, and **search** (implemented — see
  `docs/reference/contracts/data.md`) is what serves
  "find this one". That restraint is the standard working, not an omission — every `sortField`
  carries an index bill, argued per column in
  `docs/reference/contracts/data.md`.
- **No `orientation` on `ViewToggle`.** A segmented control is horizontal
  by definition, and the vendored `toggle-group` never forwards `orientation` to
  Base UI (it only paints `data-orientation`), so a vertical variant would style
  vertically while arrow keys still roved horizontally. Better no prop than one
  that lies. Fixing it properly is a commit against `toggle-group`, not here.

## Removal checklist

The state mechanisms are pull-based; there is no "state module" to delete. What
is removable is a dependency.

- **Dropping nuqs:** grep `nuqs` — today it reaches `app/layout.tsx`
  (`NuqsAdapter`), `lib/search-param.ts` (which wraps it) and the
  `features/_template/` list page. Replace each `search-params.ts` with hand
  parsing in the RSC and `<Link>`/`router.push` on the write side, remove
  `NuqsAdapter`, then `pnpm remove nuqs`. **Grep, do not work from a list.** Note
  what you give up: the single URL-contract declaration above.
- **Dropping `@tanstack/react-table`:** nothing outside comments references it
  today; `pnpm remove @tanstack/react-table`.
- `pnpm typecheck && pnpm templates:check && pnpm build:ci` must be green
  afterwards (no dangling imports).

Use `trash` (recoverable), never `rm`.
