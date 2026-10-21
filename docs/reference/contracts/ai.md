# AI contract

- Type: Reference — normative contract
- Owns: inference — the single provider, the model constant, the deadline, the enable flag, and the AI removal checklist
- Source of truth: `lib/ai/` (`provider.ts`, `model.ts`, `config.ts`), the `AI` entry in `lib/env/registry.ts`, and `unavailableCapabilities()` in `lib/auth/capability-availability.ts`
- Verified by: `pnpm test`, with no key and no network — `lib/ai/provider.test.ts` drives the deadline against the SDK's own mock model, and drives `inferenceModel()` against a mocked `@ai-sdk/anthropic` to prove the enable gate refuses before any credential is read and that the validated key and `DEFAULT_MODEL` are what reach the SDK; `lib/ai/config.test.ts` pins the `AI_ENABLED` enum and `getAiConfig()`'s refusal while off; `lib/ai/model.test.ts` spends `INFERENCE_RATE_LIMIT` through the real limiter; `pnpm build:ci` proves the `server-only` boundary
- Read when: calling an LLM, changing the model or the deadline, turning AI on for a deployment, or deleting the AI capability
- Does not define: the error taxonomy an AI failure is normalized into or the `rateLimit` primitive it borrows ([HTTP API contract](http-api.md)), or who holds `ai:invoke` ([auth contract](auth.md))

The contract for inference (`lib/ai/**`) — the provider, the model choice, the
deadline, and how a caller reaches a model. Read the removal checklist last: this
capability is designed to be deleted, and that is the point of the shape.

> **AI is OFF by default, and there is no keyless "on".** Leave `AI_ENABLED`
> unset and the app runs with no Anthropic account at all. Turn it on and a real
> `ANTHROPIC_API_KEY` is required to boot — there is no stub provider and no
> degraded mode. See "The enable flag" and "The offline double is a mock" below.

## The enable flag: `AI_ENABLED`

Inference is the one capability that ships **disabled**, because it is the one
that bills per call and needs a third-party account a fresh clone does not have.

- unset / `false` / `0` — off. No key is read, `lib/ai/provider.ts` is never
  initialized, the AI nav entry is hidden, `/ai` redirects to `/403`, and the
  server action refuses with `forbidden`.
- `true` / `1` — on. `ANTHROPIC_API_KEY` becomes **required at boot**: a build
  that ships AI enabled and has no key **refuses to serve**, naming the variable.

**Intent is stated separately from the credential, and that separation is the
whole design.** Under "a key being present means on", a forgotten or typo'd key
silently disables inference and nothing on earth can tell "off on purpose" from
"broken" — the failure mode is a feature that quietly is not there. With an
explicit flag, both halves are checkable: the flag says what you meant, the key
check says whether you can deliver it.

The flag is a **strict enum** (`true|false|1|0`), not a truthiness test:
`AI_ENABLED=yes` is **rejected at boot**, never read as off. Same rule as
`LOG_LEVEL` — config that lies is worse than config that fails.

Two layers read the toggle, and they answer different questions:

- `lib/env/registry.ts` gives AI an `enabled: isAiEnabled` entry, so a disabled
  capability is never asked for credentials at boot. Otherwise "off" would still
  demand an API key.
- `lib/auth/capability-availability.ts` lists `ai:invoke` as unavailable while AI
  is off. `requireCapability`, `runAction` and the nav filter all read it, so the
  capability is refused at the server boundary **and** never advertised in the
  nav. This is deliberately NOT folded into `rbac.ts`: a role check answers
  "may this person do it", availability answers "does this deployment ship it at
  all", and an admin denied AI by config has not been denied by permission.

`getAiConfig()` throws if called while AI is off — that is a programming error
(the caller skipped `isAiEnabled()`), not a config error, and its message says so
rather than blaming env.

## One provider, hardcoded

`lib/ai/provider.ts` binds the credential and the model choice to a handle:

```ts
import { generateText } from 'ai'
import { inferenceModel } from '@/lib/ai/provider'

const { text } = await generateText({ model: inferenceModel(), prompt })
```

That is the whole API. There is no registry, no `INFERENCE_PROVIDER`, and no
runtime stub.

### MUST / MUST-NOT

