# Docs index

Every document below has ONE owner and every topic has ONE canonical home. If two docs
disagree, the one listed here as the owner wins — and the other is a bug.

The tree follows four modes, and the mode tells you what a document is allowed to do:

- **Tutorials** teach by being run start to finish. They link to rules; they never state them.
- **How-to** gets one task done. It links to contracts for constraints; it never legislates.
- **Reference** states facts. `reference/contracts/*` are NORMATIVE — code must obey them —
  and each opens with six fields saying what it owns, what proves it, and what it does not
  define. The rest of `reference/` is GENERATED from source.
- **Explanation** owns rationale. It contains no commands.

`scripts/docs/manifest.ts` is the machine-readable version of this page, and `pnpm docs:check`
fails if the two disagree, if a doc exists without being listed, or if a normative doc is
missing its metadata.

## Start here

- [`../README.md`](../README.md) — the quickstart. Install, set up, run.
- [`../AGENTS.md`](../AGENTS.md) — the always-load spine for agents and humans alike
  (`CLAUDE.md` is a symlink to it): engineering defaults, where ownership lives, verify doctrine.
- [`tutorials/local-development.md`](tutorials/local-development.md) — from a fresh clone to a
  running app, in full.
- [`tutorials/first-change.md`](tutorials/first-change.md) — make one change and prove it works.

## How to do a thing

- [`how-to/adapt-starter.md`](how-to/adapt-starter.md) — make this starter your project:
  rename, delete what you do not need, configure what you keep.
- [`how-to/add-feature.md`](how-to/add-feature.md) — add a Firestore-backed entity end to end.
- [`how-to/remove-capability.md`](how-to/remove-capability.md) — delete an optional capability
  without leaving its config, grants and nav entries behind.
- [`how-to/verify-change.md`](how-to/verify-change.md) — the verify chain AND the driven steps.
  Green is necessary, never sufficient.
- [`how-to/deploy.md`](how-to/deploy.md) — the executed container runbook.
- [`how-to/setup-google-form.md`](how-to/setup-google-form.md) — connect the founder Google
  Form to `aisa-api` through Apps Script.
- [`how-to/test-a-feature.md`](how-to/test-a-feature.md) — test an AISA feature to its end
  state: test layers, acceptance matrix, evidence, live WhatsApp rules, and the
  `docs/qa/<feature>.md` record.
- [`how-to/backup-and-restore.md`](how-to/backup-and-restore.md) — snapshot export/restore and
  migrations, including the gates that stop them reaching a real project by accident.
- [`how-to/maintain-project-readme.md`](how-to/maintain-project-readme.md) — keeping the README
  true as the project moves.

## The contracts — read the one you are about to touch

Normative. Each owns one seam, and each names its own removal checklist, because this starter
is meant to be deleted from.

- [`reference/contracts/module-boundaries.md`](reference/contracts/module-boundaries.md) —
  which layer may import which, and the checks that enforce it. Start here if you are porting
  this repo to another database.
- [`reference/contracts/http-api.md`](reference/contracts/http-api.md) — route handlers: the
  response envelope, error taxonomy, correlation id, rate limiting, the security-header
  baseline, and the CSRF origin rule. **Read its boundary section — usually you should not be
  adding a route.**
- [`reference/contracts/data.md`](reference/contracts/data.md) — the `schema → repo → action`
  path every entity follows, plus the composite-index rule nothing else enforces.
- [`reference/contracts/auth.md`](reference/contracts/auth.md) — Firebase email/password
  sign-in, the Firebase session cookie, and the server-authoritative data access layer; the
  client never holds a trusted identity.
- [`reference/contracts/ui.md`](reference/contracts/ui.md) — how components are sourced and
  extended, and which state mechanism to reach for, in what order.
- [`reference/contracts/testing.md`](reference/contracts/testing.md) — the three test layers
  and the things that look like improvements and are not.
- [`reference/contracts/operations.md`](reference/contracts/operations.md) — what the running
  container promises: signals and drain, health semantics, the reverse-proxy contract, limits,
  logs, build identity.
- [`reference/contracts/observability.md`](reference/contracts/observability.md) — error
  monitoring, and the PII boundary that decides what may leave the process.
- [`reference/contracts/project-readme.md`](reference/contracts/project-readme.md) — what a
  project README must answer, and who owns keeping it true.

The AISA data contract — every collection the Python services write and this app reads:

- [`TESTING.md`](TESTING.md) — the T01–T11 scenarios run against production, with actual
  results and evidence ids.
- [`qa/inventaris-fitur.md`](qa/inventaris-fitur.md) — every AISA feature to test, the layer
  that proves it, the tests that exist, and the gap.
- [`qa/api.md`](qa/api.md) — aisa-api route, command, intake and digest tests (pytest, fakes).
- [`qa/dashboard.md`](qa/dashboard.md) — dashboard acceptance specs against a mock aisa-api.
- [`qa/penerimaan-produksi.md`](qa/penerimaan-produksi.md) — acceptance against production
  through the API and WhatsApp webhook, with evidence ids and cleanup.
- [`qa/asisten.md`](qa/asisten.md) — the Asisten's read tools and live answers.
- [`qa/use-case.md`](qa/use-case.md) — the 14 AISA use cases, their status, and the evidence
  for each.
- [`qa/panduan-uji/`](qa/panduan-uji/README.md) — step-by-step manual test guides in Indonesian,
  one per area, written from what is on screen:
  [masuk, Dashboard, Tren](qa/panduan-uji/01-masuk-dashboard-tren.md),
  [Proposal](qa/panduan-uji/02-proposal.md),
  [Aktivitas, Riwayat, Aturan, Pengaturan](qa/panduan-uji/03-aktivitas-riwayat-aturan-pengaturan.md),
  [Tanya AISA, WhatsApp, Form](qa/panduan-uji/04-tanya-aisa-whatsapp-form.md).
