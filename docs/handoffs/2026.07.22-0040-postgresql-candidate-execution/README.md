# PostgreSQL Candidate Parallel Execution

## Handoff Metadata

- Sequence: `0040`
- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Created: `2026.07.22`
- Parent: `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- Status: `IN PROGRESS`
- Next action: Qualify the candidate tag, then run Firestore Phase 12 and PostgreSQL candidate development in parallel.

## Purpose

This is the concise continuation baton for the candidate fork. It does not rewrite
the historical handoffs. Read them only for evidence and locked architecture:

- Firestore foundation and official tag:
  `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- PostgreSQL architecture and full acceptance:
  `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-postgresql/docs/handoffs/2026.07.21-0040-postgresql-fork/README.md`

New and continuation handoffs must stay at 400 lines or fewer. Historical handoffs
are grandfathered; do not refactor them merely to meet this cap.

## Locked Decisions

- Run exactly two Claude leads, one per repository. Do not run two leads in one repo.
- Firestore remains the source of candidate and official tags.
- PostgreSQL work is provisional until replayed from `postgresql-fork-base-v1`.
- PostgreSQL uses PostgreSQL 18, Drizzle ORM 0.45.x, `drizzle-kit`, `pg` 8.x, and
  `pg-cursor`.
- Firebase Auth remains. Replace Firestore persistence, not Auth.
- Zod remains the runtime/domain boundary; PostgreSQL constraints own persistence integrity.
- Realtime uses authenticated SSE plus PostgreSQL `LISTEN`/`NOTIFY` invalidation.
- Asset create/edit and admin remain canonical full pages; do not restore query dialogs or intercepting routes.
- Candidate implementation never lands directly on PostgreSQL `main`.
- No push, deploy, secret reading, dual write, permanent source remote, or wholesale merge of Firestore `main`.

## Lead Topology

### Lead 1: Firestore Verification And Tag Lead

- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Owns: current planning diff, candidate qualification/tag/attestation, Phase 12,
  verification fixes, official tag, and official attestation.
- May delegate: isolated verification rows and read-only audits.
- Must serialize: source handoff edits, fixes, evidence integration, commits, and tags.
- Must not edit the PostgreSQL workspace.

### Lead 2: PostgreSQL Candidate Lead

- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-postgresql`
- Owns: candidate bootstrap, target Git history, PostgreSQL architecture, worktrees,
  integration, verification, and final replay.
- Before candidate readiness: read-only planning only; do not initialize Git.
- Must not edit the Firestore repository.
- Must keep target `main` at the candidate base until final replay and verification.

No third Claude lead is recommended. A third decision-maker adds architecture and
merge contention. Each lead may orchestrate bounded workers under the rules below.

## Candidate Gate

The Firestore Lead creates a clean `CANDIDATE ELIGIBLE` commit, then runs against
that exact SHA in a disposable clone:

```text
pnpm install --frozen-lockfile
pnpm verify
plain missing-public-env build -> fails with the expected validator error
pnpm setup:local
pnpm setup:local
seeded admin browser sign-in -> reaches /dashboard
```

Required evidence:

- Exact candidate SHA and clean source worktree.
- `postgresql-fork-base-v1` remains absent.
- Frozen install and `pnpm verify` pass.
- Emulator integration and index checks actually run.
- Missing public environment fails as expected.
- Repeated setup is non-destructive.
- Real browser sign-in succeeds.
- Deferred Phase 12 checks are listed, not claimed.

Only then create `postgresql-fork-candidate-v1`, record its peeled SHA, and commit a
documentation-only `Candidate status: CANDIDATE FORK READY` attestation. Phase 12
remains `IN PROGRESS`.

## PostgreSQL Worktree Waves

The PostgreSQL Lead owns `candidate/integration`; workers never merge directly.

- Wave 0: bootstrap, track the target handoff, rename identity, inventory every
  Firestore consumer, and classify retained Firebase Auth imports.
- Wave 1: one owner for dependencies, Drizzle config, `lib/db/**`, env, pool/direct
  clients, PostgreSQL Compose, migrations, and integration harness.
- Wave 2: one schema owner for asset, account audit, revocation, final-admin,
  counter, extension, and notification migrations.
- Wave 3: parallel `candidate/assets`, `candidate/accounts`,
  `candidate/realtime`, `candidate/tooling`, and read-only
  `candidate/verification` worktrees.
- Wave 4: Lead-owned action composition, package scripts, env registry, container,
  CI, Firestore removal, docs, and final candidate integration.

One owner controls `package.json`, `pnpm-lock.yaml`, Compose, env registry, and CI.
Each implementation branch targets one dominant review question, normally one to
three commits and at most 400 changed lines. Generated SQL and lockfile churn may
exceed the line budget only with an explicit oversize reason.

Use isolated PostgreSQL databases/schemas and ports per worker. Do not run multiple
Auth emulator or production-container jobs against the same default ports.

## Official Replay

When Firestore publishes `postgresql-fork-base-v1` and top-level `FORK READY`:

1. Verify the official tag and source SHA read-only.
2. Fetch only that tag through a temporary local remote, then remove the remote.
3. Create `final/integration` at the official tag.
4. Cherry-pick reviewed candidate commits in dependency order.
5. Classify Phase 12 source commits as shared, Firestore-only, or evidence.
6. Cherry-pick only clean shared commits; reimplement persistence-aware fixes locally.
7. Run the complete PostgreSQL verification and browser/database matrix.
8. Merge verified `final/integration` to PostgreSQL `main` without rewriting candidate history.

Do not rebase candidate branches, force-move tags, or merge Firestore `main`.

## Prompt: Firestore Lead

```text
ROLE: You are the sole Firestore Verification And Tag Lead.

REPOSITORY:
/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore

GOAL:
Qualify the provisional PostgreSQL candidate, continue Phase 12 in parallel with the
separate PostgreSQL Lead, and eventually publish the official verified fork tag.

START:
1. Read AGENTS.md, this continuation handoff, the parent 0010 Phase 12 section,
   docs/how-to/verify-change.md, and the project verify/commit/task-envelope skills.
2. Run git status, git diff, git log --oneline -15, and tt pi status.
3. Treat the existing planning diff as intentional user-approved work. Review and
   preserve it; do not reset, stash, or sweep unrelated changes.

OWN:
- Review and locally commit the candidate-planning slice after its docs checks pass.
- Prepare one clean Candidate status: CANDIDATE ELIGIBLE commit.
- Run the candidate gate against that exact commit in a disposable clone.
- If and only if it passes, create local tag postgresql-fork-candidate-v1 and commit
  the documentation-only Candidate status: CANDIDATE FORK READY attestation.
- Continue the full Phase 12 matrix, fixes, evidence, VERIFIED FOR TAGGING commit,
  official postgresql-fork-base-v1 tag, and final FORK READY attestation.

DELEGATE:
Use bounded workers for read-only or isolated verification lanes: static/emulator,
clean onboarding/env fail-fast, container/E2E, admin/auth, assets/data, and
accessibility/storage/export. Give each worker exact scope and success checks.
Only you edit the source handoff, integrate fixes, commit, or tag. Isolate ports.

DO NOT:
Do not edit the PostgreSQL workspace. Do not push/deploy, read secrets, weaken a
gate, claim unobserved behavior, create the official tag early, or run two writers
against the same source hotspot.

DONE WHEN:
Candidate readiness is backed by exact observed evidence and the candidate tag/SHA;
Phase 12 continues without invalidating it. Final completion still requires every
Phase 12 row, the official tag, FORK READY attestation, and a clean worktree.

OUTPUT:
Report local commits/tags, exact checks and observed behavior, deferred rows, source
status, and proof the PostgreSQL workspace was not edited by this Lead.
```

## Prompt: PostgreSQL Lead

```text
ROLE: You are the sole PostgreSQL Candidate Lead and integration owner.

REPOSITORY:
/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-postgresql

GOAL:
Bootstrap from the exact attested candidate tag, build the PostgreSQL sibling in
parallel with Firestore Phase 12, then replay and verify it from the official tag.

START:
1. Read this continuation handoff and the historical target 0040 handoff. Do not
   refactor the historical handoff to meet the 400-line cap.
2. Read the source parent handoff read-only. Before CANDIDATE FORK READY and the
   exact candidate tag exist, perform read-only planning only and do not initialize Git.
3. Once the gate opens, run the target handoff's FORK_MODE=candidate in-place
   bootstrap exactly. Stop on any source/tag/target-manifest disagreement.
4. Create candidate/integration before the first target commit; leave main at the
   untouched candidate base. Track the pre-existing target handoff in its own commit.

LOCKED ARCHITECTURE:
PostgreSQL 18; Drizzle ORM 0.45.x; compatible drizzle-kit; pg 8.x; pg-cursor;
Firebase Auth retained; Zod runtime boundary; feature-owned tables; immutable reviewed
SQL migrations; DATABASE_URL plus DATABASE_DIRECT_URL; SSE plus LISTEN/NOTIFY;
canonical full-page asset/admin behavior; no startup migrations or direct browser DB.

EXECUTE:
- Complete Waves 0-2 serially.
- After schema foundation merges, dispatch disjoint assets, accounts, realtime,
  tooling, and read-only verification worktrees.
- Keep package/lockfile/env/Compose/CI under one owner.
- Review every diff, run targeted checks after every merge, and commit thin slices.
- Preserve account audit, revocation, final-admin protection, impersonation, action
  envelopes, storage lifecycle, exports, keyset pagination, and auth behavior.

OFFICIAL REPLAY:
When the official source tag exists, verify it read-only, create final/integration at
that tag, remove the temporary remote, and cherry-pick candidate commits in dependency
order. Never merge Firestore main or candidate implementation directly to main.
Run full PostgreSQL static, integration, migration, plan, container, E2E, backup/
restore, browser, mobile, accessibility, and clean-tree verification before main.

DO NOT:
Do not modify Firestore, push/deploy, read/copy secrets, replace Firebase Auth, add
dual write/RLS/Redis/Kubernetes/SQLite/fake DB, weaken tests, move tags, force-rewrite
history, or maintain permanent repository synchronization.

DONE WHEN:
Candidate work is reviewable and replayable; final PostgreSQL main descends from the
official tag and every required database/browser/operations behavior is observed.

OUTPUT:
Report base tag/SHA, local commits by wave, worktree merges, checks and driven
observations, replay status, removed Firestore surfaces, retained Auth dependencies,
and residual risks. No raw worker transcripts.
```

## Checkable Finish

- Both leads have exclusive repository ownership and no overlapping writes.
- Candidate tag and attestation are exact and immutable before PostgreSQL bootstrap.
- Firestore Phase 12 and PostgreSQL candidate work proceed in parallel.
- PostgreSQL candidate commits remain off `main` and replay from the official tag.
- No new handoff exceeds 400 lines; historical handoffs remain unrefactored.
- No push, deploy, secret access, or permanent cross-repository synchronization occurs.
