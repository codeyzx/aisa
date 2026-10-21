<!--
GENERATED FILE — DO NOT EDIT BY HAND.

Regenerate with: pnpm docs:generate
Generated from:
  - the working tree, as git reports it

Hand edits are overwritten by the next run. `pnpm docs:check` fails its
generated-drift rule for as long as this file disagrees with the sources
above, so a source that moves ahead of this doc is a red check, not a
silently stale page.
-->

# Project layout

Where things live, one level down. Enumerated from the tree rather than maintained by hand, so a directory that appears without a line here is a failed check rather than a surprise six months later.

What is listed: every directory the repository intends to contain, plus one level inside it, plus the behaviour-carrying TypeScript files at the root. Individual files inside a directory are deliberately not listed — that is what the tree itself is for.

## Directories

- `.agents/` — Runnable procedures for agents, shared across agent tooling.
  - `skills/` — The procedures themselves, one directory each.
- `.claude/` — Claude-specific entry points, symlinked at the shared procedures.
  - `skills/` — Symlinks to the shared procedures.
- `.github/` — CI configuration and dependency automation.
  - `workflows/` — The pipeline definition.
- `.vscode/` — Editor settings and recommended extensions, checked in so the tree formats the same for everyone.
- `app/` — Routes. Pages, layouts and HTTP route handlers.
  - `(app)/` — The authenticated shell: dashboard, admin, and the example routes.
  - `403/` — The refusal page a denied capability lands on.
  - `api/` — HTTP route handlers — session, export, health, storage.
  - `login/` — Sign-in and password reset.
  - `password/` — Password change for a signed-in user.
- `components/` — Shared presentation. Nothing here reaches for a feature.
  - `pdf/` — Presentation shared by generated documents.
  - `shell/` — The application shell: sidebar, navigation, impersonation banner.
  - `ui/` — The primitive component set the rest of the UI is built from.
- `docs/` — The documentation surface. Its own index maps it.
- `e2e/` — Browser specs driven against a running app.
- `features/` — Vertical slices, one directory per entity, each owning its schema, repo, actions and UI.
  - `_template/` — The copy-me entity template. Excluded from the normal typecheck, checked separately.
  - `asset/` — The worked example entity, wired through every seam at once.
- `hooks/` — Shared React hooks that no single feature owns.
- `lib/` — Shared non-visual code: the seams every feature builds on.
  - `actions/` — Server actions that belong to no single feature: account, password, impersonation.
  - `ai/` — The inference seam: provider, model choice, config.
  - `api/` — The HTTP contract: response envelope, error taxonomy, correlation id, typed client fetcher.
  - `audit/` — The account audit trail.
  - `auth/` — Sessions, claims, roles, guards, revocation, impersonation.
  - `data/` — The data path shared by every entity: the action contract, converters, pagination, counters, timestamps, batching.
  - `env/` — Environment configuration and the boot-time capability manifest.
  - `export/` — Handing a human a file: CSV, spreadsheet, PDF, and the download seam.
  - `firebase/` — SDK bootstrap for both runtimes, plus the typed collection accessors.
  - `format/` — Display formatting: currency, dates, numbers, locale.
  - `http/` — Rate limiting, origin checks, and content-disposition handling.
  - `list-toolbar/` — The shared search, filter and scope toolbar for list views.
  - `log/` — The structured logger and its levels.
  - `observability/` — Error monitoring: config and the field allow-list that decides what may leave.
  - `repos/` — Repositories no single feature owns.
  - `schemas/` — Schemas no single feature owns.
  - `storage/` — The object-storage seam: keys, limits, the upload contract.
- `public/` — Static assets served as-is.
- `rule-tests/` — Fixtures proving the structural lint rules fire and do not over-fire.
- `rules/` — Repo-specific structural lint rules.
- `scripts/` — Executable tooling. Runs under plain Node, no build step.
  - `docs/` — The documentation gate and this generator.
  - `migration/` — The migration runner and its template.
  - `snapshot/` — Database export and restore.
  - `structure/` — The architecture gate.
- `test/` — Test infrastructure shared across suites.
  - `builders/` — Fixture builders shared by suites.
  - `integration/` — Emulator-backed tests.
  - `stubs/` — Module stubs the unit runner substitutes.

## Root files

- `instrumentation-client.ts` — Browser-side startup.
- `instrumentation-node.ts` — Server startup, where the boot-time capability check runs.
- `instrumentation.ts` — The runtime-dispatching startup entry point.
- `next.config.ts` — Framework configuration, the security-header baseline, and the build-time public-env gate.
- `playwright.config.ts` — Browser-suite configuration.
- `proxy.ts` — The request-path middleware.
- `vitest.config.ts` — Test-runner configuration.
