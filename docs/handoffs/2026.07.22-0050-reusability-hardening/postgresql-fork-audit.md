# PostgreSQL Fork Audit And Prevention Guide

This guide is the review contract for the PostgreSQL sibling fork. It is intentionally
invariant-first: Firestore implementation details may disappear, but behavior, security,
performance, lifecycle, and evidence requirements may not.

## Classification

- `S` Shared/database-neutral: fix in Firestore first, then cherry-pick or equivalently reimplement and verify in PostgreSQL.
- `F` Firestore-only mechanism: preserve its guarantee, but do not port the implementation.
- `P` PostgreSQL-specific equivalent: implement and verify locally in the fork.

A PostgreSQL fork is not merge-ready when an `S` invariant exists only in PostgreSQL, or
when an `F` mechanism disappears without a documented `P` replacement.

## Evidence Vocabulary

- Static: source inspection, typecheck, structure/lint rules, generated-reference checks.
- Unit: pure contract or policy behavior.
- Integration: a real PostgreSQL instance, never an in-memory database fake.
- Driven: browser and direct HTTP behavior against the running application.
- Artifact: production container behavior, not `next start` alone.
- Migration: dry-run, apply safety, row/document equivalence, reconciliation, and restore evidence.

## Audit Matrix

### 1. Auth Claims, Concurrency, And Self-Target Admin Flows (`R01`-`R02`, `R04`-`R07`)

Classification: `S` policy/lifecycle; `F` Firestore lease and marker storage; `P`
advisory-lock or row-lock equivalent.

Preserve one claims writer, unrelated-claim preservation, live target re-read, session
revocation after authority change, self-demotion/self-disable refusal, final-admin
retention, impersonated-session restrictions, and explicit reconciliation for partial
Firebase Auth operations. SQL transactions do not make Firebase Auth and PostgreSQL
atomic together.

Firestore sources: `lib/auth/claims.ts`, `lib/actions/account.action.ts`,
`lib/auth/account.repo.ts`, `lib/auth/admin-lease.ts`, `lib/auth/revocation.ts`,
`docs/reference/contracts/auth.md`, and `docs/reference/contracts/impersonation.md`.

PostgreSQL evidence: a serialization mechanism appropriate to the chosen PostgreSQL lock
shape, with proof of mutual exclusion and proof that a stale owner cannot commit; concurrent role/password tests; pool loss and stale operation tests; failure
after Auth mutation but before local reconciliation; fresh session evidence proving
revocation.

False evidence: pure claims merge tests, live count without serialization, a UI-disabled
button, a successful Auth call without a fresh session, or a database transaction whose
external Auth side effect is untested.

Also prove impersonation ticket cleanup in fallback states, final-admin policy independent
of a literal role name, exported async action coverage, mandatory password transition,
provider-outage classification, and rejection of future `auth_time` values.

Stop merge for any claim writer bypass, forbidden admin-surface self-target reset/revoke,
silent partial failure, or undocumented cross-system residual risk. Self-service password
change remains required and is not prohibited by this gate.

### 2. Capability And UI/Route Alignment (`R03`)

Classification: `S`.

The semantic capability source, role grants, page guards, action/API gates, deployment
availability, and navigation must describe the same authority. Navigation is UX only;
direct access remains server-authorized.

Firestore sources: `lib/auth/rbac.ts`, `lib/auth/guards.ts`, `app/navigation.ts`,
`components/shell/nav-config.ts`, `scripts/structure/checks/capability-completeness.ts`,
and `docs/reference/contracts/auth.md`.

Required tests: signed-out, read-only, admin, disabled, password-change-required, and
split-capability sessions attempt direct pages, actions, and HTTP routes. Test a visible
control followed by a forged direct request. Test deployment-disabled capabilities.

False evidence: hidden links, role-only tests, a green capability-completeness check, or
assuming `proxy.ts` is the authorization boundary.

### 3. Reusable CRUD, Action, And UI Mechanics (`R09`-`R11`)

Classification: `S`; persistence bodies are `F`/`P`.

Shared mechanics remain shared: `ActionResult`, action/form wrappers, validation mapping,
auth boundary, pagination contract, list state, table composition, audit, and error
handling. Feature-owned code supplies schema, query policy, columns, fields, side
effects, and exceptional transactions.

