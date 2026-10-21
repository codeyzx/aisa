# Module boundaries

- Type: normative contract (reference)
- Owns: where a module may live and what it may import — the `lib` / `features` / `app` layering, the client/server boundary, module shape, and which machine check enforces each rule
- Source of truth: `scripts/structure/registry.ts` + `scripts/structure/checks/*.ts` (the compiler-graph checks), `rules/*.yml` (the ast-grep rules), `scripts/structure/exemptions.ts` (the tracked debts)
- Verified by: `pnpm structure:check` and `pnpm lint:rules` (both are inside `pnpm check:static`, and so inside `pnpm verify`)
- Read when: adding a module or a directory, moving code between `lib/`, `features/` and `app/`, adding an `index.ts`, marking something `server-only`, or forking the persistence layer
- Does not define: what a guard, an action, a repo or a capability MEANS — those belong to [auth](auth.md), [data](data.md) and [capabilities](../capabilities.md). This file only states where the code may sit and what may point at it.

Every rule below is **machine-enforced**. If a rule here has no named check, it is not a rule
in this file — it belongs to the contract that owns the concept. That is the whole point: these
are the properties that typecheck, lint and build **perfectly green** while being broken, and
whose breakage only surfaces in someone else's fork, months later.

## The two enforcers

- **`pnpm structure:check`** (`scripts/structure/check.ts`) loads the TypeScript program from
  `tsconfig.json` **once** and runs every registered check over the **resolved** import/export
  graph. This is why an alias (`@/features/x`) and a relative climb (`../features/x`) are the
  SAME edge — both resolve to the same file and are classified by where that file lives, never
  by how the importer spelled it. A regex over source text cannot see that.
- **`pnpm lint:rules`** (`ast-grep scan`, `rules/*.yml`) holds the rules that are cheap as a
  syntactic pattern. Where a rule exists in both places, the compiler check is the authority and
  the ast-grep rule is the fast, spelling-level twin.

`_template.*` files are excluded from the tsconfig program, so no `structure:check` rule sees
them. Their compile-time proof is `pnpm templates:check` instead.

## Layering: three tiers, one direction

- **shared** — `lib/`, `components/`, `hooks/`. Domain-agnostic infrastructure. Nothing here
  knows what an "asset" is.
- **feature** — `features/`. The domain, one folder per entity.
- **app** — `app/`. Delivery and composition: routes, pages, the example surface.

The forbidden edges, enforced by **`import-direction`**:

- shared MUST NOT import feature or app.
- feature MUST NOT import app.
- app may import anything.

**Type-only edges still count.** An `import type` from shared into a feature couples the shared
layer to the domain shape exactly as a value import does — swap the feature out and it no longer
builds, which is the property the tier exists to buy.

The ast-grep twins are `no-import-feature-or-app-from-shared` and `no-import-app-from-feature`.

**Core MUST NOT import from `app/(app)/(examples)/`** — enforced by the ast-grep rule
`no-import-example-from-core`. The example surface is deletable by contract; a core file
importing one breaks a downstream project's build the day they delete what this starter told
them to delete, and it lands on the person with the least context to diagnose it. The direction
is deliberately one-way: an example importing core is the entire point of an example.

## The client/server boundary

- **`client-server-boundary`** — no `server-only` module is reachable from a `'use client'`
  entry through value imports. The walk is the RUNTIME client-bundle graph and it respects two
  cuts: `import type` edges are erased before bundling and are not followed, and a `'use server'`
  module is an RPC boundary (the client receives stubs; the action's own imports never reach the
  browser), so the walk stops there rather than descending — descending past it is the classic
  false positive. Next catches this at build too, but only once the offending path actually
  renders; this proves it statically over the whole graph.
- **`direct-server-only`** — every module that VALUE-imports `firebase-admin` (or a
  `firebase-admin/*` entry point) or `next/headers` must `import 'server-only'` **directly**, not
  lean on a transitive marker or on `'use server'`. The mark is a build-time tripwire, and
  requiring it directly is what stops a future refactor from quietly dragging admin credentials
  toward the browser. Type-only imports are erased and do not require the mark. Exempt by
  construction: `scripts/**` (standalone Node CLIs, never bundled) and app-router framework
  entries under `app/` (`page`, `layout`, `route`, `loading`, `error`, `not-found`,
  `global-error`, `default`, `template`) — Next guarantees those never ship to the client.
