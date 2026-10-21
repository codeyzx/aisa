# Storage contract

- Type: Reference — normative contract
- Owns: object storage — presigned uploads and downloads, object keys, the staging → durable promotion, and the storage removal checklist
- Source of truth: `lib/storage/` (`s3.ts`, `keys.ts`, `limits.ts`, `config.ts`, `upload.contract.ts`, `attachment-lifecycle.ts`), `hooks/use-upload.ts`, `app/api/storage/upload-url/route.ts`
- Verified by: `pnpm test` (the colocated `lib/storage/*.test.ts` assert key layout and the request contract without credentials) plus `pnpm build:ci`, which is what actually enforces the `server-only` client-import boundary
- Read when: adding an upload or a download, touching anything under `lib/storage/`, or deleting the storage capability
- Does not define: the API envelope and error taxonomy the presign route answers ([HTTP API contract](http-api.md)), who may call it ([auth contract](auth.md)), or the bucket lifecycle rule that reaps staging (a backend knob — [the deploy runbook](../../how-to/deploy.md) sets it)

The contract for putting bytes somewhere and getting them back, for both humans
and Claude.

## The layers, and why there are three files rather than one

```
lib/storage/limits.ts    MAX_UPLOAD_BYTES
  |   Plain constants. NO `server-only`, NO credential-touching import.
  |   The browser needs this number.
  v
lib/storage/keys.ts      buildKey() · sanitizeFilename() · promoteKey()
  |   Pure + dependency-free. A key IS a path, so this is the paranoid layer.
  |   No credentials, so the key layout is assertable in a plain unit test.
  v
lib/storage/s3.ts        presignUpload() · presignDownload() · moveObject() · PRESIGN_TTL_SECONDS
      `import 'server-only'` — LOAD-BEARING. Reads `getStorageConfig()`, which holds
      the secret access key. A client import fails the BUILD rather than
      shipping a credential to the browser.
```

**The split is the convention, not an accident of tidying.** `hooks/use-upload.ts`
runs in the browser and needs `MAX_UPLOAD_BYTES`. If that constant lived in
`s3.ts`, importing it would drag `s3.ts`'s `server-only` marker — and the S3
secret it reads — toward the client bundle: a build failure at best, a leaked
credential at worst. `keys.ts` is split for the second reason: staying
dependency-free is what makes the key layout testable without credentials.

`lib/storage/upload.contract.ts` applies the same idea to the wire. The Zod
schema for the presign request reads `MAX_UPLOAD_BYTES` from `limits.ts`, so the
route and the browser hook parse against ONE definition of the request rather
than two that happen to agree today.

## MUST / MUST-NOT

- **MUST reach storage through `lib/storage/s3.ts`.** Nothing else constructs an
  `S3Client`. The module is GENERIC by construction — nothing in it names a
  backend, so swapping self-hosted SeaweedFS for Cloudflare R2 is an `S3_*` env
  change and nothing else.
- **MUST presign against the endpoint the BROWSER can reach.** SigV4 signs the
  `host`, so the address in a presigned URL is decided by the client that minted
  it and cannot be rewritten afterwards without invalidating the signature. There
  are therefore TWO addresses, not one: `S3_ENDPOINT` is where the SERVER reaches
  storage (copy, delete, server-side put) and `S3_PUBLIC_ENDPOINT` is where the
  reader's browser does. `s3Client()` is bound to the first, `presignClient()` to
  the second, and presigning **MUST NOT** use `s3Client()`. `S3_PUBLIC_ENDPOINT`
  is optional and defaults to `S3_ENDPOINT`, so a deployment where one address
  serves both needs no new configuration — which is why this was invisible on the
  host dev path and broke the instant the app ran in a container: under Compose
  the app reaches storage at `http://seaweedfs:8333`, a name that resolves only
  on the compose network, so every presigned upload handed the browser an
  unreachable host. The same split applies to any deployment whose app talks to
  storage over a private hostname or VPC endpoint.
