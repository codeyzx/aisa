<!--
GENERATED FILE — DO NOT EDIT BY HAND.

Regenerate with: pnpm docs:generate
Generated from:
  - lib/env/client.ts
  - lib/env/server.ts
  - lib/storage/config.ts
  - lib/ai/config.ts
  - lib/auth/impersonation.config.ts
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

## Public Firebase and emulator config

Declared in `lib/env/client.ts`. Validated at BUILD time by the gate `next.config.ts` calls. These are inlined into the browser bundle, so a missing one has to fail the build — it cannot be fixed afterwards.

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

Firebase project the browser talks to. Must name the same project as the server-side project id, or sign-in succeeds against an account the server cannot see.

### `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase storage bucket for the web SDK.

### `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase messaging sender id for the web SDK.

### `NEXT_PUBLIC_FIREBASE_APP_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Firebase web app id.

### `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST`

- Requirement: optional — may be left unset
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Point the BROWSER Firestore SDK at a local emulator. Unset for a normal run. Must move together with its server-side twin.

### `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`

- Requirement: optional — may be left unset
- Scope: client — INLINED into the browser bundle at build time, so treat it as public

Point the BROWSER auth SDK at a local emulator. Unset for a normal run.

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

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Service-account identity from a service-account JSON key. Not demanded while an emulator host is set — an emulator authenticates with nothing.

### `FIREBASE_PRIVATE_KEY`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Service-account private key, the full PEM. A literal backslash-n sequence is normalized to real newlines at read time, because env UIs store it that way.

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

## Object storage

Declared in `lib/storage/config.ts`. Owned by the storage capability, so deleting the capability deletes the schema with it. Generic on purpose: nothing in the code names a backend, so swapping backends is an env change.

### `S3_ENDPOINT`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Object-storage endpoint the SERVER uses. Requests are path-style, so this is the bare host and not a bucket URL.

### `S3_PUBLIC_ENDPOINT`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser

Object-storage endpoint the BROWSER uses, when it differs from the server one. Presigned URLs are signed against a host, so they are minted with this. Defaults to S3_ENDPOINT; set it wherever the app and the reader reach storage at different addresses, as under Compose.

### `S3_REGION`

- Requirement: optional — defaults to `us-east-1`
- Scope: server only — read at run time and never sent to the browser

Signature v4 needs a region even where the backend ignores it. Some managed backends mandate a specific value.

### `S3_BUCKET`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Bucket every upload lands in.

### `S3_ACCESS_KEY_ID`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Object-storage access key id.

### `S3_SECRET_ACCESS_KEY`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Object-storage secret access key.

## Inference

Declared in `lib/ai/config.ts`. Owned by the AI capability, which ships turned OFF. Intent is stated separately from the credential so a forgotten or mistyped key is a loud refusal rather than silently-disabled inference.

### `AI_ENABLED`

- Requirement: optional — may be left unset
- Scope: server only — read at run time and never sent to the browser
- Accepted values: `true`, `false`, `1`, `0`

Whether inference ships turned on. A strict enum, not a truthiness check: an unrecognized value is rejected at boot rather than read as off. Unset means off, and off means no key is read and no provider is initialized.

### `ANTHROPIC_API_KEY`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

Inference credential, read by the provider SDK itself — so the name is fixed rather than chosen. Only meaningful while inference is on; then the app refuses to boot without it rather than failing on first use.

## Impersonation

Declared in `lib/auth/impersonation.config.ts`. Owned by the impersonation capability. Its own key rather than a reused one, which is what keeps the capability deletable.

### `IMPERSONATION_SECRET`

- Requirement: REQUIRED — the boundary refuses an absent or empty value
- Scope: server only — read at run time and never sent to the browser

HMAC signing key for the impersonation ticket. At least 32 characters, because the secret's whole value is its entropy. Generate one per environment and never reuse it. Shipped empty on purpose: any value shipped here would validate, and something that works is never replaced.

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
