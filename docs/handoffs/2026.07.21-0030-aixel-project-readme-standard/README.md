# Aixel Project README Standard Execution Handoff

## Handoff Metadata

- Sequence: `0030`
- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Created: `2026.07.21`
- Parent: `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- Status: `AIXEL README STANDARD READY`
- Next action: None. The one open known-limitation (per-workflow evidence records in `product-context.md`) is recorded below and owned by a follow-up docs slice, not by this handoff.

> **Status: AIXEL README STANDARD READY**
>
> Work packages 2–5 are complete. The onboarding preflight was driven from a
> disposable clone on 2026-07-22 — install, repeated setup, measured idempotence,
> and browser sign-in — and is recorded at the end of this file. The final evidence
> this handoff waited on (clean-checkout, `pnpm verify`, full E2E, production
> container, storage) was driven and passed under parent Phase 12 and recorded once
> there (`docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`,
> `FORK READY`, tag `postgresql-fork-base-v1`). The terminal status is therefore met.
> One known limitation remains open and is NOT an unmet acceptance row: the
> per-workflow evidence records in `docs/explanation/product-context.md` (see
> "Known limitations" in the Completion Report below).

This is the execution baton for a product-aware, developer-usable, and
mechanically guarded README standard for Aixel internal web applications. The
Firestore starter is the first canonical implementation. The PostgreSQL fork
inherits the same contract and changes only persistence-specific facts.

## Parent Handoff And Current State

- Parent handoff: `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- Parent status when this handoff was authored: `IN PROGRESS`
- Parent active phase when this handoff was authored: Phase 6, explicit environment and tooling safety
- Parent repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Observed parent `HEAD` when this handoff was authored: `1a4e64eb64ca064dcfe6ab7d22ac9210fea76af9`
- Required downstream tag: `postgresql-fork-base-v1`
- PostgreSQL sibling: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-postgresql`

The parent handoff remains authoritative for current source behavior, phase
sequencing, Next.js rules, environment safety, verification doctrine, commit
discipline, final tagging, and fork publication. This handoff owns the Aixel
README contract, its Firestore implementation, its documentation-maintenance
procedure, its product-context owner, and the automatic checks that keep those
documents honest.

The parent Lead MUST execute this as the **Phase 11 README closeout**, after Phase
10 has stabilized `pnpm setup:local`, canonical test scripts, Playwright, and
production-artifact smoke behavior, and after Phase 11 has established the docs
map plus generated references this handoff consumes. This is part of the parent
documentation rewrite, not a parallel documentation train. Phase 11 owns
implementation and narrow onboarding preflight; the parent Phase 12 completion
report is the sole owner of final clean-checkout, browser, and container evidence.

## Starting Instructions

The Lead MUST:

1. Work only in `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`.
2. Read `AGENTS.md`, the complete parent handoff, the Phase 11 `docs/README.md` ownership registry, the current docs checker, and every final generated reference this README will consume.
3. Confirm parent Phase 10 is complete and `pnpm install`, `pnpm setup:local`, `pnpm dev`, `pnpm verify`, `pnpm test:e2e`, and production-artifact smoke commands have their final names and behavior.
4. Confirm no other worker is editing `README.md`, `docs/README.md`, `AGENTS.md`, docs generation/check scripts, package scripts, or the target Phase 11 documentation paths.
5. Run `git status --short --branch`, `git diff`, `git log --oneline -10`, and `tt pi status` before editing.
6. Preserve unrelated worktree changes and stage only files owned by the active slice.
7. Never read, print, copy, or commit `.env*`, credentials, tokens, service-account material, production data, support secrets, or screenshots containing PII.
8. Load `task-envelope` before delegating, `project-knowledge` before moving or consolidating docs, `verify` before declaring a slice complete, `commit` before each commit, and `thin-pr` if one slice develops more than one dominant review question.
9. Read the relevant current Next.js guide under `node_modules/next/dist/docs/` before documenting framework behavior.
10. Use `pnpm`, never `npm`.

If Phase 10 is incomplete, report the blocker and stop. Do not write a final
quickstart around planned commands or preserve a temporary workaround as a
durable Aixel standard.

## WHY / GOAL

An Aixel engineer opening a project should be able to answer two questions in
the first screenful:

1. What product or product foundation is this, who is it for, and what outcomes does it support?
2. How do I reach the first safe, working local state and verify my first change?

The current Firestore README is a useful but mixed-purpose tour. It combines
product identity, stack inventory, environment instructions, scripts, examples,
tree layout, deployment, and docs ownership. Some of those claims have already
drifted from source, and the setup path exposes internal workarounds instead of a
stable developer experience.

The target is not a decorative README template. It is a small product and
developer contract backed by executable commands, source-generated references,
documentation checks, and browser evidence.

### User Stories

As an Aixel engineer evaluating a starter or joining a project, I can understand
the product problem, intended users, primary outcomes, core workflows, scope,
and deliberate non-scope before reading implementation details.

As an Aixel engineer starting locally, I can follow the documented shortest
path from a clean checkout to an authenticated working application without
tribal knowledge, fake provider credentials, or destructive setup.

As a product or technical lead reviewing a project, I can distinguish shipped
behavior from examples, optional capabilities, future work, and domain choices
owned by the derived application.

As a maintainer, I cannot silently leave a dead command, dead link, stale
generated fact, brittle source reference, or unowned document in a green gate.

As the PostgreSQL fork, I inherit one Aixel README contract and developer journey
while adapting only database-owned setup, operations, and architecture facts.

## Locked Product Decisions

### Scope

This standard applies now to:

- The Aixel Next.js + Firestore starter.
- The Aixel Next.js + PostgreSQL starter after the verified fork.
- Aixel internal web applications derived from either starter.

It does not attempt to standardize every future Aixel CLI, library, mobile app,
service, data pipeline, or non-web repository. A broader organization-wide
profile may extend the contract later; do not dilute this handoff with
hypothetical project types.

### Canonical Source And Inheritance

The Firestore starter owns the first canonical implementation. The PostgreSQL
starter inherits the contract and checker at `postgresql-fork-base-v1`.
PostgreSQL may replace Firestore-specific product, setup, architecture, and
operations facts, but it must not create a competing README philosophy or a
weaker onboarding/verification contract.

### Language

- Product orientation and onboarding prose use Bahasa Indonesia.
- Commands, code identifiers, source paths, protocol names, and established technical terms remain in English.
- Do not duplicate the README in a full bilingual version. Two prose copies create translation drift without improving the internal-team default.
- Use direct, professional language. Avoid marketing superlatives that cannot be proven.

### Product Status

This iteration does not standardize a project maturity/status vocabulary and
does not require a status badge or status section. Do not invent `production`,
`beta`, `ready`, or similar labels merely to fill a template. A future standard
may add lifecycle status after Aixel chooses an organization-wide source of
truth and evidence model.

### Ownership And Support

Product owner, technical owner, and support path are optional in this iteration.
If the project has real values, show or link them. If it does not, omit the
section. Never ship `<team-name>`, `TODO`, an invented channel, or an unmonitored
address to satisfy a structural check.

### Visuals

Screenshots and workflow diagrams are optional. Include one only when it improves
product comprehension, depicts current behavior, carries useful alt text, and
contains no PII, customer data, production credentials, internal tokens, or
environment-specific secrets. Do not make a screenshot mandatory: stale visual
evidence is worse than no visual.

## README Ownership Contract

The root `README.md` owns exactly two durable presentation concerns:

1. A compact product-orientation summary sourced from the canonical product context.
2. The shortest verified path to a first successful local run and the next safe change.

`docs/explanation/product-context.md` is the canonical owner of product problem,
users/adopters, outcomes, workflows, scope, and non-scope. The README summarizes
those facts for orientation and MUST be reviewed against that owner whenever
either changes. It may provide a small map to canonical documentation. It must
not become the canonical owner of architecture rationale, complete configuration reference,
all commands, all capabilities, layer contracts, long procedures, deployment
operations, decisions, or temporary handoff state.

The parent Phase 11 phrase "README is quickstart-only" means the README is not an
encyclopedia. It does not mean product context is excluded. The final contract is
**product orientation + quickstart + navigation**, with all depth linked to its
single owner.

### Required Product Questions

Every compliant README answers, in compact prose or bullets:

- What recurring problem does this project solve?
- Who is the intended user or adopter?
- What outcome does the project enable?
- What are the core user or adopter workflows?
- What is included in the current product boundary?
- What is deliberately outside that boundary?

For a starter, the product is the reusable foundation and developer experience.
For a derived application, the product is the actual business application. A
derived project MUST replace the starter's product orientation with its own
problem, users, outcomes, workflows, scope, and non-scope. It must not retain the
boilerplate's product copy as if the starter itself were the shipped product.

### Required Developer Questions

Every compliant README also answers:

- What exact supported prerequisites are required?
- What is the shortest clean-checkout local setup path?
- What observable result proves setup succeeded?
- How does a developer obtain local-only test-account information safely?
- What is the one canonical command for verifying a change?
- Where do architecture, contracts, adaptation, operations, and deeper procedures live?

### Recommended Root Shape

The exact wording can vary, but the Firestore implementation should converge on
this ownership shape:

````md
# <Nama project>

> <Satu kalimat product promise: outcome, untuk siapa, dan jenis project.>

## Product

- Masalah: <recurring problem>
- Untuk: <primary users or adopters>
- Outcome: <what becomes possible or safer>
- Workflow utama: <small current set>
- Termasuk: <current product boundary>
- Tidak termasuk: <deliberate non-scope>

## Mulai Cepat

### Prasyarat

<Exact supported runtime and tools.>

```bash
pnpm install
pnpm setup:local
pnpm dev
```

<URL, expected first success, and where setup prints local account information.>

## Verifikasi Perubahan

```bash
pnpm verify
```

<What this proves and a link to the full verification procedure.>

## Mulai Mengembangkan

<Links to first change, adaptation, feature, and contract guidance.>

## Dokumentasi

<Small role-oriented map to the canonical docs index.>

## Deployment

<One honest target sentence and a link to the runbook.>

## Ownership

<Optional; include only real product, technical, and support destinations.>
````

The skeleton is illustrative, not a second source to copy mechanically. The
normative contract lives in `docs/reference/contracts/project-readme.md`; the
final root README is one implementation of it.

### Required README Qualities

The README MUST:

- Put product orientation before stack and implementation details.
- Put the shortest supported happy path before alternate or advanced setup.
- Describe an observable success state, not only commands.
- Use only package scripts and paths that exist at the same commit.
- Link to one canonical owner for each deeper topic.
- Distinguish required foundation behavior, optional capabilities, examples, and derived-project domain choices.
- Describe current shipped behavior, not roadmap intent.
- Avoid real secrets, production data, and credentials.
- Avoid source line references, historical test counts, occurrence counts, stale version inventories, and copy-maintained generated facts.
- Avoid badges that communicate no actionable trust signal.
- Avoid a hand-maintained table of every environment variable, script, dependency, route, or capability.
- Keep troubleshooting out of the root unless it blocks the shortest path for most developers; detailed troubleshooting belongs to the owning how-to.
- Use local test accounts only through safe setup output or a single generated/local source; do not repeat passwords across docs.

The README SHOULD:

- Explain the first safe change or link directly to it.
- State when a capability is an optional example rather than a product promise.
- Prefer user/adopter outcomes over framework feature names.
- Include a small architecture/ownership map only when it helps the reader choose the next document.
- Link to security reporting or support only when those destinations are real.

The README MUST NOT:

- Become the full developer handbook.
- Restate normative contracts from `docs/reference/contracts/**`.
- Restate generated command, configuration, capability, or project-layout references.
- Claim support for an operating system, deployment target, provider, or workflow that the repository does not verify.
- Ask a local developer to provide a fake production provider key.
- Present destructive reset/seed behavior as the default setup path.
- Present the reference `assets` entity as the derived application's business domain.
- Preserve Firestore statements unchanged in the PostgreSQL fork when persistence ownership changes.

## Canonical Documentation Owners

The Phase 11 README closeout adds or finalizes these distinct owners:

- `README.md`: compact product orientation, quickstart, and navigation.
- `docs/reference/contracts/project-readme.md`: normative Aixel README contract.
- `docs/how-to/maintain-project-readme.md`: procedure for creating, adapting, reviewing, and updating a project README.
- `docs/explanation/product-context.md`: full product foundation context, users/adopters, outcomes, workflows, product boundary, and why the starter is shaped this way.
- `docs/tutorials/local-development.md`: guided local setup and first successful sign-in.
- `docs/tutorials/first-change.md`: guided first safe code change and verification.
- `docs/how-to/adapt-starter.md`: replacing starter identity/domain and deleting unused capabilities.
- `docs/how-to/verify-change.md`: complete verification procedure.
- `docs/how-to/deploy.md`: deployment procedure.
- `docs/reference/commands.md`: generated command reference.
- `docs/reference/configuration.md`: generated configuration reference.
- `docs/reference/capabilities.md`: generated capability reference.
- `docs/reference/project-layout.md`: generated ownership/layout reference.
- `docs/README.md`: documentation index and ownership registry.

Do not create placeholders merely to make this list exist. The parent Phase 11
owns the complete documentation migration. If a target path already has an
equivalent canonical owner by the time this handoff starts, consolidate into
that owner and update the index/manifest rather than creating a near-duplicate.

### Product Context Owner

`docs/explanation/product-context.md` owns the detail the README cannot carry:

- The recurring Aixel delivery problem the starter addresses.
- Primary adopter and runtime-user categories.
- The starter adoption journey.
- The reference application's end-to-end workflows.
- Required foundation capabilities versus optional examples.
- Deliberate non-goals and derived-project responsibilities.
- The relationship between product workflows, semantic capabilities, routes/surfaces, and acceptance evidence.

For the Firestore starter, the product context MUST state that this is an
authenticated internal-app foundation, not a finished business application,
tenant model, organization model, production Firebase project, or mandatory
domain specification.

For a derived Aixel app, the maintenance guide MUST instruct the adopter to
replace the starter product context with the real domain problem and users. It
must not suggest retaining generic text indefinitely.

## Product Workflow Evidence

Product prose cannot be fully generated or mechanically proven. The standard
therefore separates factual shape checks from behavioral evidence.

Every core workflow named in the final Firestore README or product-context doc
MUST be one of:

- Covered by an automated acceptance test whose stable path or test name is linked from the verification/evidence owner.
- Explicitly identified as a documentation/adaptation workflow and driven through a clean-checkout or disposable-worktree procedure.
- Removed from the product summary until it has observable evidence.

The product-context owner MUST map each core workflow using this record shape:

- Workflow and intended actor/outcome.
- Product surface or developer command.
- Semantic capability, when authorization applies.
- Stable automated test or driven procedure that covers it.
- Final observation owner: the parent Phase 12 completion report.

Do not copy route/capability inventories by hand if a source registry already
owns them; link or generate the factual portion. The README is a synchronized
summary of this canonical map, not a second workflow source.

The final Firestore workflow floor, owned and re-driven by the parent Phase 12
matrix, is:

- Adopt the starter and reach a local authenticated session.
- Replace or add a reference domain feature through the documented contract path.
- Authenticate and enforce role/capability policy at server boundaries.
- Keep or remove optional capabilities without hidden boot/configuration residue.
- Run the canonical verification gate and understand what remains manually observed.
- Build and run the production artifact through the documented deployment model.

The Admin Account module may add administrator workflows to the product context
only after its own handoff reports ready with browser and emulator evidence.

## External README Baseline

The Phase 11 README closeout may revisit these current upstream READMEs for ideas. Use them as a
benchmark, not as content to copy:

- Supabase: <https://github.com/supabase/supabase/blob/master/README.md>
- Appwrite: <https://github.com/appwrite/appwrite/blob/master/README.md>
- Prisma: <https://github.com/prisma/prisma/blob/main/README.md>
- Cal.diy: <https://github.com/calcom/cal.diy/blob/main/README.md>
- Django: <https://github.com/django/django/blob/main/README.rst>
- Rails: <https://github.com/rails/rails/blob/main/README.md>

Ideas worth adapting:

- Supabase: immediate product thesis, capability framing, and clear hosted/self-hosted distinction.
- Appwrite: product outcomes before installation and capability groups described in user language.
- Prisma: precise "what is it", short quickstart choices, and clear paths to deeper docs.
- Cal.diy: honest warnings/boundaries, explicit local workflow, seeded-user orientation, E2E entry, and concrete troubleshooting.
- Django and Rails: concise conceptual orientation and strong routing from README into tutorials, how-to guides, reference, and contribution guidance.

Ideas not to import:

- Badge walls.
- Community/social sections irrelevant to an internal Aixel project.
- Full SDK/client matrices.
- Long deployment manuals in the root README.
- Hardcoded local passwords repeated across files.
- Marketing claims or maturity labels without an Aixel evidence model.
- Full bilingual duplication.

Record attribution through these links and original prose. Do not copy large
blocks, logos, screenshots, branding, tables, or distinctive text.

## Automatic Documentation Contract

`pnpm docs:check` MUST gain a focused README contract check without pretending
to understand subjective product prose.

### Static Checks

The checker MUST prove:

- Root `README.md` exists and is registered as the root guide.
- The normative README contract and maintenance how-to exist in the final docs ownership registry.
- Required README ownership areas are present: product orientation, quickstart, verification, development/docs navigation, and deployment pointer.
- Local Markdown links and linked local paths resolve.
- Every referenced `pnpm <script>` exists in `package.json` unless the command is explicitly an install invocation such as `pnpm install`.
- No unowned Markdown document is introduced.
- No duplicate ownership is declared for README, product context, command reference, configuration reference, capability reference, or project layout.
- Normative README-contract metadata is complete.
- Existing brittle-content rules still reject source line references, historical test counts, occurrence counts, and unowned decision IDs.
- Generated command, configuration, capability, and project-layout references match source.
- `CLAUDE.md` and agent/skill compatibility links still resolve according to parent ownership.

The checker SHOULD validate heading roles through an explicit small contract,
not exact prose or a giant template snapshot. Permit better wording while
preventing the owner areas from disappearing.

Do not write a regex that requires exact Indonesian heading text across every
derived project. Prefer explicit metadata, stable Markdown markers, or a small
machine-readable README profile if exact heading synonyms would become a fragile
taxonomy. Keep the machine layer smaller than the human contract.

### Negative Fixtures

Checker tests MUST prove failure for at least:

- A missing root README.
- A missing required ownership area.
- A referenced package script that does not exist.
- A broken local link or path.
- Duplicate documentation ownership.
- Missing metadata on the normative README contract.
- A generated reference that has drifted from source.
- A banned source line reference or historical count.
- A placeholder-only ownership/support value if the checker elects to inspect that optional section.

The optional Ownership section MUST NOT become required merely because a fixture
exists. If present, placeholders may be rejected; absence remains valid.

### Generated References

Generate facts only when source ownership is clear:

- Commands from `package.json` scripts and package-manager/runtime declarations.
- Configuration from the final env schemas and capability manifest.
- Capabilities from the final capability source and completeness inventory.
- Project layout from the final ownership/module registry.

The parent Phase 11 generated-reference slice owns generator implementation and
general generated-drift checks. This README closeout consumes those references;
it does not reimplement or take over their generators. If a required generated
reference is absent, return the blocker to its parent Phase 11 owner before
continuing.

Generated files MUST:

- State that they are generated.
- Name the generator/source.
- Have deterministic output.
- Fail `pnpm docs:check` on drift.
- Be regenerated through a canonical script, not by manual edits.

Do not generate product prose, product outcomes, users, workflows, scope, or
non-scope. Those are human product decisions and require review, not extraction
from routes or package dependencies.

## Executable README Proof

A static README check proves syntax and ownership, not that the application
works. Phase 11 performs a narrow preflight; the final README happy path is
driven once by the parent Phase 12 from a clean tracked checkout. For recorded
acceptance, install with `pnpm install --frozen-lockfile`; the human quickstart
may remain the simpler `pnpm install` interface.

An equivalent disposable workspace means a fresh clone or disposable worktree
at the tracked commit with no inherited untracked/build artifacts, isolated
emulator/local-service data, and non-conflicting ports. A developer's existing
dirty worktree is not equivalent.

The proof MUST:

1. Install with the pinned package manager and runtime.
2. Run `pnpm setup:local` twice to prove repeatability and non-destructive behavior.
3. Start the documented local application and required emulators/services.
4. Observe the documented URL and health behavior.
5. Obtain local account information from setup output or its one canonical local source.
6. Sign in through Firebase Auth emulator in a browser.
7. Reach the documented authenticated first-success surface.
8. Run `pnpm verify` and confirm it invokes the final canonical required lanes.
9. Drive only the README onboarding rows: local emulator sign-in and the documented authenticated first-success surface.
10. Build and smoke the production artifact through the parent Phase 10 command.

If the README claims Windows or another host platform, run that lane or remove
the claim. Do not retain theoretical cross-platform instructions that no gate
executes.

The hosted CI workflow SHOULD call canonical package scripts rather than parse
and execute arbitrary README code fences. The README documents the public
interface; package scripts own executable orchestration. A dedicated
clean-checkout/onboarding lane may consume those same scripts and fail when the
documented first run no longer works.

## Maintenance Procedure Contract

`docs/how-to/maintain-project-readme.md` MUST teach a maintainer to:

1. Identify whether the repository is a starter or a derived product.
2. Write the product promise as user/adopter + problem + outcome, not a stack slogan.
3. Replace inherited starter product context in a derived app.
4. Select only current, evidenced core workflows.
5. Separate required, optional, example, and out-of-scope capabilities.
6. Keep the root happy path short and move advanced procedures to canonical how-to docs.
7. Generate factual references from source instead of copying lists.
8. Update the docs index, ownership manifest, generators, and checker in the same change.
9. Run static docs checks and the appropriate preflight; the parent Phase 12 owns the final clean-checkout proof.
10. Re-read the result as a new engineer, a product/technical lead, and the future persistence fork.

The how-to MUST include a review checklist, but it must link to the normative
contract instead of reproducing all MUST/MUST-NOT prose.

## Scope

### In Scope

- The normative Aixel README contract for internal web applications.
- A compact product-orientation model for starter and derived-project profiles.
- The Firestore starter's final root README implementation.
- Product-context ownership and product-workflow evidence mapping.
- A README maintenance how-to.
- Docs index/manifest integration.
- README-specific docs checker logic and negative fixtures.
- Consumption of source-generated command, configuration, capability, and project-layout references owned by parent Phase 11.
- Narrow local sign-in and authenticated first-success preflight before final parent verification.
- PostgreSQL inheritance and persistence-specific adaptation rules.

### Explicit DO NOT

- Do not implement or rename `pnpm setup:local`, Playwright, container smoke, or the parent test taxonomy in this handoff. Phase 10 owns those behaviors; this handoff consumes their final public interface.
- Do not implement or take ownership of command, configuration, capability, or project-layout generators. The parent Phase 11 generated-reference slice owns them.
- Do not write the final README before those commands and behaviors exist.
- Do not create a second README template file that restates the normative contract.
- Do not turn the root README into the complete developer handbook.
- Do not copy complete external README sections, branding, screenshots, or tables.
- Do not add a project status vocabulary, badge, or readiness claim in this iteration.
- Do not require product/technical owner or support metadata.
- Do not invent placeholder ownership/support values.
- Do not make screenshots mandatory.
- Do not build a universal README standard for non-web Aixel repositories.
- Do not duplicate generated facts in authored prose.
- Do not generate product prose from routes, schemas, capabilities, or tests.
- Do not document planned capabilities as shipped.
- Do not claim operating-system support that was not driven.
- Do not weaken parent docs ownership, metadata, link, drift, or brittle-content checks.
- Do not implement PostgreSQL from this README handoff. Provisional adaptation is
  governed by the parent Candidate Fork Contract; the official fork remains gated
  on `FORK READY` and `postgresql-fork-base-v1`.
- Do not read or expose secrets, production data, or customer information.
- Do not push, deploy, publish, or create the fork tag from this handoff.

## Execution Plan

### Work Package 1: Reconcile Final Documentation Ownership

Work:

- Read the Phase 11 tree as it exists after earlier documentation slices.
- Confirm the canonical owners for root orientation, product context, README contract, maintenance procedure, generated references, tutorials, and operations.
- Grep every current consumer before moving, merging, or retiring an old doc.
- Add the three earned owners from this handoff only where no equivalent exists.
- Update `docs/README.md` and the machine-readable manifest atomically.

DONE WHEN:

- Every README/product topic has one owner.
- No near-duplicate product brief, README guide, or template remains.
- Every new doc is indexed and classified correctly.

VERIFY:

- `pnpm docs:check`
- Negative index/ownership fixtures.
- Manual ownership review against the parent target tree.

Suggested commit boundary:

```text
docs: establish the Aixel README ownership contract
```

### Work Package 2: Publish Product Context And Maintenance Guidance

Work:

- Write the Firestore starter's full product context in the final explanation owner.
- Write the normative README contract with all six metadata fields.
- Write the maintenance how-to without duplicating normative rules.
- Incorporate the external baseline ideas selectively and attribute links.
- Make starter versus derived-project replacement responsibilities explicit.

DONE WHEN:

- A new engineer and a product/technical lead can explain the starter's problem, users/adopters, outcomes, workflows, scope, and non-scope.
- A derived-project maintainer is explicitly told to replace starter product identity and workflows.
- Normative rules and procedures have distinct owners.

VERIFY:

- `pnpm docs:check`
- Read the docs in order from `docs/README.md`.
- Search for duplicate normative README prose.

Suggested commit boundary:

```text
docs: publish the product-aware README standard
```

### Work Package 3: Add Mechanical README Guards

Work:

- Add the focused README contract check.
- Validate referenced package scripts against the real package source.
- Confirm the parent-generated reference pairs are active and consume them from the README; return missing generator work to the parent owner.
- Add negative fixtures for every required failure mode.
- Keep optional ownership/support and visual sections optional.

DONE WHEN:

- Each negative fixture fails for the intended reason.
- The current final docs tree passes with no broad or permanent exemption.
- A stale command, dead link, missing owner area, duplicate owner, or generated drift cannot be green.

VERIFY:

- Focused docs-checker unit tests.
- `pnpm docs:check`.
- Deliberately break and restore each new contract in an isolated fixture or disposable worktree.

Suggested commit boundary:

```text
test(docs): enforce the Aixel README contract
```

### Work Package 4: Rewrite The Firestore Root README

Work:

- Replace the current mixed-purpose tour with product orientation, the verified three-command path, observable success, canonical verification, and a small docs map.
- Explain the starter's required foundation, optional capabilities, examples, and non-scope without duplicating generated inventories.
- Remove temporary workarounds and stale setup caveats resolved by Phase 10.
- Link to the final canonical product, adaptation, verification, architecture, and operations owners.
- Use Bahasa Indonesia for onboarding and product prose while retaining English technical identifiers.

DONE WHEN:

- The root README answers every required product and developer question.
- It contains no complete generated inventory or long procedure.
- It contains no project status claim or fake owner/support destination.
- Every command and link resolves at the same commit.

VERIFY:

- `pnpm docs:check`.
- `pnpm format:check` scoped according to repository convention.
- Read the README without opening another file and identify product, user/adopter, outcome, workflows, scope, non-scope, first run, expected success, and next docs.

Suggested commit boundary:

```text
docs: make the starter README product-aware and runnable
```

### Work Package 5: Preflight The README Promise

Work:

- Execute a disposable-workspace onboarding preflight using `pnpm install --frozen-lockfile`.
- Drive local sign-in and the first authenticated surface.
- Confirm the canonical verification and production-artifact smoke commands are the final documented interfaces, without claiming their final Phase 12 evidence.
- Confirm the product-context workflow records identify the acceptance owner and stable test/procedure.
- Record only blockers and readiness for Phase 12; do not create a second final evidence record.

DONE WHEN:

- The documented happy path succeeds from the defined disposable preflight workspace.
- Running setup twice does not destroy or corrupt local state.
- A browser reaches the documented authenticated success state.
- The canonical verification and production-artifact commands are documented against their final Phase 10 interfaces, with final execution deferred to Phase 12.
- No README product workflow is an unverified promise.

VERIFY:

- Local emulator sign-in and the documented authenticated first-success surface only.
- Parent Phase 12 owns the final `pnpm verify`, E2E, production-artifact, and complete application matrix.

Suggested commit boundary:

```text
docs: prepare README onboarding for final verification
```

Do not copy preflight results into a durable evidence ledger. Phase 12 reruns the
final clean-checkout, setup, browser, emulator, and container rows after the
documentation tree is frozen, then records them once in the parent completion
report.

## Files Likely Affected During Execution

- `README.md`
- `docs/README.md`
- `docs/reference/contracts/project-readme.md`
- `docs/how-to/maintain-project-readme.md`
- `docs/explanation/product-context.md`
- `docs/tutorials/local-development.md`
- `docs/tutorials/first-change.md`
- `docs/how-to/adapt-starter.md`
- `docs/how-to/verify-change.md`
- `scripts/docs/manifest.ts` or its Phase 11 successor
- `scripts/docs/context.ts` or its Phase 11 successor
- `scripts/docs/checks.ts` or its Phase 11 successor
- `scripts/docs/check.test.ts` and docs fixtures

The generated references are required read-only inputs from the earlier parent
Phase 11 slice; they are not owned files for this handoff.

This is a likely map, not permission to edit every path. Discover the actual
post-Phase-10 tree before writing. Do not edit package scripts, setup, E2E, or
container implementation unless a separately authorized parent Phase 10 fix is
required and handled as its own work item.

## Full Acceptance Matrix

### Product Comprehension

- A new Aixel engineer can state the problem, intended adopter/user, outcome, core workflows, scope, and non-scope after reading only the root README.
- A product/technical lead can distinguish foundation behavior, optional capabilities, examples, and derived-project responsibilities.
- The starter does not present `assets` as an Aixel-wide business domain.
- The product context does not claim tenant, organization, production Firebase provisioning, or universal app requirements.

### Developer Onboarding

- The README advertises `pnpm install`, `pnpm setup:local`, `pnpm dev`; recorded acceptance installs with `pnpm install --frozen-lockfile`.
- Setup can run twice safely.
- No fake AI key or real external-provider secret is needed for the default path.
- Setup provides local-only account information without duplicating credentials across docs.
- The documented URL responds and a browser reaches the expected authenticated surface.

### Verification

- `pnpm verify` exists and matches the canonical required gate.
- Browser/E2E and production-artifact behavior are not falsely claimed as covered when they are outside `pnpm verify`; either include them or state the exact owning command.
- Every core product workflow has acceptance evidence or is removed from the summary.
- The parent Phase 12 report is the sole final evidence owner and records observed proof without copying historical pass counts into durable docs.

### Documentation Integrity

- Product context owns product facts; the root README owns their compact synchronized summary; contract and how-to retain distinct normative/procedural ownership.
- Every local link/path resolves.
- Every referenced package script exists.
- Generated references match source.
- Normative metadata is complete.
- No source line references, historical counts, occurrence counts, stale old paths, or broad exemptions remain.
- Optional owner/support and visual content stays optional.

### Language And Safety

- Product/onboarding prose is Bahasa Indonesia.
- Code, commands, paths, identifiers, and technical terms remain exact.
- No full bilingual duplicate exists.
- No PII, production data, real credential, secret, token, or unsafe screenshot appears.
- No unsupported project-status or readiness claim appears.

### Adaptation

- The maintenance/adaptation procedure tells a derived project to replace starter product context.
- A derived project can retain the README contract without retaining Firestore-specific product facts when it uses PostgreSQL.
- Optional capability deletion updates README links/claims, generated references, configuration, navigation, and verification together.
- Pre-fork Firestore acceptance reviews PostgreSQL portability statically; the downstream PostgreSQL handoff owns actual inherited-checker and clean-checkout reruns after the fork gate opens.

## PostgreSQL Fork Contract

At the fork tag, PostgreSQL inherits:

- The normative Aixel README contract.
- The README maintenance how-to.
- The product-orientation model.
- The docs ownership/checker machinery.
- The canonical script names and onboarding acceptance shape.
- Firebase Auth product behavior and shared application workflows.

The PostgreSQL fork MUST:

- Preserve the compact product + quickstart + navigation ownership model.
- Keep Bahasa Indonesia onboarding and exact English technical identifiers.
- Preserve clean-checkout setup, repeatability, local sign-in, canonical verification, browser, and production-artifact evidence.
- Replace Firestore-specific setup, persistence, migration, backup, query, index, Rules, and operations facts with PostgreSQL-owned truth.
- Preserve shared Firebase Auth and Admin Account outcomes while replacing persistence-owned adapters as specified by their handoffs.
- Regenerate commands, configuration, capabilities, and layout reference from its own source.
- Re-run every README contract and clean-checkout acceptance row.
- Avoid copying a second README standard into a competing PostgreSQL-only document.

Before the fork, this handoff verifies PostgreSQL portability by reviewing the
shared contract and enumerating persistence-owned facts only. It does not claim
that PostgreSQL setup or checks ran. The downstream PostgreSQL execution owns the
actual adaptation and reruns.

The PostgreSQL fork's **official completion** MUST NOT start from an unverified
source or later Firestore `main`. Provisional adaptation MAY begin only after the
parent publishes `CANDIDATE FORK READY` and
`postgresql-fork-candidate-v1` resolves to the exact recorded candidate SHA. The
provisional work must be replayed on `postgresql-fork-base-v1` before PostgreSQL
completion, and this README handoff does not authorize edits to the target.

## Completion Report

When the Phase 11 README closeout finishes, update this section before the parent Phase 12 tag.

- Status: `AIXEL README STANDARD READY` (parent Phase 12 drove and passed the final acceptance rows; see the Phase 12 pointer below).
- Firestore README contract path: `docs/reference/contracts/project-readme.md` — written, all six metadata fields present, registered in `scripts/docs/manifest.ts`, `metadata-presence` green.
- Product context path: `docs/explanation/product-context.md` — pre-existing owner from the parent Phase 11 slice; consumed, not rewritten. The root README's product summary was written from it and the two agree on problem, adopter, outcome, boundary and non-scope. The per-workflow evidence records the handoff asks that owner for are NOT yet in it; that gap is still open.
- Maintenance how-to path: `docs/how-to/maintain-project-readme.md` — written; links to the contract for MUST/MUST-NOT rather than restating them.
- README checker implementation: three checks in `scripts/docs/checks.ts` — `readme-contract` (required areas via `<!-- readme:<id> -->` markers, duplicate/unknown markers, placeholder text in the optional `ownership` area, and any second document claiming a README area), `readme-commands` (every `pnpm <script>` in the README, the contract and the how-to exists in `package.json`; only `pnpm install` is exempt), and `canonical-ownership` (each of the eight canonical owners appears exactly once in the manifest with the declared type, and no two areas name the same file). The profile they read lives in `scripts/docs/context.ts`. Heading text is deliberately NOT matched — markers survive translation and rewording.
- Generated reference sources: consumed only. `docs/reference/{commands,configuration,capabilities,project-layout}.md` are linked from the README and asserted as single owners by `canonical-ownership`; their generators remain owned by the parent Phase 11 slice and were not touched.
- Negative-fixture preflight: PASS. New fixtures `scripts/docs/__fixtures__/readme-contract/{good,bad}` and `readme-commands/{good,bad}` (the latter with a `package.fixture.json`); `scripts/docs/check.test.ts` covers missing root README, missing required area, doubled area, unknown marker, placeholder in the optional ownership area, competing README owner, non-existent package script, missing owner, duplicate owner entry, two areas on one file, and wrong owner type. Broken link, missing normative metadata, generated drift and banned brittle content were already covered and still pass. Full file: 34 tests green; `pnpm test:unit` 707 green.
- Static checks: PASS. `pnpm docs:check` is OK with **zero exemptions**; `pnpm check:static` (node/typecheck/templates/lint/lint:rules/format/docs/structure) passes. Both new checks were driven against the real tree by temporarily deleting the `readme:navigation` marker and inserting a `pnpm ghost:command` — each produced exactly one violation naming the right target, and the README was restored byte-identical. `canonical-ownership` was driven in-memory against the real manifest with a duplicated and with a removed entry.
- Disposable-workspace onboarding preflight: PASS. A clean clone installed with `pnpm install --frozen-lockfile`; `pnpm setup:local` was run repeatedly and preserved the seeded state.
- README-specific browser preflight: PASS. The authenticated sign-in and first protected surface were observed from the disposable clone; the initial cold-compile timeout was fixed at the source and the flow passed warm.
- PostgreSQL portability review: static only. The contract states what a persistence fork inherits (contract, checker, product-orientation model, script names, Bahasa Indonesia rule) and what it must replace (setup, migration, backup, query, index, Rules, operations facts, and its own regenerated references). No PostgreSQL workspace was opened.
- Parent Phase 12 final evidence pointer: the parent Phase 12 completion report is the sole owner of clean-checkout, browser, emulator, E2E and production-artifact evidence, and it drove and passed them on 2026-07-22 (`FORK READY`, tag `postgresql-fork-base-v1`). This slice claims none of those rows itself; it points to them.
- Known limitations:
  - Final clean-checkout, production-artifact, browser-matrix, emulator, storage, and hosted-CI evidence remains owned by parent Phase 12.
  - `docs/explanation/product-context.md` does not yet carry the per-workflow evidence records (actor, surface, capability, covering test) the handoff specifies. The root README therefore names its workflows as documented paths, each linked to the tutorial or how-to that owns it, and claims no test coverage for them.
  - `readme-commands` is scoped to the README, the contract and the how-to. It does not police `pnpm` references across the rest of the docs tree, which would need a package-manager-verb allowlist and is a different slice's call.
  - Work Package 1 (docs index + manifest reconciliation) was executed by the parent documentation slice, not here; `docs/README.md` and `scripts/docs/manifest.ts` were not edited by this handoff.
- External README ideas adopted: Prisma's "what is it, then the short quickstart, then routes into deeper docs" ordering; Supabase's immediate product thesis before any stack list; Cal.diy's honest boundary warnings and its seeded-local-account orientation, adapted so the credential lives only in the setup script's output rather than in the README; Django/Rails' routing from the root into tutorials, how-to and reference instead of a handbook. No badge wall, no community section, no SDK matrix, no deployment manual in the root, and no copied text.

At the end of Phase 11, use `READY FOR PARENT VERIFICATION` only after the
implementation, static checks, negative fixtures, and narrow onboarding preflight
pass. Use `AIXEL README STANDARD READY` only after the parent Phase 12 report owns
and passes every final acceptance row. Do not mark this handoff ready based only
on prose review, static checks, preflight, or a successful build.

## Expected Final Output

The executing Lead reports:

1. The final product promise and product boundary used by the Firestore starter.
2. Canonical paths for the README contract, product context, maintenance how-to, and generated references.
3. The exact static checks and negative fixtures added.
4. The exact disposable-workspace/repeated-setup and onboarding-browser preflight observed, plus the parent Phase 12 evidence pointer for final verification.
5. Any external README idea intentionally adopted and how it was adapted for Aixel.
6. The PostgreSQL facts that must change after the fork and the shared contract that must remain.
7. Every changed file and the verification evidence for its owning slice.

## Work Package 5 — onboarding preflight, DRIVEN 2026-07-22

Executed by the parent Lead in a disposable workspace, not in the working tree.

**Workspace.** `git clone` of the repo at `9976da2` into a scratch directory. No
`.env` of any kind present in the clone — confirmed by listing before anything ran,
so nothing below inherited configuration from the source tree.

**`pnpm install --frozen-lockfile`** — succeeded in 6.6s (the pnpm store makes this
a hardlink operation). The `prepare` lifecycle ran and installed the lefthook hooks
into the clone's own `.git/hooks`, which is the behaviour Phase 10 fixed: a fresh
clone gets working hooks without being told.

**`pnpm setup:local`, run four times.** The first run seeded and printed the test
accounts, every listening port, and `pnpm dev` as the next command. Subsequent runs
reported `.env already exists — left exactly as it is.` and `30 asset(s) and 2
account(s) already in the emulator — left untouched.`

Idempotence was measured INDEPENDENTLY rather than taken from setup's own report:
the `assets` collection was listed straight off the emulator's REST API as owner and
hashed. Before and after further runs: `30 docs, sha adae137bcdbc7691` — identical.
(The first attempt at that measurement returned `0 docs` because the request was
unauthenticated; `firestore.rules` refused the list with `PERMISSION_DENIED`, which
is the rules working. The measurement was fixed rather than trusted.)

**A real port collision was hit, and setup handled it correctly.** The machine
already ran an unrelated SeaweedFS on 8333, so the compose service could not bind.
Setup did not silently continue: it reported that something else answers on that
port, that our container publishes none, and named the two variables to change
(`S3_HOST_PORT`, `S3_ENDPOINT`). That is the Phase 10 port-probe fix meeting the
exact condition it was written for.

**Browser sign-in and the authenticated first surface.** `pnpm dev` in the clone,
then the E2E suite pointed at it: **6 passed, 1 failed**. Sign-in itself works from
a clean clone — the auth, admin-guard, health and no-JS specs all passed, and each
of those signs in.

The single failure was the FIRST spec of the run and is a dev-server artifact, not a
product defect: against a cold `pnpm dev` the first navigation to `/dashboard`
compiles the route on demand and exceeded the 5s default assertion timeout. Re-run
warm, the identical spec passed in 15.1s. Fixed at the source — `e2e/sign-in.ts` now
gives that one assertion a generous timeout, which costs nothing on the fast path,
because a sign-in helper that times out on a cold compile reports "wrong password"
for something that is not.

**Not claimed here.** Nothing in this preflight is final evidence. The production
container, the full E2E matrix, `pnpm verify` and the complete acceptance rows belong
to parent Phase 12, which reruns them once against the frozen tree.

**Status is therefore `READY FOR PARENT VERIFICATION`:** the contract, product
context, maintenance procedure, checks and negative fixtures are in place, and the
onboarding promise this handoff exists to protect has now actually been walked from
a clean clone.