- **MUST NOT import `lib/storage/s3.ts` from client code.** Its `server-only` is
  the enforcement, and the compiler is what enforces it. Do not add a lint rule
  for this — see "What is deliberately not enforced here".
- **MUST build every object key with `buildKey()`.** Never concatenate a key by
  hand, and never let a user-supplied filename reach a key unsanitized. A key is
  a path: the bucket has no directories, so `a/../b` is resolved by nothing —
  but every consumer downstream (a proxy, a CDN, an unzip, a filesystem mirror,
  a URL) may resolve it. That is how you get path traversal out of the bucket and
  cross-tenant writes inside it.
- **MUST pass the session uid as `ownerId`, never a client-supplied id.** The
  `ownerId` path segment IS the tenant boundary: paired with a presign that signs
  that exact key, a caller can only ever write under their own uid. A
  client-supplied id turns the boundary into a suggestion.
- **MUST keep `limits.ts` free of anything that is not a plain constant**, and
  `keys.ts` free of credentials and `server-only`. Both files are split from
  `s3.ts` precisely so the browser can reach them; an import that reintroduces
  the coupling silently retires the split.
- **MUST sign the content length into a presigned upload.** Without a signed
  length a presigned PUT is an **unbounded write**. The browser-side check in
  `useUpload` is a fast, friendly pre-flight and nothing more — `MAX_UPLOAD_BYTES`
  is enforced server-side by signing it, so a client that lies about its size
  gets a signature failure rather than a huge object in the bucket. The presigner
  INFERS content-length rather than taking it from `signableHeaders`, so this
  claim went a long time unproven; `s3.test.ts` now asserts `content-length` is
  in `X-Amz-SignedHeaders`, and it is.
- **MUST configure CORS on the storage backend for the browser upload path.**
  The default flow is a cross-origin `PUT` from the app's origin to
  `S3_PUBLIC_ENDPOINT` (`hooks/use-upload.ts`), which a browser preflights. The
  backend must allow that origin, the `PUT`/`GET` methods, and the `content-type`
  header, or every upload fails in the browser while every server-side test keeps
  passing — the failure is invisible to `pnpm verify` and to any check that does
  not drive a real browser. This repo configures no CORS for the local SeaweedFS
  stack, so treat it as a deployment step you own, and see "Not proven here"
  below for what that means for the evidence.
- **MUST NOT lengthen `PRESIGN_TTL_SECONDS` (300) globally to fix one slow
  upload.** A presigned URL is a bearer credential: whoever holds it has the
  access, so the TTL is the blast radius of a leak (browser history, a `Referer`
  header, a shared screenshot, an access log, a chat paste). The clock stops when
  the PUT/GET _starts_, not when it completes — only initiation must beat the
  deadline, which is why 5 minutes is not as tight as it looks. A caller who
  genuinely needs longer passes `expiresInSeconds` at the call site, where it is
  reviewable.
- **MUST NOT remove `requestChecksumCalculation: 'WHEN_REQUIRED'`** from the
  client config. It looks like tuning; it is load-bearing. The SDK defaults to
  `WHEN_SUPPORTED`, which pins a CRC32 of the body into the request — but while
  PRESIGNING there is no body, so it pins the CRC32 of an EMPTY body into the
  query string, and the backend then rejects the real bytes with `BadDigest`.
  Without this, **every presigned PUT 400s** — a failure that passes typecheck,
  lint and build.
- **MUST write the key down.** An upload whose key is never persisted is an
  orphan billing you forever.

## The capability coupling — two gates on one screen

A screen that uploads is gated **twice, by two different capabilities**. The asset
form pages call `requireCapability('asset:write')`
(`app/(app)/(examples)/assets/new/page.tsx`, `.../[id]/edit/page.tsx`) while the
presign route calls `authorizeSession('storage:write')`
(`app/api/storage/upload-url/route.ts`). Two gates, one screen.

