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

The service-account certificate. Always on, but genuinely not needed on every target — demanding a production key to boot against a local emulator would be config theatre, so the requirement follows the target rather than a toggle you set.

### S3 storage

- Ships: ON, with no toggle
- Config validated by: `getStorageConfig` in `lib/storage/config.ts`

Uploads and downloads through an S3-compatible backend. Ships on and has no toggle: while the capability is present its credentials are boot-required.

### AI

- Ships: conditionally — see the gate below
- Gate: `isAiEnabled`
- Config validated by: `getAiConfig` in `lib/ai/config.ts`

Inference. The one capability that ships turned OFF, so a fresh clone runs with no account at the provider. Turning it on is what makes the credential boot-required.

### impersonation

- Ships: ON, with no toggle
- Config validated by: `getImpersonationConfig` in `lib/auth/impersonation.config.ts`

A sanctioned auth bypass that lets an admin act as another user. Ships on and has no toggle, so its signing secret is boot-required while the feature is present. The highest-risk surface here.

## Public config groups validated at build

The public-side counterpart. A capability that owns public configuration is listed by one call here rather than declaring its schema centrally, so deleting the capability removes a line instead of leaving an orphan schema behind.

- `getFirebaseClientConfig` in `lib/env/client.ts` — The public Firebase web config. Not removable — it is how the browser reaches the project at all.
- `getClientEmulatorConfig` in `lib/env/client.ts` — Browser-side emulator targets. Both values unset in a normal run, which is what makes a build point at real Firebase.
- `getObservabilityConfig` in `lib/observability/config.ts` — Error monitoring. Off unless a DSN is set: with none, the SDK is never initialized and every capture is a no-op.

## Permissions withheld by deployment config

While its capability is switched off, the following permission is refused at the server boundary and never advertised in the UI: `ai:invoke`.

The variables each capability requires are listed in [`configuration.md`](configuration.md), which owns that detail.