- **`contract-purity`** — a `*.contract.ts` is the pure, serializable shape shared across the
  RSC boundary, so it must be importable from a client bundle with no server runtime behind it.
  It may not mark itself `server-only` (that is a contradiction), may not value-import a
  server/node runtime (`firebase-admin*`, `next/headers`, `next/cache`, `next/navigation`,
  `next/server`, `node:*`, `fs`, `path`, `crypto`, `os`, `child_process`), and may not
  value-import a local module that is itself `server-only`. Type-only imports are erased, so a
  contract may name types from anywhere.

## Module shape and naming

- **`no-wildcard-barrel`** — `export * from '…'` is banned tree-wide. A wildcard re-export hides
  what a module publishes, and a renamed or deleted symbol re-appears silently through the star.
  Re-export by name. `export * as ns from` has an explicit binding and is not flagged.
- **`index-allowlist`** — every `index.ts` / `index.tsx` must be on the explicit allowlist in
  `scripts/structure/checks/index-allowlist.ts`. Barrels erode legibility: the importer can no
  longer see where a symbol lives, and a folder-as-module grows into a grab-bag. Adding an entry
  IS the review gate — justify the folder-as-module first.
- **`reserved-framework-names`** — app-router entry filenames (`page`, `layout`, `loading`,
  `error`, `not-found`, `global-error`, `default`, `template`, `route`) are legitimate only under
  `app/`, and `proxy.ts` only at the repo root. A `page.tsx` sitting in `lib/` makes the router
  inventory ambiguous to humans and tools alike. A shared UI primitive takes a descriptive name.
- **`one-surface-per-url`** — no path segment under `app/` may be a parallel-route slot (`@slot`)
  or an interception marker (`(.)`, `(..)`, `(..)(..)`, `(...)`). Both exist to render a URL as
  something other than its own page, which means the same URL answers differently depending on
  how the reader arrived — so the surface is implemented twice, and the two copies' guards,
  `returnTo` validation and metadata are then free to drift apart. Ordinary route GROUPS —
  `(app)`, `(examples)` — are untouched: they organise files without changing a URL. A dialog is
  still fine; open it from client state.

## Boundaries this file enforces, semantics owned elsewhere

These are structure checks, so their **enforcement** is stated here; the rule they encode is
argued in the contract named after each.

- **`route-guard-inventory`** — every `app/(app)/**` `page.tsx` imports AND calls an auth guard.
  The guard names are read off the tree (the exported functions of `lib/auth/guards.ts`, plus
  `requireSession`), so a new guard is picked up automatically rather than hard-coded. Shallow by
  design: it proves a page names a guard, not that an ancestor layout guarded it. → [auth](auth.md)
- **`collection-path-constant`** — every `typedCollection` / `typedCollectionGroup` /
  `rawCollection` receives its path as a named constant, never an inline literal, so one
  collection has one spelling. The raw hatch is covered too: it addresses the same documents
  under the same path, in the code paths a reader visits least. Whether bypassing the converter
  was justified is `converter-bypass`'s question, not this one. → [data](data.md)
- **`public-path-match`** — every literal `href` in `app/navigation.ts` and
  `components/shell/nav-config.ts` resolves to a real `page.tsx`, so deleting a route cannot
  leave a sidebar link pointing at nothing. One direction only: a route with NO nav entry is
  not a violation, and an href built at run time is invisible to it. → [auth](auth.md)
- **`ready-session-boundary`** — only `lib/auth/session.ts` (which defines them) and
  `lib/auth/guards.ts` (which wraps them) may import `getSession` / `requireSession`. Everything
  else goes through the ready-session gate, or records a named exemption saying why it must not
  redirect. Test files may drive any boundary directly. → [auth](auth.md)
- **`action-wrapper-shape`** — every exported top-level function declaration in an action file
  (`**/*.action.ts`, `app/**/_actions.ts`) wraps `runAction` / `runFormAction`. Those files are
  `'use server'`, so every export is a browser-reachable RPC entry point and the wrapper is where
  the server-side capability check runs — an unwrapped export is an unauthenticated one, and it
  typechecks, lints and builds green. → [data](data.md)