Firestore sources: `lib/data/action-result.ts`, `lib/data/form-action.ts`,
`lib/list-toolbar/`, `components/ui/data-table.tsx`, `features/_template/`,
`features/asset/`, `docs/reference/contracts/data.md`, and `docs/reference/contracts/ui.md`.

Required evidence: a generated non-asset feature uses shared wrappers; a shared bug fix
changes both generated and asset behavior; removing one feature in a disposable copy
leaves shared code healthy; custom asset behavior remains explicit.

PostgreSQL rule: replace repository/pagination/database bindings only. Do not copy
Firestore actions into PostgreSQL or create a second PostgreSQL-only CRUD/UI engine.

False evidence: similar-looking copied files, a `BaseCrud` hiding auth policy, one feature
passing only its own tests, or compilation after copying the entire Firestore feature.

### 4. Scaffold Authorization Leakage (`R08`)

Classification: `S`; template mechanics are persistence-shaped, but the authorization
invariant applies to both forks.

Generate a non-asset feature with a distinct capability. Inspect page guard, form action,
imperative action, any API route only when HTTP is required, and navigation. Invoke generated actions directly as a role
that has the reference capability but not the generated capability.

The scaffold test must fail when capability substitution is omitted. `templates:check`,
typecheck, and capability-completeness are not authorization proof.

### 5. Add/Remove Source-of-Truth Completeness (`R12`-`R13`)

Classification: `S` discipline; collection/rules/index artifacts are `F`; tables,
migrations, indexes, constraints, triggers, and notifications are `P`.

Add a feature from the scaffold, then remove it in a disposable worktree. Search imports,
routes, capabilities, env accessors, storage, revalidation paths, tests, docs, rules,
indexes, migrations, seeds, and navigation.

PostgreSQL must not delete immutable historical migrations. Use explicit forward migrations
for approved data changes and remove current runtime consumers, table-specific indexes,
constraints, triggers, notification paths, seed data, and generated references only when
their owner is removed.

False evidence: typecheck, build, a manually edited docs page, or grep restricted to
source files.

### 6. Data Contract And Persistence Equivalence

Classification: `S` schema/action boundary; `F` rules, converters, collection paths,
composite indexes, and Firestore cursors; `P` SQL constraints, indexes, transactions,
and keyset cursors.

Preserve `schema -> repo -> action`, server-owned writes, validated reads, authorization
formerly enforced by Firestore rules, deterministic pagination, and query performance.

Firestore evidence inventories Admin SDK imports, rules, collection paths, and composite
indexes. Every rule/index has a test that fails without it. Every filtered/sorted shape is
driven in both pagination directions.

PostgreSQL evidence uses a real database, empty-database migration tests, constraint
rejection tests, `EXPLAIN`/plan evidence for every ported index, and keyset cursors that
include sort, direction, filter scope, and deterministic tie-breaker.

Adversarial tests cover malformed rows, unauthorized queries, stale cursors, concurrent
update/delete, transaction rollback/retry, missing indexes, and sequential-scan regressions.

False evidence: ORM compilation, correct results from a sequential scan, application-only
guards, offset pagination, or an in-memory database.

### 7. Storage Endpoint And Orphan Compensation (`R14`-`R15`)

Classification: `S` security/lifecycle; `F` document coordination; `P` row-locking and
reconciliation coordination.

Presign routes derive owner/key from the session. Staged uploads are promoted before
persistence. Failed writes and deletes produce explicit orphan evidence rather than false
success.

Server-internal storage addressing and browser-facing signed URL addressing are separate
configuration facts. Drive CORS and URL reachability from a browser outside the app
container; server-side presign success is not evidence.

Firestore sources: `lib/storage/keys.ts`, `lib/storage/s3.ts`,
`app/api/storage/upload-url/route.ts`, `hooks/use-upload.ts`,
`lib/storage/attachment-lifecycle.ts`, and `docs/reference/contracts/storage.md`.

PostgreSQL tests must cover attachment replacement races, row delete before object delete,
database timeout after the commit boundary, forged owner/key, size/type mismatch, and
browser reachability of the signed URL. On ambiguous database status, retain the object
and reconcile; do not delete a possibly referenced object.

### 8. HTTP Boundary And Observability (`R16`-`R19`)

Classification: `S`.

Routes exist only where HTTP is required. Each route gates inline, validates input,
returns the closed envelope, carries correlation ID and `no-store`, normalizes failures,
and preserves the PII allow-list.