Today they cannot diverge: both are **admin-only**, and `ROLE_CAPABILITIES.user`
in `lib/auth/rbac.ts` holds neither — a `user` holds the read halves
(`asset:read`, `storage:read`) and so never reaches the form at all. There is
deliberately **no UI branch computing `can()`** to hide the upload control: UI
gating is never the boundary, and branching here would buy polish for a state
that cannot occur while putting an RBAC fork in the surface every project copies.

**The divergence becomes real the moment a project grants one capability without
the other** — granting `storage:write` to `user` but not `asset:write`, or the
reverse. If you change `ROLE_CAPABILITIES` that way, this coupling is what to
revisit: the form gate and the presign gate are separate answers to "may this
person upload", and only one of them is the security boundary.

## Two prefixes: `uploads/` is staging, `assets/` is durable

A presigned upload lands under `uploads/` (`STAGING_PREFIX`) and may never be
submitted — the reader picks a file, then closes the tab. So an **unreferenced
`uploads/` object is EXPECTED, not a leak**, and the ops side reaps it: an S3
**lifecycle-expiration** rule deletes everything under `uploads/` after a day.
That rule is a backend knob rather than app configuration — [the deploy runbook](../../how-to/deploy.md) is where it gets set.

The reaper is exactly why a submitted file cannot stay under `uploads/`. The
asset doc persists the object's key (`attachmentKey`); if that key were still a
`uploads/` key, the lifecycle rule would eventually delete a **referenced**
file — silent data loss. So **submit PROMOTES the object across the boundary**:
`promoteKey()` maps `uploads/<rest>` → `assets/<rest>` (`DURABLE_PREFIX`), and
`moveObject()` does the server-side copy-then-delete. The durable key is what the
doc stores; the reaped prefix never holds a referenced object.

- **MUST promote a submitted upload before persisting its key.** The generic
  lifecycle lives in `lib/storage/attachment-lifecycle.ts` (`promoteAttachment`);
  the reference feature calls it from `features/asset/asset.action.ts` BEFORE the
  doc write. Persisting a raw `uploads/` key is the data-loss bug above waiting
  for the lifecycle rule to fire. Every entity that keeps an upload reuses this
  one module — only its orphan audit tag is passed in per entity.
- **`promoteKey()` is idempotent and rejects loudly.** A key already under
  `assets/` returns unchanged (an edit that keeps its attachment re-promotes the
  same key — a no-op, no needless copy); a key under any other prefix THROWS.
  These keys come from app code and the verified session, so a foreign prefix is
  a bug, not user input.
- **The pure key logic lives in `keys.ts`, the I/O in `s3.ts`.** `promoteKey`
  decides; `moveObject` moves. Same split as `buildKey` (pure) vs `presignUpload`
  (credentialed) — see the layers diagram above.
- **Promote-then-write-fail cleans up after itself.** If the doc write throws
  after a successful promote, the action reaps the just-promoted durable object
  (same never-throw reaper as delete) before re-throwing, so a failed submit
  cannot strand a durable orphan.
- **A promote that PARTIALLY fails is classified, not thrown.** The clause above
  covers only a failure of the doc WRITE. `moveObject` itself has two outcomes
  between success and failure, and both used to throw — from `promoteAttachment`,
  which runs before the write and OUTSIDE the compensating catch, so the throw
  escaped every cleanup path:
  - **Ambiguous copy.** S3's CopyObject can answer HTTP 200 with an error inside
    the body, which the SDK resolves rather than rejects. `moveObject` inspects
    the response and treats a missing `CopyObjectResult` as a failed copy, so it
    **MUST NOT** reach the delete — otherwise the source is destroyed, the
    destination never existed, and the doc points at a key with no object.
  - **Delete failure after a good copy.** The bytes ARE durable, which is what
    the caller asked for, so this **MUST** return `sourceDeleted: false` rather
    than throw. Throwing abandoned a durable object with nobody holding a
    reference to reap it, and the lifecycle rule covers only the staging prefix,
    so it billed forever with no record. The leftover source sits under that
    TTL-reaped prefix and cleans itself up; `promoteAttachment` logs it because a
    failing delete is worth knowing about, not because anything is at risk.

