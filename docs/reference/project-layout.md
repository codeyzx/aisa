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
  - `(app)/` — The authenticated shell: the AISA pages.
  - `403/` — The refusal page a denied capability lands on.
  - `api/` — HTTP route handlers — session and health.
  - `login/` — Sign-in: Firebase email/password, then a session cookie.
- `components/` — Shared presentation. Nothing here reaches for a feature.
  - `shell/` — The application shell: sidebar, navigation, topbar.
  - `ui/` — The primitive component set the rest of the UI is built from.
- `docs/` — The documentation surface. Its own index maps it.
- `e2e/` — Browser specs driven against a running app.
  - `acceptance/` — Acceptance specs for the AISA screens and write buttons, with a mock `aisa-api` the container calls.
- `features/` — Vertical slices, one directory per entity, each owning its schema, repo, actions and UI.
  - `_template/` — The copy-me entity template. Excluded from the normal typecheck, checked separately.
  - `aisa/` — The AISA read model: zod mirrors of the Firestore contract, repos, labels, and the server actions that call `aisa-api`.
- `hooks/` — Shared React hooks that no single feature owns.
- `integrations/` — Code that runs outside this app and feeds AISA (the Google Apps Script form hook).
  - `apps-script/` — The Apps Script bound to the intake Google Form; posts each response to `aisa-api`.
- `lib/` — Shared non-visual code: the seams every feature builds on.
  - `aisa-api/` — The server-only client for the Python `aisa-api`: config, fetch, and outcome shape.
  - `api/` — The HTTP contract: response envelope, error taxonomy, correlation id, typed client fetcher.
  - `auth/` — The session DAL, roles and capabilities, guards.
  - `data/` — The data path shared by every entity: the action contract, converters, pagination, counters, timestamps, batching.
  - `env/` — Environment configuration and the boot-time capability manifest.
  - `firebase/` — SDK bootstrap for both runtimes, plus the typed collection accessors.
  - `format/` — Display formatting: currency, dates, numbers, locale.
  - `http/` — Rate limiting and origin checks.
  - `log/` — The structured logger and its levels.
  - `observability/` — Error monitoring: config and the field allow-list that decides what may leave.
  - `repos/` — Repositories no single feature owns.
  - `schemas/` — Schemas no single feature owns.
- `public/` — Static assets served as-is.
- `rule-tests/` — Fixtures proving the structural lint rules fire and do not over-fire.
- `rules/` — Repo-specific structural lint rules.
- `scripts/` — Executable tooling. Runs under plain Node, no build step.
  - `docs/` — The documentation gate and this generator.
  - `migration/` — The migration runner and its template.
  - `snapshot/` — Database export and restore.
  - `structure/` — The architecture gate.
- `services/` — The Python AISA services (aisa-api). Owned outside this app; the dashboard only calls them.
  - `api/` — aisa-api: the FastAPI service every dashboard write goes through, and the Pydantic models the Firestore contract mirrors.
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