- [`AI_USAGE.md`](AI_USAGE.md) — how AI coding assistants were used and what people decided.
- [`reference/contracts/aisa-firestore.md`](reference/contracts/aisa-firestore.md) — collection
  shapes and enum values. The Python Pydantic models are its source of truth; the dashboard
  only reads.

## Generated reference

Derived from source by `pnpm docs:generate` and never edited by hand — `pnpm docs:check`
fails while any of them disagrees with the code they are generated from.

- [`reference/commands.md`](reference/commands.md) — every script this repo defines, what it
  runs, and when you would reach for it.
- [`reference/configuration.md`](reference/configuration.md) — every environment variable,
  required or optional, server-side or inlined into the browser bundle.
- [`reference/capabilities.md`](reference/capabilities.md) — what ships optional, and what
  decides whether each capability is on.
- [`reference/project-layout.md`](reference/project-layout.md) — the directory map.

## Why it is built this way

- [`explanation/product-context.md`](explanation/product-context.md) — what this starter is
  for, who it is for, and what it deliberately is not.
- [`explanation/architecture.md`](explanation/architecture.md) — the spine: how the seams
  connect and why.
- [`explanation/request-auth-data-flow.md`](explanation/request-auth-data-flow.md) — one
  request, end to end.
- [`explanation/capability-model.md`](explanation/capability-model.md) — why capabilities are
  removable seams, and what makes one removable.
- [`explanation/deployment-model.md`](explanation/deployment-model.md) — why deployment is
  shaped this way, including why no deploy job ships in CI.
- [`explanation/reusability-model.md`](explanation/reusability-model.md) — how the standard
  entity path owns the repeated mechanics once, and where an unusual entity replaces a piece.

## Handoffs

Transient working notes, kept only while their work is in flight. They are historical records
— they may reference paths that have since moved, and that is expected.

- [`handoffs/2026.07.21-0010-next-generation-foundation/README.md`](handoffs/2026.07.21-0010-next-generation-foundation/README.md)
- [`handoffs/2026.07.21-0020-admin-account-module/README.md`](handoffs/2026.07.21-0020-admin-account-module/README.md)
- [`handoffs/2026.07.21-0030-aixel-project-readme-standard/README.md`](handoffs/2026.07.21-0030-aixel-project-readme-standard/README.md)
- [`handoffs/2026.07.22-0040-postgresql-candidate-execution/README.md`](handoffs/2026.07.22-0040-postgresql-candidate-execution/README.md)
- [`handoffs/2026.07.22-0050-reusability-hardening/README.md`](handoffs/2026.07.22-0050-reusability-hardening/README.md) — reusable-core hardening execution baton.
- [`handoffs/2026.07.22-0050-reusability-hardening/postgresql-fork-audit.md`](handoffs/2026.07.22-0050-reusability-hardening/postgresql-fork-audit.md) — invariant-first PostgreSQL fork audit matrix.
- [`handoffs/2026.07.24-0060-cross-fork-sync/README.md`](handoffs/2026.07.24-0060-cross-fork-sync/README.md) — cross-fork convergence baton; static audit, nothing driven.
- [`handoffs/2026.07.24-0060-cross-fork-sync/fs-export-search-widening.md`](handoffs/2026.07.24-0060-cross-fork-sync/fs-export-search-widening.md) — confirmed: asset exports ignore the list's search.
- [`handoffs/2026.07.24-0060-cross-fork-sync/fs-realtime-stream-recovery.md`](handoffs/2026.07.24-0060-cross-fork-sync/fs-realtime-stream-recovery.md) — confirmed: a refused realtime stream never recovers.
- [`handoffs/2026.07.24-0060-cross-fork-sync/fs-e2e-coverage-parity.md`](handoffs/2026.07.24-0060-cross-fork-sync/fs-e2e-coverage-parity.md) — four security surfaces never driven in a browser.
- [`handoffs/2026.07.24-0060-cross-fork-sync/fs-env-failfast-proof.md`](handoffs/2026.07.24-0060-cross-fork-sync/fs-env-failfast-proof.md) — the env fail-fast proof misses the standalone `.env` copy.
- [`handoffs/2026.07.24-0060-cross-fork-sync/fs-keyset-cursor-verdict.md`](handoffs/2026.07.24-0060-cross-fork-sync/fs-keyset-cursor-verdict.md) — verdict: the cursor contract is not a gap; do not port.
- [`handoffs/2026.07.24-0060-cross-fork-sync/pg-digest-guard.md`](handoffs/2026.07.24-0060-cross-fork-sync/pg-digest-guard.md) — PostgreSQL brief: production-image digest guard.
- [`handoffs/2026.07.24-0060-cross-fork-sync/pg-hardening-backport.md`](handoffs/2026.07.24-0060-cross-fork-sync/pg-hardening-backport.md) — PostgreSQL brief: post-fork hardening backport.
- [`handoffs/2026.07.24-0060-cross-fork-sync/pg-form-bridge.md`](handoffs/2026.07.24-0060-cross-fork-sync/pg-form-bridge.md) — PostgreSQL brief: server-action form bridge.
- [`handoffs/2026.07.24-0060-cross-fork-sync/pg-local-ci.md`](handoffs/2026.07.24-0060-cross-fork-sync/pg-local-ci.md) — PostgreSQL brief: local-first CI.
- [`handoffs/2026.07.24-0060-cross-fork-sync/pg-template-parity.md`](handoffs/2026.07.24-0060-cross-fork-sync/pg-template-parity.md) — PostgreSQL brief: feature-scaffold parity.