Test direct unauthenticated, forbidden, malformed-input, provider-outage, downstream-
failure, and success requests against the production container. Assert status, body,
headers, and correlation ID together. Test Sentry event/breadcrumb scrubbing with
SDK-shaped arbitrary fields, not only hand-shaped happy fixtures.

Also audit and prove:

- Unexpected action/route failures reach monitoring after PII scrubbing.
- Invalid Firebase tokens are distinct from provider outages.
- Rate-limit storage is asynchronous and supports the documented distributed replacement.
- CSV stream failure is observable and cannot masquerade as a complete download.
- Dotted `/api` paths retain the API dialect.
- AI provider construction receives validated key/model configuration.
- User-scoped realtime identity includes the authenticated principal and resubscribes on change.

False evidence: JSON shape tests without headers, matching `Origin` fixtures only,
`sendDefaultPii: false` alone, or server-only initialization.

### 9. Deployment Reproducibility And Database Runtime (`R20`)

Classification: `S` artifact discipline; database runtime and migration behavior are `P`.

Require frozen install, exact runtime pins, reproducible image identity, build and boot
fail-fast at the correct boundary, non-root image smoke, health/build identity, drain,
and browser E2E against the shipped artifact.

Require digest-shaped production image references and digest-pinned base images. A
mutable image tag is not reproducibility evidence.

PostgreSQL additionally requires explicit reviewed migration execution, no startup
migration side effect, migration ordering, pool shutdown, connection/direct-connection
behavior, migration lock behavior, backup/restore, and unapplied-schema failure evidence.
Snapshot and database CLIs must use the same explicit precedence as the source tooling:
exported environment, then `.env.local`, then `.env`.

False evidence: local install, `build:ci` alone, `next start` alone, mutable image tags,
health-only checks, or a successful boot against a stale schema.

### 10. Test, CI, And Documentation Drift (`R20`)

Classification: `S`; emulator/index mechanics are `F`; PostgreSQL integration, migration,
plan, and restore suites are `P`.

The canonical command must run the intended suite without silent skips. Integration tests
must fail when the real database is absent. Query/index checks must run in the same real
database session as the driving suite. Generated references must match source.

Adversarial checks remove database setup, leave a query shape unexercised, break a template
helper, delete a route but retain nav, alter a source without regenerating docs, and run
E2E without an explicit artifact target.

False evidence: green tests that skipped integration, static green, copied candidate
evidence, hand-edited generated docs, or CI commands that differ from local scripts.

## Candidate And Merge Gates

- Record every finding as `S`, `F`, or `P`, with the owning Firestore contract/source and PostgreSQL replacement proof.
- Fix `S` findings in the Firestore baseline first, then cherry-pick or equivalently reimplement them in PostgreSQL.
- Never cherry-pick Firestore storage, lease, converter, rules, emulator, or index implementations into PostgreSQL; carry invariant and test intent only.
- Keep Firebase Auth behavior separate from persistence replacement.
- Require static, real-database integration, adversarial tests, artifact smoke, browser acceptance, migration/data equivalence, and documentation checks.
- Declare residual risks explicitly: external Auth and PostgreSQL are not one atomic transaction; object cleanup is compensating/eventual; external Admin SDK mutations may bypass in-app locks.
- `postgresql-fork-candidate-v1` is provisional. Final replay starts from exact official `postgresql-fork-base-v1` and reruns affected evidence.
- Merge only with an exact base SHA, clean worktree, complete row status, observed behavior, and no load-bearing deferred gate.

## Shared-Fix Transfer Protocol

1. Firestore closes an `S` row only after committing its fix and required evidence.
2. Firestore publishes finding ID, commit, contract delta, replay mode, tests to rerun, and persistence caveat in the active `0050` handoff.
3. PostgreSQL records the exact consumed Firestore commit and chooses cherry-pick only for database-neutral code; persistence-aware fixes are reimplemented from invariant/test intent.
4. PostgreSQL reruns targeted static, real-database, adversarial, browser, and artifact checks named by the row.
5. Candidate evidence is never copied into official replay evidence. Final replay from `postgresql-fork-base-v1` reruns every affected row.

## Review Output

Return a flat report with: finding ID, classification, severity, Firestore source/contract,
PostgreSQL source, invariant, test/evidence, observed result, residual risk, and commit.
Do not paste worker transcripts. Do not call a row green because code compiles.