## When to use what

- **Default: the presigned direct upload** (`presignUpload`). Bytes go
  browser → storage and never through the Next server, so an upload costs no
  serverless body-size limit and no bandwidth.
- **Reach for a server-proxied upload only when you must inspect or transform
  the bytes** (virus scan, image re-encode). You are paying the body limit and
  the bandwidth deliberately, and the reason belongs in a comment.
- **`presignDownload` for private objects.** Same bearer-credential reasoning,
  same TTL.

## What is deliberately NOT enforced by a rule here

The client → `server-only` import boundary. `rules/` holds the structural
conventions ast-grep can check, and this boundary is deliberately absent from
it: Next vendors `server-only` and aliases a throwing module or a no-op by
bundle layer, so the **compiler** already enforces it and `pnpm build` is
already in the gate. An ast-grep version could only know which paths are
server-only from a hand-kept list — a copy of a set `import 'server-only'`
already models per-module, which caps itself silently the day someone adds a
module and forgets the list. See `sgconfig.yml` for the full argument.

## Not proven here — the browser half of the upload path

The addressing rule above is unit-proven: `s3.test.ts` asserts a presigned URL
carries the PUBLIC endpoint's origin, and fails if presigning goes back through
`s3Client()`. That is signature-level evidence, and it is not the same as a
working upload.

What no check in this repo drives, and what a deployer must therefore drive
themselves before believing the path works:

- an actual browser `PUT` to a presigned URL, from the app's origin, against the
  containerized stack — the case the single-endpoint bug broke, and the only one
  that proves the address is reachable rather than merely correct;
- the CORS preflight for that `PUT`. Nothing here configures CORS, so this is a
  deployment step, and its failure mode is browser-only: `pnpm verify` stays
  green while every upload fails;
- the signed content-length actually being REJECTED by the backend when a client
  sends more bytes than it declared. The signature is proven to contain the
  length; enforcing it is the backend's behaviour, not this repo's.

Do not read a green gate as evidence for any of the three.

## Removal checklist

`lib/storage` is pull-based: nothing wires it into the shell, so removing it is
`trash` plus fixing whatever imported it.

- `trash lib/storage/` (`s3`, `keys`, `limits`, `upload.contract`,
  `attachment-lifecycle`, **`config`** and the colocated tests), `trash
hooks/use-upload.ts`, `trash
app/api/storage/`, `trash "app/(app)/(examples)/storage"`. The `S3_*` schema
  lives in `lib/storage/config.ts`, so it goes with the directory — there is no
  shared env file to edit.
- `lib/http/content-disposition.ts` is SHARED with the export download response,
  so leave it unless export is going too. If you are removing both capabilities,
  it is orphaned — `trash` it then, and only then.
- Grep for `@/lib/storage` and `useUpload`; remove the storage entry from
  `app/navigation.ts`.
- Remove the **S3 line from `lib/env/registry.ts`**'s `CAPABILITY_CONFIGS` — that
  entry is what requires the `S3_*` secrets at boot while storage ships, and it
  imports `lib/storage/config`, so leaving it breaks the build.
- Drop the `S3_*` block from `.env.example`, and the `seaweedfs` service from
  `compose.yaml`.
- `pnpm remove @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`.
- Remove `storage:read` / `storage:write` from `lib/auth/rbac.ts` and the
  matching `EXPECTED_GRANTS` entries in `rbac.test.ts`.
- The reference feature's attachment WIRING goes with it: grep `attachmentKey`
  and drop the `attachment-lifecycle` calls in `features/asset/asset.action.ts`
  plus the field from the asset schema, form and surfaces. (The lifecycle module
  itself is generic and already went with `lib/storage/` above.)
- `pnpm typecheck && pnpm build:ci` must be green afterwards (no dangling imports).
