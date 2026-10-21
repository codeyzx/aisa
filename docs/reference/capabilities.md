<!--
GENERATED FILE — DO NOT EDIT BY HAND.

Regenerate with: pnpm docs:generate
Generated from:
  - lib/env/registry.ts
  - lib/env/client.ts
  - lib/auth/capability-availability.ts

Hand edits are overwritten by the next run. `pnpm docs:check` fails its
generated-drift rule for as long as this file disagrees with the sources
above, so a source that moves ahead of this doc is a red check, not a
silently stale page.
-->

# Capabilities

What this starter ships that a fork can turn off or delete, and what decides whether each one is on.

There are two different questions here and they must not be collapsed. "Does this deployment ship the feature at all" is answered by configuration, below. "May this person use it" is answered by roles, which is a separate mechanism. Why they stay separate: [the capability model](../explanation/capability-model.md).

## Server capabilities validated at boot

Each entry is one line in the capability manifest. Every ENABLED entry is forced to parse its config when the server starts, and every failure is collected rather than stopping at the first — a fresh clone sees everything it has to fix in one boot. A capability that reads environment without being registered here is not in that pass — why registration is the single act that prevents it is argued in [the capability model](../explanation/capability-model.md).

### Firebase project

- Ships: ON, with no toggle
- Config validated by: `getFirebaseProjectId` in `lib/env/server.ts`

Which project the server talks to. Not a capability you can remove: without a project there is nothing to talk to, so this differs in kind from everything below it.

### Firebase Admin credential

- Ships: conditionally — see the gate below
- Gate: `() => !isEmulatorTarget()`
- Config validated by: `getFirebaseAdminConfig` in `lib/env/server.ts`

The project id plus, optionally, a service-account key pair; with no key the Admin SDK uses Application Default Credentials. Not checked against an emulator target, which authenticates with nothing.

### aisa-api

- Ships: ON, with no toggle
- Config validated by: `getAisaApiConfig` in `lib/aisa-api/config.ts`

The Python service every dashboard write goes through (responses, corrections, rules, STOP/LANJUT, uploads). Required: without it the dashboard would render but every action would fail.

## Public config groups validated at build

The public-side counterpart. A capability that owns public configuration is listed by one call here rather than declaring its schema centrally, so deleting the capability removes a line instead of leaving an orphan schema behind.

- `getFirebaseClientConfig` in `lib/env/client.ts` — The public Firebase web config. Not removable — it is how the browser reaches the project at all.
- `getClientEmulatorConfig` in `lib/env/client.ts` — The browser-side Auth emulator target. Unset in a normal run, which is what makes a build sign in against real Firebase.
- `getObservabilityConfig` in `lib/observability/config.ts` — Error monitoring. Off unless a DSN is set: with none, the SDK is never initialized and every capture is a no-op.

## Permissions withheld by deployment config

No permission is currently withheld by deployment config.

The variables each capability requires are listed in [`configuration.md`](configuration.md), which owns that detail.