- **MUST** call the SDK directly (`generateText`, `streamText`, `generateObject`,
  `embed`) with `model: inferenceModel()`.
- **MUST NOT** add a `generate()` / `chat()` wrapper that hides the SDK. It is a
  local variant of something the SDK already models generally, and a strictly
  worse one: it caps callers at the one signature we thought of — no tools, no
  schema, no streaming — and it is the file that rots on the next SDK minor.
- **MUST NOT** hand-roll `fetch` to the Anthropic HTTP API. Same rule: the SDK's
  entire job is modelling "a language model".
- **MUST NOT** import `lib/ai/provider` from a client component. It is
  `server-only` because it reads the API key; a client import fails the BUILD
  rather than shipping a credential.
- **MUST NOT** re-add a provider seam, a registry, or an `INFERENCE_PROVIDER` —
  not under another name, not "just for tests".
- **MUST** gate every inference entry point on a capability. Inference bills per
  call, so it fails closed.
- **MUST** make a tool's `execute` call a gated action (or another gated path),
  never a repo or the database directly. Gating the inference entry point is not
  enough: a tool is a SECOND authority the model reaches THROUGH that call, and a
  tool wired straight to a repo mutates or reads with no capability check of its
  own — a back door around the gate. Delegating to the action the human path uses
  makes the tool inherit that path's capability check, validation, audit, and
  rate-limit, so a caller who lacks the tool's capability is refused identically
  whether they click or ask the model. The AI example's `lookupAsset` tool
  (`app/(app)/(examples)/ai/_actions.ts`) delegates to `getAssetAction`, which
  re-checks `asset:read`; the chatbot fork does the same for its order tool.

## The module split is load-bearing

Two credential-touching files plus one plain-constant file, split by **where each
can be imported from** — the same split as `lib/storage` (`s3.ts` / `limits.ts`),
and for the same reason:

- `lib/ai/provider.ts` — `server-only`. Reads `getAiConfig()`, i.e. the secret.
- `lib/ai/config.ts` — `server-only`. The capability's own schema: `isAiEnabled()`
  and `getAiConfig()`. It lives here, not in a shared env module, so
  `trash lib/ai/` takes it along and leaves nothing but one line in
  `lib/env/registry.ts` and one in `lib/auth/capability-availability.ts`.
- `lib/ai/model.ts` — plain constants. No `server-only`, no credential import,
  **so tests, server components and the prompt UI can reach them.**

Keep `model.ts` free of anything that is not a plain constant: a load-bearing
constant living in `provider.ts` drags the `server-only` config boundary into
every test that only wanted the constant, and the test fails on config it never
asked for before it asserts anything.

`INFERENCE_RATE_LIMIT` lives there for both halves of that reason. It is the
per-uid spend budget the AI action passes to `lib/http`'s `rateLimit`, it must be
reachable by a test, and it is the one AI module a client component may import —
which is what lets the prompt form print the real cap instead of a second,
drifting copy of the number. A budget is a module constant here, never an env
key. Its limitation is `lib/http`'s and bounds what it promises: the counter
lives in ONE process, so two replicas double the effective cap and a restart
resets it. It stops one caller burning the account; it is not a global quota and
nothing may describe it as one.

## The model is a constant, not an env key

`DEFAULT_MODEL` in `lib/ai/model.ts` is a module constant. **There is no
`INFERENCE_MODEL`.** Change tier by editing that one line. `claude-haiku-4-5` is
the default — the cheapest, bill-safe floor a fresh clone's first call runs on,
so a fork does not wake up to a surprise invoice; `model.ts` names the tiers
above it.

Ids are Anthropic's taxonomy, not ours, so there is deliberately **no enum** — a
hand-kept model list goes stale and caps what a downstream project can configure.
Use ids **as-is**; never append a date suffix to an alias.

## Timeout and retry — the deadline is not the retry

- The SDK **already retries** (`maxRetries`, default 2). Do **not** add a second
  retry wrapper around a call: it multiplies the attempt count and still is not
  a deadline.
- The deadline is `abortSignal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS)`, which
  actually **cancels** the request. A `Promise.race` only bounds the await and
  leaves the call in flight, billing you for a response nobody reads.

One nuance worth knowing before you trust it: `generateText` **propagates** the
signal to the model; the provider's `fetch` is what aborts. The SDK does not
cancel anything by itself.

