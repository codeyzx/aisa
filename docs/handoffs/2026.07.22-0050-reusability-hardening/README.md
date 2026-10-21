# Reusability Hardening And Fork Audit Handoff

## Handoff Metadata

- Sequence: `0050`
- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Created: `2026.07.22`
- Parent: `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- Status: `COMPLETE — every finding closed, residuals named below`
- Next action: Nothing in this train is blocking. All twenty findings are closed with per-finding commits and driven evidence; see "Execution Record" at the end of this file, and read a phase's record before reopening its area — four findings (`R09`, `R10`, `R12`, and the `R08` half of `R11`) did NOT survive contact with source as written, and one (`R13`) understated. Measure before building. What is deliberately NOT proven, and should be picked up by someone with the environment: (1) the **env fail-fast** has no evidence at all — proving it means moving `.env` aside, which the lead's workstation tooling refuses; (2) the **storage rows** — a real browser PUT, the CORS preflight, and backend oversize rejection — remain undrivable here, as `R14` recorded; (3) an **intermittent e2e failure** in `assets.spec.ts` at "click Aset baru → URL becomes `/assets/new`", seen once in nine and not reproduced, unowned; (4) the pre-existing `test/integration/admin-lease.test.ts` flake under parallel emulator load, likewise unowned and not reproduced across four runs; (5) nothing requires or checks a **nav entry** for a capability-gated route, so a scaffolded entity is reachable only by typing its URL with every gate green; (6) the stale `firestore.rules` carve-out and orphaned dependencies a feature removal leaves behind are documented, not gated.

## Purpose

This baton turns the reusability review into an executable hardening train. The desired
result is not a generic CRUD framework. It is a starter where the standard entity path
owns the repeated mechanics once, while an unusual entity can replace a repo, action,
form, page, or policy without fighting the core.

The PostgreSQL review companion is
`docs/handoffs/2026.07.22-0050-reusability-hardening/postgresql-fork-audit.md`.
Use it to audit the sibling fork by invariant and observed evidence, not by copying
Firestore implementation details.

## State

- The source repository was clean at `main` before this handoff diff on `2026.07.22`; the expected planning worktree contains only this handoff, its index, and manifest registration.
- The planning baseline is `13b02848236545c5e477c7c957ecd3083152892b`.
- Existing tags are immutable: `postgresql-fork-base-v1` peels to `b74fb503a52bc9a1e3e5ce47b7f3bf9c3a56fb63`, and `postgresql-fork-candidate-v1` peels to `46f432cf211d59a176ea0b160b08a615aef70c31`. The parent handoff records the official base evidence; do not move either tag.
- `docs/handoffs/2026.07.22-0040-postgresql-candidate-execution/README.md` remains the related cross-repository execution baton, not this handoff's active parent.
- The audit found strong low-level foundations: typed persistence accessors, action envelopes, server-authoritative auth, structural checks, emulator integration, container smoke, and driven verification doctrine.
- The audit also found that a normal feature still copies CRUD/action/UI orchestration, and found correctness defects in auth concurrency, capability composition, storage runtime behavior, and removal source-of-truth.
- No source implementation for this train has started. This handoff is the execution contract, not evidence that any listed fix is landed.

## User Outcome

A consumer adding a standard Firestore entity should provide only:

- The entity schema and input projection.
- Field presentation and table columns.
- Query/filter/sort policy when it differs from the default.
- Authorization policy when one capability is insufficient.
- Domain-specific transactions and side effects.
- Application composition such as a navigation entry.

The consumer should not copy timestamp/deadline CRUD mechanics, action envelopes,
audit/revalidation plumbing, cursor serialization, form server-action integration,
create/edit page framing, or delete result handling.

The escape hatch is explicit replacement of a repo, action, form, page, or policy. The
core must not become a `BaseCrud` with dozens of flags.

## Locked Decisions

- Keep Firebase Auth, session cookies, RBAC, revocation, impersonation, and account policy as a separate product seam.
- Keep Firestore as the working persistence implementation in this repository.
- Preserve `schema -> repo -> action` and the one-entry-per-operation rule.
- Extract only mechanics proven by the reference asset feature and a generated second feature. Do not build speculative cross-database abstractions in this train.
- Use composable helpers and complete scaffolds, not a runtime entity registry that auto-generates every screen.
- Keep query policy, transaction semantics, derived fields, row-level authorization, and side effects feature-owned.
- Standard baseline is CRUD plus status filtering and cursor pagination. Search, bulk operations, storage, export, and realtime remain opt-in extensions.
- Refuse admin-surface self password reset and self session revocation server-side. A future explicit personal "sign me out everywhere" flow is separate product work.
- Make the rate-limit store contract asynchronous; the documented distributed-store replacement must be implementable without another public API change.
- Enforce digest-shaped production image references and digest-pin base images. Do not weaken the claim to preserve tag-based behavior.
- Make snapshot commands use migration tooling's exact precedence: exported environment, then `.env.local`, then `.env`.
- Do not restore intercepted routes, parallel modal slots, or duplicate URL surfaces.
- Do not edit the PostgreSQL workspace from this lead. PostgreSQL receives invariant/test intent through its own lead and the companion audit guide.
- Do not move, retag, push, deploy, read secrets, or claim driven behavior without observing it.

## Finding Register

This register is the canonical mapping from the `2026.07.22` source review into this
train. Each ID stays open until the owning phase records a fix commit and evidence.

- `R01` Phase 1: concurrent custom-claim writers can lose or restore authority. **CLOSED** `1f90406` — per-uid Firestore claims lease (`lib/auth/claims-lock.ts`) held across `setAccountClaims`'s whole read-merge-write. Emulator-driven and adversarially verified: the concurrency test fails with the exact clobber (`{role:admin}` vs `{role:user}`) when the lease is bypassed. Residual: writers OUTSIDE this app (Console/gcloud/other Admin-SDK process) — Firebase Auth has no compare-and-set, same declared residual as `admin-lease`.
- `R02` Phase 1: admin self password reset/session revocation can remove the actor's usable session or credential. **CLOSED** `4e5977c` — server-side `ForbiddenError` refusal in `resetAccountPasswordAction` and `signOutAccountSessionsAction`; emulator-driven.
- `R03` Phase 1: independent admin capabilities are composed as if they always coincide. **CLOSED** `cd16dcb` — every admin card/link/button gates on its specific capability (server gates were already correct; this made the UI honest). Residual: a split role with `admin:users:read` but not `impersonation:start` sees an eligible row's disabled button with no reason text — not reachable under the default roles.
- `R04` Phase 1: an impersonation ticket can survive a fallback state and resume later. **CLOSED** `39b488c` — stop clears the overlay cookie unconditionally, including from a no-impersonator fallback (wrong-actor/expired/tampered ticket); pure unit test.
- `R05` Phase 1: final-administrator retention hard-codes the `admin` role. **CLOSED** `4e5977c` — `RETAINED_ADMIN_CAPABILITY` + `isRetainedAdministrator` (rbac.ts); count and both refusals read the capability; unit + emulator.
- `R06` Phase 1: exported async variable actions escape wrapper-shape checks. **CLOSED** `b05308f` — both the ast-grep rule and the structure-check port now match the `export const NAME = async () => …` shape; rule-tests + structure fixtures.
- `R07` Phase 1: password transition, Auth outage classification, and future `auth_time` boundaries lack direct proof. **CLOSED** `9b53563` + `bbb214a` + `04f0eb8` — future-timestamp rejection fixed and unit-tested via the extracted pure `lib/auth/reauth.ts`; Auth-outage-vs-lookup-miss classification proven (`account.repo.test.ts`, 12 cases); and the end-to-end flow is now driven (`test/integration/password-action.test.ts`). The residual regression-test debt is paid: the token is minted for real by signing in against the Auth emulator, and the happy path asserts the credential swap (new password signs in, old fails), the cleared `mustChangePassword` claim, the advanced revocation marker, the settled audit event, and the redirect to /login — with refusals for unauthenticated, impersonated overlay, short password, uid mismatch, and an account that does not owe a change. Only `getSession`/`cookies`/`redirect` are stubbed (the request context vitest lacks); the token gate runs against the emulator. Ran green in the full 7-file integration suite (111/111) on Node 24.12.0, not the container's 24.18.0 — but this suite is Auth/Firestore behaviour, not runtime-sensitive.
- `R08` Phase 5: generated entities silently retain `asset:write`. **CLOSED** `e0b1581` — the templates gate on two consts in a feature-owned `__entity__.capability.ts`, annotated `: Capability`. Because that union is closed, a fresh copy does NOT compile until its names are declared in `lib/auth/rbac.ts` — the loud failure the register asked for, and the one design that cannot ship a working default without shipping somebody else's authority. The annotation is load-bearing and was arrived at by driving: `satisfies` keeps the literal type and pushed the same error out to all nine call sites; `: Capability` (the form `RETAINED_ADMIN_CAPABILITY` already uses) lands it in one file. `templates:check` supplies the two halves tsc cannot: it refuses any capability `CAPABILITIES` already declares — read from that array, so it follows a fork that renames the reference feature — and it partitions tsc output so the generated entity's own capability error is EXPECTED while anything else is still drift. Driven both ways: restoring `'asset:write'` names the template and the capability; an injected type error still fails the run.
- `R09` Phase 3: repo/action CRUD mechanics are copied rather than core-owned. **CLOSED** `c73dc1c` — the copied surface was measured rather than assumed and proved much smaller than this register and `reusability-model.md` both claimed: `count`/`deleteMany` exist only in the asset repo (the template has neither) and `delete` is copied in name only, so those are asset behaviour, not mechanics. What genuinely repeated now has one owner — `stampCreated`/`stampUpdated` (`lib/data/stamps.ts`), `requireFound` (`domain-error.ts`), `toFormErrors` (`form-validation.ts`) — as small pure functions the repo calls explicitly (composable helpers, deliberately NOT a factory or an options bag). None owns a transaction, query, capability or side effect, so asset keeps its counter read, its conflict precondition and its search-prefix dual-write. Acceptance met as specified: renaming the key `stampCreated` returns fails BOTH `features/asset/asset.repo.ts` and the generated `widget.repo.ts`. Also closed a real coverage hole it exposed — attachment CLEARING (a present-but-undefined patch key) had no test at any level and is the exact behaviour `stampUpdated`'s plain spread protects. RESIDUAL: the CLIENT form bridge and the toolbar/URL layer are still copied per feature; they are delivery-shell work and belong to `R10`, not here.
- `R10` Phase 4/5: the advertised vertical scaffold creates no list/form delivery surface. **CLOSED** `45921ed` + `68a26b6` + `ad01e1c` — the finding was half right and the wrong half mattered. Its premise, that the client form bridge is "hand-copied per feature and route", did NOT hold on source: the `useActionState` + `useTransform(mergeForm)` wiring existed in exactly ONE production file, since `impersonate-row.tsx` uses bare React `useActionState` and the login/admin account forms use client-only `useForm` with no server merge. What WAS true is the second half: `features/_template/` held six `.ts` files and zero `.tsx`, so nothing had been copied because there was nothing to copy into. Delivered accordingly — `useServerForm` (`hooks/use-server-form.ts`) owns the action binding and the server-answer merge, `formErrorText` (`lib/data/form-validation.ts`) owns the form-wide message read, and the template gained a form, a URL/href module, and list/create/edit routes. Acceptance met as specified: renaming a key `useServerForm` returns fails BOTH the generated `widget.form.tsx` and `asset-form.tsx`, in two independent gates; renaming a `search-params` export fails the generated `widget.page.tsx`. Extraction was justified by SUBTLETY rather than count — the second writer of that merge gets it wrong, which is why the naive `String(errors[0])` shipped a literal "undefined" alert. RESIDUAL: the toolbar/URL layer for a CUSTOM list is still per-feature and its gap is unmeasured — treat it as a claim to check, not a finding, given that this row and `R09` both overstated. Nothing here is browser evidence: templates render nowhere and `templates:check` is tsc-only.
- `R11` Phase 3/5/6: programmatic IDs, collection paths, templates, and index instructions are incompletely validated. **PARTIALLY CLOSED** `36d3e69` — the unresolved-placeholder half is done, and it was not hypothetical: `__Entities__` (PascalCase plural) was never a substitution token, so `_template.repo.ts` shipped `List__Entities__Args` and `list__Entities__` LITERALLY into a forker's generated repo, and `templates:check` passed anyway because an unresolved token is a valid identifier — a defect tsc structurally cannot see. The token now resolves, and generated output is scanned for any leftover `__token__` BEFORE the typecheck. Proven by deleting the substitution again: the scan names both identifiers and the run fails. `__name__` is exempted BY NAME (Firestore's document-id field path, used in `orderBy('__name__')`) rather than by widening the pattern, since a sentinel and a placeholder are structurally identical. **CLOSED** `46e2997` + `392b8b4` — the rest landed in Phase 5. Collection-path validation is a structure check (`collection-path-constant`): every `typedCollection`/`typedCollectionGroup` path must be a named constant, scoped to the whole program because measurement found no tier where a literal is legitimate. It runs over BOTH the repo tree and the generated entity, which is also the answer to "nothing checks a forker's copy" — their copy lands in `features/<entity>/`, where `structure:check` already covers it; what was missing was that the TEMPLATE was checked by nothing, and `templates:check` now runs five contracts over the generated tree. The index instruction is exact rather than over-broad: the template names the one index shape its own query issues, `test/integration/template-widget.test.ts` drives that query, and `indexes:check` therefore requires it — which is how the requirement stopped being a comment. RESIDUAL: `check-templates.ts` deliberately runs five of the sixteen registered checks, not all; the rest resolve their vocabulary from repo files and would report a pass having inspected nothing, which is recorded in the code beside the list.
- `R12` Phase 6: feature/capability add-remove operations depend on undocumented docs-generator lists. **MEASURED, PARTIALLY TRUE** — the "undocumented" half holds; the "silent" half mostly does not, and the finding's named suspects are not feature-keyed at all. `scripts/structure/exemptions.ts` names four files, none keyed on a feature, entity, capability or route; `scripts/docs/exemptions.ts` is empty; `rules/*.yml` carry globs only; `check-templates.ts` reads `CAPABILITIES` from source. Three lists really do force an edit — `LAYOUT_NOTES` (a new `features/<entity>/` directory), `EXPECTED_GRANTS` in `lib/auth/rbac.test.ts` (a new capability), and `scripts/setup-local.ts` (deleting the reference feature) — but every one of them fails LOUDLY inside `pnpm verify`, naming the file and the fix. Genuinely silent, and narrower than the finding: `ENV_GROUPS` (**CLOSED** `edd29f0` — a runtime module reading `process.env` outside a declared schema now fails `docs:check` by name), the absent reverse check on `CAPABILITY_NOTES`/`CLIENT_CAPABILITY_NOTES` (generator litter, not a stale doc), and the total absence of any nav-entry requirement — nothing checks that a capability-gated route HAS a nav entry, so a new entity is reachable only by typing its URL and every gate stays green.
- `R13` Phase 6: removing asset leaves setup, seed, tests, E2E, and generated-layout coupling. **CLOSED** `958280c` + `09ad82f` — and unlike `R09`/`R10`/`R12`, this finding UNDERSTATED the problem. Driven: the vertical was actually deleted in a disposable worktree and every gate run in order. It is 55 files removed and 14 edited; the checklist's four `trash` targets cover 53 of the 55, so the deletions were fine and the EDITS were the gap — it named five of the fourteen. Nine were found by a failing gate, and two of those are rewrites rather than import removals (`scripts/setup-local.ts` derives its whole "already seeded" decision from the asset count; the three test files that spell a capability only fail AFTER the rbac edit, so grepping first cannot find them). The checklist also said five layers while listing six, named one `assets` index block where there are thirteen, and predicted an `e2e/target.ts` edit that does not exist. It never mentioned `firestore.rules`, which keeps a named carve-out granting client reads on a collection that no longer exists — through a fully green `pnpm verify`. Also recorded now: the capability the deletion orphans (`export:read`, which `capability-completeness` does catch), three dependencies whose last consumer leaves with the examples, and the generated layout doc that keeps naming `features/asset/` until the deletion is STAGED, because the generator reads the git index rather than the filesystem. Separately fixed: `structure:check` analysed ZERO files when pointed at a `.claude/worktrees/` root and reported `OK — every architecture contract holds`, which is exactly where the removal how-to sends a reader — 0 source files became 340. RESIDUAL: the stale `firestore.rules` carve-out and the orphaned dependencies are documented, not gated; nothing mechanically reports either.
- `R14` Phase 2: presigned storage endpoints and CORS are not browser-safe in the Compose path. **CLOSED** `ffb58e5` — `S3_PUBLIC_ENDPOINT` splits browser addressing from server addressing (optional, defaults to `S3_ENDPOINT`); `presignClient()` mints URLs against it, `s3Client()` keeps copy/delete/put. `compose.env` points it at the published host port, so the containerized upload path is addressable at all for the first time. Content-length signing was TRUE but unproven — driven and now asserted. RESIDUAL (documented in `storage.md` "Not proven here"): a real browser PUT, the CORS preflight, and the backend actually rejecting an oversize body are undrivable here; no CORS is configured for the local SeaweedFS stack, and its failure mode is browser-only while `pnpm verify` stays green.
- `R15` Phase 2: copy-success/delete-failure can strand durable objects without durable recovery evidence. **CLOSED** `05ffca1` — `moveObject` classifies the two partial failures: an ambiguous copy (S3's 200-with-error-body) throws WITHOUT reaching the delete, and a delete failure after a good copy returns `sourceDeleted: false` instead of throwing. The old throw escaped the action's compensating catch entirely, since `promoteAttachment` runs before the doc write. Unit-driven with the SDK replaced.
- `R16` Phase 2: shared error boundaries swallow failures before monitoring, and the scrubber is not a full allow-list. **CLOSED** `e268b14` — `reportError` seam called from `runAction`'s catch-all and `apiFailFrom`'s INTERNAL branch only; expected denials/Zod/DomainError/classified provider conditions are asserted NOT reported. `event.extra`/`tags`/`contexts` and `breadcrumb.data` rebuilt as allow-lists with fixtures. Seam is `server-only` so `lib/data`/`lib/api` never import the SDK — proven by a full `pnpm build`.
- `R17` Phase 2: Firebase token-provider outages are reported as invalid credentials. **CLOSED** `927126e` — `isDefinitiveTokenRejection` (allow-list, mirrors `isDefinitiveLookupMiss`); `getSession` returns null only for a definitive rejection and THROWS on an outage, so a Google-side outage no longer signs active users out. Adversarially verified: restoring the bare `catch { return null }` fails exactly the five outage cases.
- `R18` Phase 2: CSV stream failures, synchronous rate-limit storage, and dotted API paths violate their contracts. **CLOSED** across three commits — `286344d` (CSV mid-stream failure ends the file with a `__EXPORT_TRUNCATED__` row carrying the cid; `correlationId` now required on every `downloadResponse`), `191ad1b` (`RateLimitStore.hit` returns `Promise<Counter>`, driven by a store that genuinely resolves later), `a2808d6` (dedicated `/api/:path*` matcher entry; the defect was in the matcher, which no test calling `proxy()` could see, so the new tests assert the matcher itself).
- `R19` Phase 2: AI provider construction and realtime principal identity lack direct proof. **CLOSED** `08639f8` + `cef01b2` — `inferenceModel()` driven against a mocked `@ai-sdk/anthropic` (enable gate, explicit key threading via a divergence probe, `DEFAULT_MODEL` binding) plus a new `ai/config.test.ts`; realtime stream keys now carry the uid so two principals cannot share a module-Map slot. NOTE: the audit's premise for the AI half was inverted (the mock model lived in `provider.test.ts`, not `model.test.ts`) — the register records what the code actually did. RESIDUAL: the realtime fix keys on the FIREBASE AUTH principal only; impersonation is a server-only cookie overlay that never changes the client's Auth user, so it does not re-key a live stream — stated in `realtime.md` rather than implied as covered.
- `R20` Phase 7: deployment digest, snapshot env, rule fixtures, CI/docs, locale, capability, and layout claims drift from source. **CLOSED** `408b1ea` + `d3139d7` + `7f5dacd` + `ba80df6` + `ad67059` — six pieces, and only three of them were the drift the finding described. (1) The digest requirement is now checkable: `pnpm image:check` refuses an `APP_IMAGE` that is not `<name>@sha256:<64 hex>`, resolving it the way COMPOSE does (exported environment, then the project `.env`, never `.env.local`) rather than the way the rest of the repo's CLIs do — checking a variable somebody else resolves means resolving it their way. Driven unset / tag / digest. Base images stay tag-pinned, stated as its own claim with the reason: a digest cannot interpolate the `NODE_VERSION` build argument. (2) The snapshot CLIs read `FIREBASE_PROJECT_ID` off the exported environment only and fell back to `demo-aixel`, so a checkout configuring the project in `.env.local` would export a snapshot of the demo project; the precedence now has one owner, and the migration runner's 60-line hand-rolled `KEY=VALUE` parser is gone because `process.loadEnvFile` already implements the rule it was hand-writing. (3) Two of five ast-grep rules had no fixtures; both new files were proven by breaking the rule they cover. (4) The testing contract claimed CI runs `pnpm test && pnpm indexes:check` and that `test:emulator` is "the exact command CI runs" — neither was true. (5) Four doc claims across locale, layout and chunked-delete did not survive source, including a "chunked delete" that is the opposite of chunked and a `chunk` helper listed as reused that has no production caller. (6) MOST of the claims measured HELD and were left alone — the capability inventory family entirely, which is the finding's half that did not survive.

## Key Files

- `features/_template/**` and `scripts/check-templates.ts`: current copy/check boundary and generated fixture source.
- `features/asset/**` and `app/(app)/(examples)/assets/**`: custom reference behavior that must survive extraction.
- `lib/data/**`, `lib/list-toolbar/**`, and `components/ui/data-table.tsx`: candidate shared mechanics.
- `lib/auth/**`, `lib/actions/**`, and `app/(app)/admin/**`: Phase 1 security and policy surface.
- `lib/storage/**`, `lib/api/**`, `lib/http/**`, `lib/observability/**`, and `proxy.ts`: Phase 2 runtime boundaries.
- `scripts/docs/**`, `scripts/structure/**`, `rules/**`, setup/seed/E2E, and capability contracts: add/remove and drift enforcement.
- `docs/how-to/verify-change.md`: canonical green-plus-driven procedure.
- `postgresql-fork-audit.md`: downstream `S/F/P` audit and replay gate.

## Blockers / Open Questions

None blocking. Product and architecture decisions needed to start are locked above. Stop only
when source evidence contradicts a locked premise or a proposed extraction cannot preserve the
custom asset path without condition-heavy configuration.

**Open, parked for its own investigation — route-driven modals.** The lead asked on 2026-07-24
whether requiring JavaScript re-opens intercepted/parallel modal routes, on the understanding
that no-JS support had been an earlier mistake. Two things were measured before answering, and
both survived:

- The app ALREADY requires JavaScript and already says so. `app/layout.tsx` carries the
  `<noscript>` notice, and both `e2e/unhydrated.spec.ts` and `e2e/admin-create-no-js.spec.ts`
  were rewritten on 2026-07-22 to block the BUNDLE rather than disable scripting. The floor
  those tests hold is hydration, not JavaScript. So nothing about the JS requirement is new,
  and no test or gate needs retiring for it.
- Requiring JavaScript does not answer either reason `one-surface-per-url` exists. A Base UI
  dialog resolves its portal container in a layout effect, so a server render of a `defaultOpen`
  dialog returns the empty string — a hydration problem the JS requirement does not touch. And
  every intercepted route ships a full-page fallback behind it, so each guard, each `returnTo`
  validation and each `generateMetadata` decision exists twice and the two copies are free to
  drift. That duplication cost is unchanged.

The check therefore stays enforced. Re-opening it needs its own evidence: that an intercepted
route can render correctly under this dialog primitive, and that the fallback duplication can be
avoided rather than merely accepted. Client-state dialogs (`ConfirmDialog`) were never blocked
and remain the sanctioned way to show one.

## Scope And Phases

### Phase 0: Baseline And Contract

Write the target consumer contract in the owning documentation layer, inventory the
current asset touchpoints, and create a disposable fixture harness that can materialize
the current generated `Widget` data/action slice. Record which behavior is shared,
Firestore-specific, or domain-specific. The fixture harness is test infrastructure; it
precedes and informs the official vertical scaffold in Phase 5.

Done when the lead can name the files a standard entity owns and the files core owns,
without introducing code changes that depend on the future abstraction.

### Phase 1: Auth And Authorization Safety

Fix and test:

- Serialize every custom-claim read-modify-write by UID, including role and password-state writers. Preserve unrelated claims.
- Refuse admin-surface self-target password reset and self-session revocation. The server is the boundary; hiding the button is not enough.
- Compose admin cards, links, and pickers under their own capabilities. Test read-only directory, audit-only, admin-without-impersonation, and impersonation-only combinations where policy permits them.
- Move final-administrator retention to one RBAC-adjacent policy predicate rather than hard-coded `admin` checks.
- Clear impersonation tickets unconditionally when an authenticated stop action is requested, including fallback states.
- Extend action-wrapper checks to exported async variables or forbid that export shape.
- Distinguish definitive Auth lookup misses from provider outages and reject future reauthentication timestamps.
- Add direct behavioral coverage for the mandatory password transition.

Primary sources: `lib/auth/claims.ts`, `lib/auth/account.repo.ts`,
`lib/actions/account.action.ts`, `lib/actions/password.action.ts`,
`lib/actions/impersonation.action.ts`, `lib/auth/rbac.ts`, `app/(app)/admin/**`,
`components/shell/topbar.tsx`, `rules/**`, `scripts/structure/**`, and the auth,
impersonation, and data contracts.

### Phase 2: Storage, HTTP, And Observability

Fix and test:

- Separate server-side S3 addressing from browser-reachable presigned URL addressing in Compose and deployed environments.
- Document and drive storage CORS, signed content type, and signed length behavior.
- Make copy-then-delete promotion compensatable on copy success/delete failure and ambiguous SDK failure. Keep durable orphan recovery evidence.
- Route unexpected action and HTTP failures into the configured monitoring seam without logging expected denials or leaking PII.
- Make the Sentry event and breadcrumb scrubber a real allow-list and add fixtures for arbitrary extra/tags/contexts.
- Classify invalid Firebase tokens separately from Auth provider outages.
- Make the rate-limit store seam async and preserve current call behavior through awaited callers.
- Define observable behavior for streamed CSV failure, including correlation and truncation semantics.
- Fix dotted `/api` paths bypassing the API proxy dialect and add provider-construction coverage for AI.
- Make user-scoped realtime listener identity include the authenticated principal.

Primary sources: `lib/storage/**`, `hooks/use-upload.ts`, `app/api/storage/**`,
`compose.yaml`, `compose.env`, `lib/api/**`, `lib/http/**`, `proxy.ts`,
`lib/observability/**`, `instrumentation*.ts`, `lib/export/**`, `lib/ai/**`,
`lib/firebase/use-firestore-query.ts`, and the related contracts.

### Phase 3: Reusable Data And Action Core

Extract the repeated mechanics behind small, typed helpers or factories:

- Cached single-record reads and standard typed collection access.
- Server-owned IDs/timestamps, transaction deadlines, not-found mapping, and standard delete behavior.
- Action authorization, input validation, error envelopes, correlation IDs, audit hooks, revalidation, and redirect handling.
- Standard form validation and progressive-enhancement state mapping.

Do not hide query construction, domain transactions, capability policy, or side effects
inside the helper. Keep exported Next action functions explicit and keep the one-entry
per-operation rule machine-checked.

Acceptance requires a shared helper bug fix to affect both the disposable generated `Widget` data/action fixture and
asset behavior without parallel copies. Acceptance also requires a custom asset path
with counter, attachment, conflict, and bulk-delete behavior to remain explicit and
correct.

### Phase 4: Reusable Delivery Shells

Extract the standard list/form delivery mechanics:

- Cursor-safe query state and return navigation.
- Guarded list, count, and pager orchestration.
- Create/edit page framing, not-found handling, and server action binding.
- TanStack form/server-action bridge, field/form errors, pending state, and submission before hydration while scripting remains enabled.
- Delete confirmation, result handling, and revalidation.
- Table and column composition without forcing domain-specific columns or labels.

The standard shell accepts domain fields, columns, loaders, actions, and policy checks.
The custom path may render its own page or bypass a shell while retaining core auth and
error contracts. Prove the shell first through a test-only delivery fixture; Phase 5
promotes that proven shape into the official scaffold.

### Phase 5: Vertical Scaffold And Verification

Make the scaffold claim true or rename it before expanding it. For this approved target,
expand it into a standard vertical slice containing the domain templates plus list/form
route and test fixtures. It must not silently retain `asset:*` capability strings.

Strengthen template verification so it checks more than TypeScript:

- Token substitution leaves no reference capability or unresolved placeholder.
- Generated feature uses the feature-owned collection/path and typed converter.
- Action wrappers and one-operation rules hold.
- Page guards, navigation, and capability declarations align.
- Generated standard CRUD runs against the emulator.
- Every query shape exercised by the generated feature is checked for indexes.

Keep generated files outside the worktree where possible. A failed generated fixture
must name the source template and the violated invariant.

### Phase 6: Add/Remove Source-of-Truth

Make feature and capability lifecycle operations disposable-testable:

- Add a feature without hand-editing an undocumented generator list.
- Remove asset in a disposable worktree and prove setup, seed, tests, E2E, docs, routes, nav, indexes, rules, and dependencies are intentional.
- Remove AI, storage, export, realtime, observability, and impersonation according to their actual shared consumers.
- Make generated configuration and capability references discoverable or conditionally owned.
- Expand collection-path checks to cover sanctioned typed/raw accessor calls, while retaining named raw repair/delete escape hatches.
- Replace over-broad index copy instructions with exact query/index ownership.

### Phase 7: Operations, Docs, And Final Proof

Align the docs and gates:

- Enforce digest-shaped production image references and digest-pin base images.
- Make snapshot CLIs use migration tooling's exact precedence: exported environment, then `.env.local`, then `.env`.
- Add fixtures for every ast-grep rule and align testing docs with actual CI commands.
- Correct locale, capability inventory, project-layout, removal, and chunked-delete claims.
- Run the complete green chain, env fail-fast, driven browser matrix, storage/container path, production artifact smoke, E2E, and index checks.

## Verification Matrix

- Static: `pnpm check:static`, including templates, structure, docs, rules, and format.
- Unit: pure claims merge, policies, action envelopes, validation, pagination tokens, storage keys, scrubbers, and URL contracts.
- Emulator integration: claims preservation, concurrent admin policy, feature CRUD, pagination in both directions, rules, and index demand.
- Browser: signed-out, user, admin, split-capability roles, mandatory-password flow, standard CRUD, custom asset lifecycle, and pre-hydration submit with scripting enabled.
- Storage: browser upload/download against the Compose/container path, CORS, staging promotion, failed write compensation, and orphan reporting.
- HTTP: direct route matrix for unauthenticated, forbidden, invalid input, provider outage, unexpected failure, headers, envelope, and correlation ID.
- Artifact: `pnpm smoke:image` and `pnpm test:e2e:ci` against the production image, not only `next start`.
- Removal: disposable worktree add/remove proofs for feature and optional capability surfaces.
- Docs: `pnpm docs:check` plus manual claim-check of every changed source path.

## Done When

- A generated standard entity writes only domain files and composition entries; it does not copy core CRUD/action/list/form mechanics.
- A custom entity can replace repo/action/page/policy without bypassing auth, validation, error, audit, or observability contracts.
- All Phase 1 and Phase 2 behavioral defects are fixed with adversarial tests.
- Asset behavior remains intact, including counter, search, pagination, attachment lifecycle, conflict handling, bulk limits, export, and authorization.
- Add/remove disposable proofs pass and leave no undocumented source-of-truth edits.
- The full verification matrix is green and driven observations are recorded.
- The worktree is clean and the report lists changed files, commits, observed behavior, deferred items, and residual risks.

## Do Not

- Do not implement a speculative universal repository or database abstraction.
- Do not use a UI gate as authorization evidence.
- Do not make a copied template inherit `asset:*` authority.
- Do not hide custom behavior behind config flags until the default path becomes unreadable.
- Do not delete Firestore rules or indexes without replacing their guarantees and tests.
- Do not claim a green static gate proves browser, artifact, env, storage, concurrency, or index behavior.
- Do not edit the PostgreSQL repository, move fork tags, push, deploy, read secrets, or copy sibling-repository configuration.
- Do not weaken a check because a consumer workflow is inconvenient; improve the owner/source-of-truth seam instead.

## Phase Gates And Transfer

1. Before each phase, map its `Rxx` rows to targeted tests and driven checks.
2. Before each phase commit, run targeted tests plus `pnpm check:static`; inspect the scoped diff and confirm no unrelated files are staged.
3. Phases 1 and 2 additionally require their adversarial integration/browser rows before being marked complete.
4. Phases 3 through 6 require `pnpm verify` after the phase integration point; Phase 7 runs the complete matrix in `docs/how-to/verify-change.md`.
5. Update this finding register with status, Firestore commit, evidence, and residual risk after each accepted phase. Never mark a row closed from worker output alone.
6. Publish a flat shared-fix manifest from every closed `S` row: finding ID, Firestore commit, changed contract, PostgreSQL replay mode, tests to rerun, and persistence-specific caveat.
7. The PostgreSQL lead may consume only a committed, verified shared-fix row. It cherry-picks database-neutral commits or reimplements invariant/test intent for persistence-aware commits.
8. After every replay, PostgreSQL reruns the row's targeted checks plus its canonical static and real-database integration gates. Final replay still reruns the whole fork matrix.

## Next Steps

1. Commit this planning slice alone after documentation checks pass.
2. Start Phase 0 by capturing the consumer contract and executable fixture harness.
3. Execute Phase 1 before reusable-core extraction so security defects are not encoded into helpers.
4. Execute Phase 2 before container-level final proofs.
5. Extract and prove Phases 3-5, then harden add/remove ownership in Phase 6.
6. Complete Phase 7, publish the shared-fix manifest, and hand it to the PostgreSQL lead.

## Lead Prompt

```text
ROLE: You are the sole Firestore Reusability Hardening Lead.

REPOSITORY:
/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore

START:
Read AGENTS.md, this handoff, the related
docs/handoffs/2026.07.22-0040-postgresql-candidate-execution/README.md baton, the
data/auth/UI/testing/operations contracts, docs/how-to/verify-change.md, and the project
task-envelope, verify, commit, scaffold-feature, migrate-database, and project-knowledge
skills. Run git status --short --branch, git log --oneline -15, git diff, and tt pi
status. Do not reset, stash, or sweep existing work.

GOAL:
Land the approved reusability hardening train. The standard entity path owns repeated
CRUD/action/list/form mechanics; custom entities retain explicit escape hatches. Preserve
all current Auth, asset, storage, export, realtime, HTTP, operations, and verification
contracts unless this handoff explicitly changes them.

EXECUTE:
Work in phases 0-7 above and obey Phase Gates And Transfer. Keep each slice thin and
locally committed after targeted checks. Delegate only disjoint read-only audits or isolated tests. Use the generated
Widget fixture and the asset feature as the standard/custom proof pair. Review actual
diffs and run the relevant static, emulator, browser, and artifact checks yourself.

DO NOT:
Do not edit PostgreSQL. Do not move tags, push, deploy, read secrets, add dual writes,
weaken gates, invent a universal database framework, or claim behavior not driven.

OUTPUT:
For each phase report commits, changed files, the consumer touchpoint reduction, tests,
driven observations, deferred rows, and residual risks. At completion report the exact
clean HEAD and the evidence for standard feature, custom asset, auth adversarial flows,
storage/container path, removal proofs, and PostgreSQL replay handoff.
```

## Execution Record

### Phase 0 — Baseline And Contract (complete)

Phase 0 introduces no production code change; it establishes the target contract, the
touchpoint inventory, and the fixture harness so later phases extract against a written
target rather than a guess.

**Baseline.** Started from `main` after the 10-30 handoff closeout; the `0050` planning
baseline `13b02848` is an ancestor of `HEAD` (main advanced past it, as expected). Both fork
tags remain immutable and unmoved.

**Consumer contract (written).** `docs/explanation/reusability-model.md` — a new
`explanation`-layer doc, registered in `scripts/docs/manifest.ts` and linked from
`docs/README.md`. It states the two-part rule (standard path owns the mechanics once; an
unusual entity replaces a piece rather than configuring a mega-helper), the three owners
(shared core / standard entity / opt-in extension), the standard baseline (CRUD + status +
cursor; search/bulk/storage/export/realtime opt-in), and — honestly labelled as current
state, not target — the four things a standard entity still copies. It lives in `explanation`
and NOT in `reference/contracts` deliberately: the reduction is the target this train
delivers, and a contract must not assert what the code does not yet do.

**Touchpoint inventory (recorded).** Core-owned and machine-enforced today: the action
envelope (`runAction`/`runFormAction` + the `action-wrapper-shape` and `single-operation-entry`
structure checks), the typed accessor + converter, `withDeadline`/`batch`/`counters`/
`search-prefix`, the cursor codec + `paginate`, the list engine (`lib/list-toolbar/**` +
`components/ui/data-table*.ts(x)`), and the server half of the form bridge. Still copied per
entity (the R09/R10 extraction gap, Phases 3–4): the repo CRUD surface (no `makeRepo`), the
action projection + validator, the client `useForm`/`mergeForm` bridge, and the toolbar/URL
href layer. Asset-specific behaviors confirmed present and to be kept feature-owned: counter,
search, cursor wiring, attachment lifecycle, conflict handling, bulk-delete cap, export,
capability strings.

**Fixture harness (confirmed, not rebuilt).** The disposable Widget harness already exists:
`scripts/check-templates.ts` materializes a generated `Widget` data/action slice from
`features/_template/**` into a temp directory outside the worktree and typechecks it. Phase 0
adopts it as the standard-entity proof fixture. Growth targets it does NOT yet cover, deferred
to Phase 5: it does not catch a leaked `asset:write` capability (R08), an unresolved
`__ENTITY__` placeholder (R11), or the absence of a list/form delivery surface (R10). Named
here, not claimed as done.

**Done-when met.** The lead can name the files a standard entity owns versus the files core
owns (above and in the contract doc), with no code change that depends on the future
abstraction.

**Finding Register.** Phase 0 closes no `Rxx` row — every finding remains open under its owning
phase (Phases 1–7). Evidence: `pnpm docs:check`, `pnpm templates:check`, `pnpm structure:check`
green after this slice (run under Node 24.12.0 on this machine, not the container's 24.18.0;
these checks are not runtime-sensitive).

**Residual for later phases.** None new. The train's next step is Phase 1 (auth safety) before
any extraction, per Next Steps step 3.

### Phase 1 — Auth And Authorization Safety (complete)

All seven findings (R01–R07) landed as per-finding commits with tests. The emulator (local
`firebase-tools` + Java) is runnable on the lead's machine, so the adversarial integration rows
are genuinely driven — not merely static-green. The BROWSER rows in the Verification Matrix
(signed-out/user/admin/split-capability matrix, mandatory-password flow in a real browser,
pre-hydration submit) were NOT driven: no browser is available here. They remain the honest
open verification for Phase 1 and must be run before the train's final proof.

**Commits.** `4e5977c` (R05 retention-by-capability + R02 self-target refusal — combined
because both touch `account.action.ts`), `9b53563` (R07 future reauth timestamp + extracted
`lib/auth/reauth.ts`), `b05308f` (R06 const-arrow action-wrapper, ast-grep rule + structure
check + fixtures), `39b488c` (R04 stop-impersonation unconditional clear), `cd16dcb` (R03
admin-UI capability gating — implemented by a delegated worktree worker, diff reviewed hunk by
hunk before merge), `1f90406` (R01 per-uid claims lease), `bbb214a` (R07 outage-classification
proof).

**The one that mattered most (R01).** The demonstrated defect was worse than the code's own
comments claimed: `admin-lease` serializes demotion/disable against each other, but password
reset, promotion, and self password-change write claims WITHOUT it, so a concurrent reset
clobbers (undoes) a demotion. The fix serializes the write itself per uid. Adversarially
verified with teeth: bypassing the lease makes the concurrency test fail on the first iteration
with the exact clobber, and restoring it makes all 33 account-action integration tests pass.

**Driven evidence.** `pnpm test:unit` 725/725; `test/integration/account-action.test.ts` 33/33
against the Auth+Firestore emulator; `pnpm typecheck`, `structure:check`, `lint:rules`,
`format:check`, `docs:check` all green. Node 24.12.0 on this machine, not the container's
24.18.0 — none of these checks is runtime-sensitive, and that gap is unchanged from Phase 0.

**Residuals carried forward.** (1) The full end-to-end password-transition integration test
(R07) — CLOSED after the fact by `04f0eb8` (`test/integration/password-action.test.ts`), which
drives the transition against the Auth+Firestore emulators. (2) The browser
acceptance matrix for all Phase-1 auth flows — undrivable here. (3) R03's split-role
disabled-row shows no reason text — not reachable under the default admin/user roles. (4) R01's
cross-app residual (Console/gcloud writes not serialized — a Firebase platform limit).

**Next.** Phase 2 (Storage, HTTP, And Observability), per Next Steps step 4.

### Phase 2 — Storage, HTTP, And Observability (complete)

All six findings (R14–R19) landed as per-finding commits with tests. Every fix was
adversarially verified by breaking the production code and observing the exact expected
failure, then restoring. The BROWSER and CONTAINER rows remain undriven here and are named
honestly below rather than implied by a green gate.

**Commits.** `927126e` (R17 token outage classification), `191ad1b` (R18 async rate-limit
store), `a2808d6` (R18 dotted `/api` matcher), `286344d` (R18 CSV truncation contract),
`e268b14` (R16 monitoring seam + scrubber allow-lists), `cef01b2` (R19 realtime principal
identity), `08639f8` (R19 AI provider construction — delegated test-writing, diff reviewed
and its adversarial mutations independently re-driven before commit), `05ffca1` (R15
copy-then-delete classification), `ffb58e5` (R14 browser vs server S3 addressing).

**A recurring shape worth naming.** Five of the six findings were the repo's own most
expensive defect — a doc asserting more than the code did. `http-api.md` promised a Redis
swap needed "no call site changes" against a synchronous interface no network store can
implement; `observability.md` claimed an allow-listed payload while three arbitrary
carriers passed through verbatim; `export.md` prescribed "keep failure points before the
first byte" for a route that structurally cannot; `storage.md` guaranteed no submit could
strand a durable orphan; `ai.md` claimed a test proved wiring nothing exercised. Each fix
therefore changed code AND corrected the sentence. Two claims turned out TRUE but unproven
(signed content-length, the deadline attribution in `ai.md`) and were pinned with tests
rather than weakened.

**The two that were live functional breaks.** R14: containerized uploads were impossible,
not degraded — the app signs presigned URLs against `http://seaweedfs:8333`, which resolves
only on the compose network, so the browser received an unreachable host. R17: any
Google-side outage signed every active user out, because `getSession` read "could not reach
the provider" as "not signed in".

**Driven evidence.** `pnpm test:unit` 818/818 (up from 725 at Phase 1 close); `pnpm build`
green — load-bearing for R16, since the monitoring seam is `server-only` and a leak into the
client bundle would only show there; `pnpm typecheck`, `structure:check`, `lint:rules`,
`format:check`, `docs:check` green. `docs:check` caught the new `S3_PUBLIC_ENDPOINT` having
no generator entry, which is the source-of-truth enforcement working. Emulator integration
`test/integration` 97/97. Node 24.12.0 on this machine, not the container's 24.18.0.

**Pre-existing integration flake, attributed rather than assumed.** The first full emulator
run reported 5 failures in `test/integration/admin-lease.test.ts`; a re-run reported 1, and a
third 0. The file passes 18/18 three times in isolation. Reproduced at the PHASE 1 commit
`afdf24c` in a detached worktree — 1 and 3 failures on two runs of the same tests — so this
is NOT a Phase 2 regression. It is emulator lock contention when the whole suite runs
concurrently against one emulator: "refuses exactly one of two operations racing for it" can
see both operations acquire. Recorded as a real gap in the integration gate's trustworthiness
under parallel load; it needs an owner (serialize the lease file, or give it its own emulator
project) before Phase 7's final matrix, which would otherwise be read as flaky-green.

**Residuals carried forward.** (1) R14's browser half — a real cross-origin PUT, the CORS
preflight, and the backend enforcing the signed length; no CORS is configured for the local
stack and the failure mode is browser-only. (2) R19b keys on the Firebase Auth principal
only; impersonation cannot re-key a client-side listener. (3) R16 reports only `INTERNAL`
from `apiFailFrom` by design, so a classified `UNAVAILABLE` during a provider outage is
logged but not alerted. (4) The Phase 1 residuals are unchanged.

**Next.** Phase 3 (Reusable Data And Action Core), per Next Steps step 5. Phases 1 and 2 are
the security and runtime prerequisites the train sequenced first; extraction can now proceed
without encoding these defects into shared helpers.

### Phase 3 — Reusable Data And Action Core (complete)

**Commits.** `c73dc1c` (the extraction), `ed8a1bb` (two conventions this work surfaced).

**The finding was overstated, and measuring it was most of the work.** A read-only audit
compared the asset feature against the entity template operation by operation. `count` and
`deleteMany` turned out to exist only in the asset repo — the template has neither — and
`delete` is copied in name only, since asset reads `attachmentKey` inside the deleting
transaction through `rawCollection` while the template does a converted fire-and-forget. Those
are asset behaviour, not mechanics, and extracting them would have produced exactly the
`BaseCrud` the Locked Decisions forbid. `reusability-model.md` asserted the larger surface and
has been corrected in the same batch.

**Shape.** Composable helpers, chosen deliberately over a `makeRepo` factory: small pure
functions the repo calls explicitly, so the wiring stays visible and there is no config object
for a flag to grow on. `stampCreated`/`stampUpdated` (`lib/data/stamps.ts`), `requireFound`
(`domain-error.ts`), `toFormErrors` (`form-validation.ts`). None owns a transaction, a query, a
capability or a side effect — which is what leaves room for asset's counter read before the
write, its conflict precondition between the read and the write, and its search-prefix
dual-write after it.

**Acceptance, as specified.** Renaming the key `stampCreated` returns fails BOTH
`features/asset/asset.repo.ts` and the generated `widget.repo.ts` — one owner, no parallel
copies. Note honestly that the generated fixture is proven STATICALLY only: `check-templates.ts`
typechecks a generated Widget and does not run its behaviour, so a type-level regression reaches
both consumers while a behaviour-level one reaches asset alone. That is a limit of the fixture,
already tracked under `R10`/`R11`, not of the extraction.

**A coverage hole it exposed.** Clearing an attachment travels as a present-but-undefined patch
key, and `stampUpdated`'s plain spread is exactly what lets it reach the stored document. That
path had no test at any level — a "smarter" merge would have turned every field-clearing edit
into a silent no-op with nothing throwing. Now covered by a unit case and a driven one that
asserts the key is gone from the DOCUMENT, not merely from the returned object.

**Driven evidence.** `pnpm test:unit` 828/828; `pnpm templates:check` green; emulator
integration 97/98 — the single failure is the known pre-existing `admin-lease` contention flake,
reproduced at the Phase 1 commit and unrelated to this change. Static gate green.

**Skills updated.** `scaffold-feature` gains a mistake to avoid (re-authoring what the core now
owns); `migrate-database` records that these helpers are persistence-neutral and must survive a
fork, with a specific warning not to "port" `stampUpdated` to merge semantics.

**Next.** Phase 4 (Reusable Delivery Shells). The client form bridge and the toolbar/URL layer
are the copies that remain, and they are delivery-shell work.

### Phase 4 — Reusable Delivery Shells (complete)

**What the measurement changed.** Phase 4's brief assumed delivery mechanics were copied and
needed de-duplicating. Source disagreed, for the second phase running. The client form bridge —
`useActionState` + `useTransform(mergeForm)` and its merge guard — lived in exactly ONE
production file; `impersonate-row.tsx` uses bare React `useActionState`, and the login and admin
account forms use client-only `useForm` with no server merge at all. So the work was not
de-duplication. It was that `features/_template/` held six `.ts` files and zero `.tsx`: the
scaffold advertised a vertical slice and generated no delivery surface, so nothing had been
copied because there was nothing to copy into.

**The extraction rule that replaced the count.** A helper earns shared ownership here when the
SECOND writer would get it wrong, not when there are two copies to merge. The evidence is in the
repo's own history: reading `formState.errors` naively typechecks — form-core declares it
`never[]` while it holds values at runtime — and shipped a literal "undefined" alert beside the
real field error.

**Shape, following `lib/list-toolbar/**` rather than inventing one.** That module is already the
answer to "reuse without losing flexibility": a dependency-free model, a binding that takes an
injected adapter, and slot components owning no state or policy. Applied here, the shared piece
is HEADLESS. `useServerForm` binds the action and merges a rejection back; it renders nothing and
deliberately does NOT wrap `useForm`, so a form keeps its own options, its own generic inference
and its own markup, and a form wanting a different merge policy passes its own `transform`.
`components/ui/field.tsx` and the `DataTable` family already were the slot layer, so no new
component tier was written.

**Landed.** `ad01e1c` `useServerForm`; `ab7e105` `formErrorText` in `lib/data/form-validation.ts`,
beside the `toFormErrors` that produces what it reads; `45921ed` the form and URL/href templates;
`68a26b6` the list/create/edit route templates; `36d3e69` the generator fix below.

**Acceptance, as specified.** Renaming a key `useServerForm` returns fails BOTH the generated
`widget.form.tsx` and `asset-form.tsx` — two independent gates, no parallel copy. Renaming a
`search-params` export fails the generated `widget.page.tsx`. Both mutations were run and
restored.

**A gate blind spot, found and closed.** `__Entities__` was never a substitution token, so
`_template.repo.ts` shipped `List__Entities__Args` and `list__Entities__` literally, and
`templates:check` passed — an unresolved placeholder is a valid identifier. Generated output is
now scanned before the typecheck. Its first run caught a second hit, `__name__`, which proved to
be Firestore's document-id field path; it is exempted by name rather than by loosening the
pattern.

**Claims corrected rather than carried.** Three, all confidently worded and all contradicted by
source: `reusability-model.md`'s "hand-copied per feature and route"; the merge guard's inherited
comment, which describes a defect that is UNREACHABLE on @tanstack/react-form 1.33.2 (`useForm`
skips the transform on the first render and `useTransform` is `useCallback` keyed on `[state]`,
driven to confirm); and a justification written during this phase claiming the withheld raw state
would be "staler" and would "disagree" — it leads the form by one layout effect and converges.
The guard is kept for stating the correct rule at no cost, with what is and is not proven
recorded in the code.

**Not proven here.** No browser and no emulator: templates render nowhere and `templates:check`
is tsc over a generated copy. Driving the asset form in a browser is still owed. Every local
gate ran on Node 24.12.0, not the container's 24.18.0.

**Next.** Phase 5 (Vertical Scaffold And Verification). `R08`'s `asset:*` leak is now the one
thing the templates still carry deliberately, and it is Phase 5's; the closed `Capability` union
is why an invented `widget:write` cannot stand in.

### Phase 5 — Vertical Scaffold And Verification (complete)

**The scaffold is now run, not only compiled.** Every earlier phase proved the templates with
tsc. That is necessary and it is not evidence: a converter that drops a field, a stamp that never
lands, a cursor whose scope does not survive a round trip and a transaction that reads after it
writes are all green under a typecheck. `test/integration/template-widget.test.ts` materializes
the entity and drives create, read, patch, both paging directions, the status filter and delete
against the emulator. The generator moved to `scripts/template-generate.ts` so the gate and the
drive build the SAME `Widget` — two generators would let a template pass one and fail the other
with nothing to say which entity was wrong. Generated files stay in the OS temp directory, so no
tsconfig, lint or format exemption was needed to keep them out of the repo's own programs.

**It found the gap it was built to find, on its first run.** The generated list's composite index
was undeclared, and `indexes:check` said so — because a query shape is invisible to that script
until something issues it. The index is declared, the template names the exact shape its own
query needs instead of pointing at a four-index block written for a sortable list, and the
requirement is a checked fact rather than a comment.

**`R08` — the refusal is the design.** The templates gate on two consts in a feature-owned
`__entity__.capability.ts` annotated `: Capability`. The union is closed, so a fresh copy does not
compile until its names are declared. Arrived at by driving, not by reasoning: `satisfies` keeps
the literal type and pushed the identical error out to all nine call sites; the annotation lands
it in one file, which is the form `RETAINED_ADMIN_CAPABILITY` already used. `templates:check`
supplies the two halves tsc cannot — it refuses any capability `CAPABILITIES` already declares,
and it partitions tsc output so the entity's own capability error is EXPECTED while anything else
is still drift.

**The templates were invisible to `structure:check`, and now are not.** The `_template.*` name
keeps them out of the tsconfig program, so a template could wrap nothing, expose one operation
twice, mint a raw collection or pull a server-only module into its client island with every gate
green. `check-templates.ts` builds a structure program over the generated tree and runs five
registered checks against it. FIVE, named one at a time, not the registry: a check that resolves
its vocabulary from a repo file sees nothing outside the root and returns zero violations, and
printing that as a pass would claim coverage the run does not have. Each was driven by mutation.

**A missing check, found by measuring rather than by assuming.** Nothing enforced that a
collection path reaches the typed accessor as a named constant —
`typedCollection('widgets', Schema)` passed everything. `collection-path-constant` closes it for
the repo tree and the generated tree at once. The neighbouring ast-grep rule was telling readers
to reach collections through a `COLLECTIONS` registry that does not exist and that the data
contract rules out by name; both stated reasons for its ignore list were false too.

**Failures now name a file that exists.** Every path the gate printed was a generated one in a
temp directory already deleted by the time anyone read it. Each generated file carries the
`_template.*` it came from, and tsc positions carry through unchanged because substitution never
moves a line.

**Docs: one owner per procedure.** The copy list, the token passes and the capability step were
written out in the data contract, the how-to and the skill. The contract's copy had drifted
furthest — five tokens where there are six, six files where there are twelve, and a capability
step phrased as optional. The contract keeps what it owns and points at the how-to, and it states
no counts, since counts are what rotted.

**Deliberately NOT built.** `route-guard-inventory` was left alone rather than contorted to reach
the generated pages. Its predicate keys on `app/(app)/**` and its guard vocabulary comes from a
repo file, so covering a generated tree would need both loosened — and the invariant already
binds where it matters: a forker's copied page lands under `app/`, where the check covers it
unchanged.

**Not proven here.** Still no browser: the templates render nowhere, and a browser drive of the
asset form remains owed. Every local gate ran on Node 24.12.0, not the container's 24.18.0.

**Next.** Phase 6 (Add/Remove Source-of-Truth). `R12` is already measured and only partially
true — read its register row before planning, since its named suspects are not feature-keyed at
all, and the genuinely silent items are narrower than the finding. `R13` (removing the reference
feature in a disposable worktree) is the phase's real work.

### Phase 6 — Add/Remove Source-of-Truth (complete)

**Both findings were measured before anything was built, and they landed on opposite sides.**
`R12` overstated: of the lists it suspected, `structure/exemptions.ts` names four files and none
is keyed on a feature, `docs/exemptions.ts` is empty, `rules/*.yml` carry globs only, and
`check-templates.ts` reads `CAPABILITIES` from source. Three lists really do force an edit —
`LAYOUT_NOTES`, `EXPECTED_GRANTS`, `setup-local.ts` — and every one fails LOUDLY inside
`pnpm verify` naming the file and the fix. What was missing was documentation, not enforcement,
so the scaffold checklist and the auth contract now name them.

**`R13` understated, and it is the only finding in this train that did.** The vertical was
deleted for real and every gate run in order: 55 files removed, 14 edited, and the checklist
named five of the fourteen. The deletions were never the problem — four `trash` targets cover 53
of 55. The edits are, and two are rewrites rather than removals.

**The gates disagree about when you are done, and the order is the forker's experience.**
`typecheck` went green while the sidebar still linked five deleted routes, `asset:*` was still
declared, and thirteen index blocks still described a collection that was gone. `structure:check`
and `docs:check` went green while `test:unit` and `templates:check` were still red. The last
static gate was the first thing to mention the templates.

**The one silent hole with teeth, and it was in the harness.** `structure:check` excluded every
file under `.claude/worktrees/` so a repo scan would not walk a disposable checkout — and pointed
AT one it excluded everything and printed `OK — every architecture contract holds` having read
zero files. `public-path-match` and `capability-completeness` are precisely the two checks that
catch a dead nav link and an orphaned capability, and the removal how-to sends readers to a
throwaway worktree. Fixed with the escape the fixture roots already use; 0 source files became 340.

**What survives a green run, now written down rather than discovered.** A capability the deletion
orphans, three dependencies whose last consumer leaves with the examples, four `lib/` modules with
no remaining importer, a `firestore.rules` carve-out granting client reads on a deleted
collection, and a generated layout doc that keeps naming `features/asset/` until the deletion is
staged — the generator asks git what exists, and the index still lists an unstaged delete.

**Not proven here.** The removal was driven on a worktree cut from an earlier commit, so its
report was re-verified against HEAD before any of it was acted on — three of its findings had
already been fixed by Phase 5 and were dropped. The emulator-dependent half (`firestore.rules`
suite, `indexes:check`) was not run inside that worktree.

### Phase 7 — Operations, Docs, And Final Proof (complete)

**The digest requirement became checkable.** `compose.prod.yaml` could only require `APP_IMAGE`
to be PRESENT — its own comment admits `ghcr.io/attacker/whatever:latest` is accepted and run.
`pnpm image:check` refuses anything that is not `<name>@sha256:<64 hex>`, and it resolves the
variable the way COMPOSE does rather than the way this repo's other CLIs do: exported
environment, then the project `.env`, never `.env.local`. Checking a value somebody else resolves
means resolving it their way, or the check passes on a value the deploy will not use. Base images
stay tag-pinned, and that is now its own claim with its reason — a digest cannot interpolate the
`NODE_VERSION` build argument.

**A real defect behind a docs bullet.** The snapshot CLIs read `FIREBASE_PROJECT_ID` off the
exported environment only, falling back to `demo-aixel`. A checkout that configures the project in
`.env.local` — which is what this repo's own setup writes — would export a snapshot of the demo
project while its owner believed otherwise. Driven both ways. The precedence now has one owner,
and the migration runner's 60-line hand-rolled `KEY=VALUE` parser went with it: `process.loadEnvFile`
already refuses to overwrite an exported value, which is the rule the parser was hand-implementing.

**Claim-checking beat claim-fixing.** Across locale, capability inventory, project layout and
chunked delete, most claims HELD and were left alone — the capability inventory family entirely.
Four did not, including a delete documented as "chunked" that is the opposite (one atomic batch,
refusing over-cap input rather than splitting) and a `chunk` helper listed as reused that has no
production caller. It is kept, and its own file now says so instead of implying a caller.

**The browser rows, and what they are.** `pnpm smoke:image` passed 7/7 against the built image —
healthcheck, non-root uid, build stamp matching the commit, `no-store`, nine security headers,
static assets, SIGTERM→143. `pnpm test:e2e:ci` drove the SHIPPED container: the first run failed
1 of 9 and the re-run passed 9 of 9. The failure was `assets.spec.ts` at "click Aset baru → URL
becomes `/assets/new`": the click registered, the RSC payload for that route had already been
prefetched 200, no console or page error was recorded, and the URL had not changed after 5s. It
did not reproduce. **That is a flake, and a flake is a residual, not a pass** — an intermittent
client transition on a freshly started container, unowned.

**Not proven here.** The env fail-fast could not be driven: it requires moving `.env` aside, and
this workstation's tooling refuses any command naming that file. It is the one matrix row with no
evidence at all. The storage/CORS rows remain undrivable here for the reason `R14` recorded. Every
local gate ran on Node 24.12.0, not the container's 24.18.0.