- **`single-operation-entry`** — within one action file, no operation is exposed through both a
  form entry (`<verb><Entity>FormAction`) and a programmatic one (`<verb><Entity>Action`).
  Identity is the name with its kind suffix stripped. Two entries fork one write behind two
  independently reachable RPC endpoints that can drift. → [data](data.md)
- **`capability-completeness`** — the `CAPABILITIES` declaration in `lib/auth/rbac.ts` is
  mechanically complete in BOTH directions. Used ⊆ declared: every capability string at a call
  site (`requireCapability`, `runAction`, `can`, `roleCan`, or a `capability:` option) is a
  member of the declared set. Declared ⊆ used: every declared capability is enforced somewhere,
  so a dead capability cannot linger in the grant table naming an authority nothing checks.
  → [auth](auth.md)
- **`converter-bypass`** — no collection reference is minted off the raw Admin handle:
  `collection`, `doc` and `collectionGroup` on `adminDb()` (or on a local bound to it) are
  flagged, so every reference carries its Zod converter. `adminDb().runTransaction(…)` is
  deliberately NOT flagged — it is how a repo makes a multi-document write atomic, and the refs
  inside it still come from the typed accessor. The single structural exception is
  `lib/firebase/collections.ts`, which is where the converter is attached. Unvalidated reads
  remain possible on purpose through the named `rawCollection` hatch, because deletion and repair
  must work on a document the schema rejects; what the check buys is that every such read has a
  greppable NAME. → [data](data.md)
- **`collection-path-constant`** — the path handed to `typedCollection` / `typedCollectionGroup`
  is an identifier, never an inline string literal, so a collection has exactly one spelling and
  anything else that needs the path imports it. Scoped to the whole program with no path
  predicate: feature and infrastructure callers alike already pass a constant, so there is no
  tier where an inline path is legitimate. It proves the call site NAMES a constant — not where
  that constant lives, not that two constants differ, and not `rawCollection`, which is audited
  by name under `converter-bypass`. An interpolated path is not flagged: a nested path assembled
  from constants is the compliant shape. → [data](data.md)
- **`no-hardcoded-collection-path`** (ast-grep) — a collection path is never a string literal at
  a call site; reach it through the accessor a feature owns. This is the rule a model trained on
  Firestore tutorials is likeliest to violate, and it fails silently: a typo'd literal reads an
  empty collection rather than throwing, so the symptom is "no results", not an error.
  → [data](data.md)
- **`cli-safety`** — two assertions over `scripts/**`. No script may shell out to a raw `rm` /
  `rmdir` or a `find -delete` (deletion goes through `trash` or a scoped `node:fs` call). And a
  script that BOTH can reach a database — an Admin-SDK import edge, or a string addressing an
  `/emulator/v1/` admin endpoint, followed transitively — AND performs something mutating (a
  mutating method name, or a state-changing HTTP `method:`) must import one of the two sanctioned
  gates from `scripts/_safety.ts`: `requireProjectIdConfirmation` or `requireEmulatorTarget`. A
  gate is recognised as an IMPORT EDGE precisely because hand-rolled `if (!host) process.exit(1)`
  control flow is invisible to a structure check. The assertion is deliberately
  over-approximate — a `map.set(…)` in a file that also reaches the SDK counts — because the
  wrong failure mode is "a wipe slipped through", never "a script was asked to declare a gate it
  did not need". → [operations](operations.md)

## Exemptions are named files, never globs

An exemption lives in `scripts/structure/exemptions.ts` and silences **one check on one file**,
carrying an owner, the phase whose landing retires it, and the reason the current-tree violation
is acceptable. A broad glob would blind a whole check, so there is no glob form. A green run
therefore means "no un-exempted violation", and every exemption is a visible, argued IOU. When a
check over-approximates onto a file that genuinely does not need the rule, the answer is an entry
here — never a loosening of the check.

## What survives a persistence swap

For a fork replacing Firestore: everything above is database-agnostic **except** three rules that
name Firestore concepts directly — `converter-bypass` (the `adminDb()` handle and the Zod
converter), `no-hardcoded-collection-path` and `collection-path-constant` (collection paths, at
the raw handle and at the typed accessor respectively). Those three are the checks a swap must
re-aim at the new client, not delete: the property they buy — reads are validated, and a path
literal never appears at a call site — is what the new data layer has to keep. The layering,
client/server, module-shape, guard, action and CLI-safety rules are untouched by the swap and are
the reason the rest of the tree still builds while the data layer is being replaced.