## Errors: an AI failure is `INTERNAL` today

`normalizeError` in `lib/api/errors.normalize.ts` branches ZodError → Firebase
string `.code` → gRPC numeric `.code` → `INTERNAL`. An AI SDK error
(`APICallError`, which carries `statusCode` and `isRetryable`) has none of those,
so **an Anthropic 429 surfaces as a generic failure**, not "Too many requests" —
even though the taxonomy already owns `RESOURCE_EXHAUSTED`, `UNAVAILABLE` and
`DEADLINE_EXCEEDED`. The gap is the reader, not the taxonomy.

**Do NOT map AI errors to `ApiErrorCode` inside `lib/ai`.** That forks the
classification path, so two modules answer "what kind of failure was that?"
differently and drift. Widening `normalizeError` with an HTTP-status leg is the
general fix and it belongs to whoever owns `lib/api` — note that it changes
nothing the AI example shows, since server actions never reach `normalizeError`:
`runAction` has its own catch and deliberately collapses everything non-Zod to an
opaque `internal` so internals never leak to the client.

## The offline double is a mock, not a stub

**Never add a runtime stub** — a provider selectable via `INFERENCE_PROVIDER=stub`
is production code: a test concern shipped into every downstream project, and a
second implementation of "a language model" to keep honest forever. Production
keeps one provider and zero branches; the price, accepted deliberately, is that
**local dev with AI on needs a real key.** `AI_ENABLED` is not a stub and must
never grow into one: off means the surface is gone, never that a fake model
answers.

The double lives in tests and is the SDK's own `MockLanguageModelV4` from
`ai/test`, imported by `lib/ai/provider.test.ts` and nowhere else — so CI still
runs offline. Build it on the SDK's interface, never a bespoke
`interface Model { generate(): string }`: a double satisfying a shape we invented
stands in for our idea of a model, not for the model.

The same file also `vi.mock`s the `@ai-sdk/anthropic` MODULE, which is a
different thing and permitted: it stands in for the SDK so that what
`inferenceModel()` hands it — the validated key, `DEFAULT_MODEL` — is assertable.
That is a test-local module mock, not a selectable provider; production still has
one provider and zero branches, and no production code can reach it.

## Removal checklist

`lib/ai` is pull-based: nothing wires it into the shell — there is no provider in
a root `providers.tsx`. Its schema is colocated (`lib/ai/config.ts`), so the
delete takes it along; what remains is exactly **two one-line registrations**.
Note the distinction from simply turning it off: `AI_ENABLED=false` stops the app
asking for a key, but the code still ships. Removing it is `trash` plus fixing
whatever imported it.

- `trash "app/(app)/(examples)/ai"` — the example route (page, `_actions.ts`,
  `_components`).
- `trash lib/ai/` — the whole module (`provider.ts`, `model.ts`, `config.ts`) and
  its colocated tests. `ANTHROPIC_API_KEY` and `AI_ENABLED` stop existing with it.
- Grep for `@/lib/ai` and remove each call site.
- `pnpm remove ai @ai-sdk/anthropic` — this module's only dependencies.
- Remove the **AI line from `lib/env/registry.ts`**'s `CAPABILITY_CONFIGS` — that
  entry is what validates `ANTHROPIC_API_KEY` at boot while AI ships enabled, and
  it imports `lib/ai/config`, so leaving it breaks the build.
- Remove the **`ai:invoke` line from `lib/auth/capability-availability.ts`**'s
  `unavailableCapabilities()` — it also imports `lib/ai/config`. With AI gone that
  function returns an empty list; keep the seam if another capability will use it.
  Then drop `ai:invoke` from `lib/auth/rbac.ts` and the matching `EXPECTED_GRANTS`
  entries in `rbac.test.ts`, and the AI item from `app/navigation.ts`.
- Drop the AI block from `.env.example`.
- `pnpm typecheck && pnpm build:ci` must be green afterwards (no dangling imports).

## Deliberately not here

Egress redaction, prompt-injection fencing, and an eval gate. Each sounds like
basic hygiene, which is exactly why they are named here: the length cap on the
example's prompt is a **cost** bound and is **not** an injection defence. Do not
read it as one.
