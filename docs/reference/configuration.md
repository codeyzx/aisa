<!--
GENERATED FILE — DO NOT EDIT BY HAND.

Regenerate with: pnpm docs:generate
Generated from:
  - lib/env/server.ts
  - lib/env/client.ts
  - lib/aisa-api/config.ts
  - lib/observability/config.ts
  - lib/log/levels.ts

Hand edits are overwritten by the next run. `pnpm docs:check` fails its
generated-drift rule for as long as this file disagrees with the sources
above, so a source that moves ahead of this doc is a red check, not a
silently stale page.
-->

# Configuration

Every environment variable this repo reads, whether it is required, and whether it reaches the browser.

Two facts here are load-bearing and everything else follows from them. REQUIRED means the boundary refuses to proceed without it — there is no bypass flag anywhere in the env layer, so a missing required value is a failed build or a refused boot, never a warning. And a `NEXT_PUBLIC_` variable is INLINED into the browser bundle: it is public whatever it contains, and it is fixed at build time rather than at run time.

Where a value is validated follows from that split. Public variables are checked during the build, because a bundle that already shipped cannot be corrected. Private variables are checked at boot, capability by capability, so a deployment that ships an enabled capability refuses to start without its secret instead of failing on the first request that needed it.

## Server runtime config

Declared in `lib/env/server.ts`. Private values that no deletable capability owns. Read per request rather than at build, so they never enter the image builder.

### `FIRESTORE_EMULATOR_HOST`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser

Point the SERVER Admin SDK at a local Firestore emulator. Setting either emulator host is what makes the process an emulator target: the Admin credential stops being required, and the destructive data scripts agree to run.

### `FIREBASE_AUTH_EMULATOR_HOST`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser

Point the SERVER Admin SDK at a local auth emulator. Same effect as its Firestore twin.

### `FIREBASE_PROJECT_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Which project the server talks to. Required on both the emulator and the real-project path, which is why it is separated from the certificate it usually travels with.

### `FIREBASE_CLIENT_EMAIL`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser

Service-account identity from a service-account JSON key. Optional: set it together with FIREBASE_PRIVATE_KEY, or leave both unset to use Application Default Credentials (the Cloud Run runtime service account). Exactly one of the pair set is refused at boot.

### `FIREBASE_PRIVATE_KEY`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser

Service-account private key, the full PEM. A literal backslash-n sequence is normalized to real newlines at read time, because env UIs store it that way.

### `FIREBASE_AUTH_SERVICE_ACCOUNT`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser

Optional. The service account Firebase AUTH calls run as, impersonated from the ADC identity through IAM Credentials. For a runtime that holds no `firebaseauth.*` permission and may not mint a key; that identity needs `roles/iam.serviceAccountTokenCreator` on this account. Unset: Auth uses the same credential as Firestore. Ignored against the emulator.

### `LOG_LEVEL`

- Requirement: optional — defaults to `info`
- Scope: server only — read at run time and never sent to the browser
- Accepted values: `debug`, `info`, `warn`, `error`

Structured-log threshold. Per-deployment config rather than a product decision, which is why it is an env key at all. A value outside the enum throws at boot instead of silently falling back — config that lies is worse than config that fails.

### `BUILD_SHA`

- Requirement: optional — defaults to `unknown`
- Scope: server only — read at run time and never sent to the browser

Commit stamp reported by the health route, populated by the image build. Never set it by hand.

### `BUILT_AT`

- Requirement: optional — defaults to `unknown`
- Scope: server only — read at run time and never sent to the browser

Build timestamp reported by the health route, populated by the image build.

## Public Firebase and emulator config

Declared in `lib/env/client.ts`. Validated at BUILD time by the gate `next.config.ts` calls. These are inlined into the browser bundle, so a missing one has to fail the build — it cannot be fixed afterwards. The browser uses them only to sign in.

### `NEXT_PUBLIC_FIREBASE_API_KEY`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase web API key. Not a secret, but environment-specific.

### `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase auth domain for the web SDK.

### `NEXT_PUBLIC_FIREBASE_PROJECT_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase project the browser signs in against. Must name the same project as the server-side project id, or sign-in succeeds against an account the server cannot see.

### `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase storage bucket for the web SDK config.

### `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase messaging sender id for the web SDK config.

### `NEXT_PUBLIC_FIREBASE_APP_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase web app id.

### `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`

- Requirement: optional — may be left unset
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Point the BROWSER auth SDK at a local emulator. Unset for a normal run; an image built with it set is a test artifact.

## AISA API

Declared in `lib/aisa-api/config.ts`. Where the Python `aisa-api` lives and the key it expects. Every dashboard write goes through a server action that calls it, so both are server-only.

### `AISA_API_URL`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Absolute base URL of the Python `aisa-api`. Every write the dashboard makes (responses, category corrections, rules, STOP/LANJUT, uploads) goes there.

### `AISA_API_KEY`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Shared key sent as the `X-AISA-Key` header on every `aisa-api` call. Server only; never reaches the browser.

## Error monitoring

Declared in `lib/observability/config.ts`. Owned by the observability capability. Public by construction — a DSN ships in every browser bundle — and optional, because nobody should need an account with a monitoring vendor to build this starter.

### `NEXT_PUBLIC_SENTRY_DSN`

- Requirement: optional — may be left unset
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Where error events go. Unset means the SDK is never initialized and every capture is a no-op — no network request is made and no UI depends on it.

### `NEXT_PUBLIC_BUILD_SHA`

- Requirement: optional — defaults to `unknown`
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

The same commit as the server-side build stamp, in the form the BROWSER can see, so a client event and a server event about one deploy carry the same release. Two keys for one fact because only a public var is inlined into the client bundle.
