# Brief: Post-Fork Hardening Backport

For the PostgreSQL lead. This repository does not edit that workspace; paths below are
destinations for that repository's own commits.

Status: `OPEN — gaps confirmed by static read of both trees`. Effort: L. Severity: correctness,
with one live functional break and one authorization hole.

## Context

After the two repositories split, this one ran a findings-driven hardening pass. Eight of
those fixes are database-agnostic.

**Re-verified 2026.07.25** against the fork at `b5df771`, after its Better Auth migration
completed and Firebase was removed from its tree entirely. Four ports are untouched, two
are partially closed, one had its prose half done for us, and the retention item landed in
a shape this brief did not predict. Each verdict below carries its current state; where a
port shrank, the instruction further down shrank with it.

Two of these are worth reading first because they are not merely parity:

- **Presigned uploads are broken in the fork's containerized path** (Port 3). Every
  presigned upload hands the browser a hostname that resolves only on the compose network.
  Still true at `b5df771`.
- **Per-surface admin gating only partly survived the auth rewrite** (Port 7). Roughly half
  the surfaces are now correctly gated; the rest are still on the coarse gate, and the
  dedicated impersonation capability is read by no UI at all.

## Per-Fix Verdict

- **Proxy matcher — PORT.** The fork's `proxy.ts:78-81` still carries the single old entry
  `['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)']`, and `proxy.test.ts` never
  imports `config`, so a dotted `/api` path skips the proxy entirely. Safe there because
  `/api/auth` and `/api/health` are already in `PUBLIC_PREFIXES`
  (`lib/auth/constants.ts:29`), so a dedicated `/api/:path*` entry cannot break Better
  Auth's mounted routes.
- **Copy-then-delete partial failures — PORT.** `lib/storage/s3.ts`'s `moveObject` returns
  `Promise<void>`, never inspects `CopyObjectResult`, and awaits the delete unguarded. The
  caller `features/asset/asset.attachment-lifecycle.ts:48` is the identical pre-fix shape,
  still running before the row write and outside the compensating catch.
- **Presign endpoint — PORT, and it is a live break.** `lib/storage/config.ts` has only
  `S3_ENDPOINT`, `s3Client()` is the only client, both `presignUpload` and `presignDownload`
  sign through it, and `compose.env:24` is `S3_ENDPOINT=http://seaweedfs:8333` — a name that
  resolves only on the compose network.
- **Mid-stream CSV failure — PORT, but less than first recorded.** A `cancel(reason)` handler
  already exists at `lib/export/csv.ts:97-99`, calling `iterator.return?.(reason)`, so
  consumer-side abort does release the cursor. It predates this audit and the first version of
  this brief missed it. What is still absent: the bare `await iterator.next()` at line 90 has
  no try/catch, there is no truncation marker anywhere in the file, and `DownloadOptions`
  (`lib/export/download.ts:6-9`) is still `{ contentType, filename }` with no correlation id.
  The CSV route streams keyset-batched Postgres reads — if anything more likely to fail
  mid-flight than a Firestore stream — with no guard.
- **Observability — PORT the substance; the prose half is already done.** Still absent: no
  `lib/observability/report.ts`, no `reportError` anywhere under `lib/`, so the action-result
  catch (`lib/data/action-result.ts:42-54`) and `apiFailFrom` (`lib/api/response.ts:110-118`)
  mint a correlation id, log, and reach no monitoring. `scrubEvent`
  (`lib/observability/sentry.ts:72-101`) still allow-lists only `event.request`, so
  `event.extra`, `event.tags` and every `event.contexts` key but one pass through untouched.
  **Already closed:** the stale Firebase prose this brief asked to rewrite is gone — zero
  `firebase` hits remain in those three files. Do not re-do it.
- **Async rate-limit seam — PORT, unchanged, and cheaper there than here.** `lib/http/index.ts`
  still has a synchronous `hit(...): Counter` (line 91) with `Counter` unexported (line 79)
  and a synchronous `rateLimit` (line 135). Still exactly one production caller,
  `app/(app)/(examples)/ai/_actions.ts:74`, already in an async body. The sign-in rate-limit
  work rewrote this module's header and added `lib/http/loopback.ts`, but never touched the
  seam — sign-in throttling is Better Auth's own limiter and does not pass through here.
- **Per-surface admin gating — PORT, roughly half of it.** All five capabilities survive
  (`lib/auth/rbac.ts:33-37`). **Now correctly gated, drop these from the port:** the audit card
  on `/admin`, `accounts/new` (on `admin:users:manage`, deliberately not `:read`), the `[uid]`
  mutating controls, and `impersonate-row.tsx` — which no longer renders a live start button
  for any row, but gives ineligible rows reason text and a disabled non-submit button.
  **Still coarse:** `components/shell/topbar.tsx:82` gates Impersonate on `admin:access`;
  both the "Kelola akun" and "Impersonate pengguna" cards on `app/(app)/admin/page.tsx` are
  ungated at the card level; `app/(app)/admin/accounts/page.tsx:55-62` renders "Buat akun" with
  no check though its destination needs `admin:users:manage`; `user-picker.tsx` still takes no
  actor capability prop; `audit-history.tsx:156` is still a flat `const columns`. Worth stating
  plainly: `impersonation:start` is read by **no UI at all** — only by the action it guards.
- **Self-target refusal — PORT, real hole, unchanged.** `lib/actions/account.action.ts` still
  relies on the Admin plugin's refusals, and `translateAdminError` maps only the ban and remove
  cases. `setAccountPasswordAction` (now lines 208-217) and `signOutAccountSessionsAction`
  (lines 220-228) have no self-guard. `requireRealAdministrator` is not one — it only refuses
  an impersonated actor. So an admin can still reset their own password out from under
  themselves and revoke all of their own sessions.
- **Retention — LANDED, in a different shape. No longer a design note.** The fork shipped
  final-admin protection as a `BEFORE UPDATE OR DELETE` trigger
  (`drizzle/0004_final_admin_guard.sql`), taking `pg_advisory_xact_lock` and raising SQLSTATE
  `AX001`, with `lib/auth/final-admin.ts` translating it and `lib/auth/hooks.ts:321`
  pre-empting the uncontended case. This is **stronger** than an application guard: it binds
  `psql` and a direct `/api/auth/admin/*` request, which is exactly why they moved it — Better
  Auth mounts admin endpoints the application does not own, so the app layer was genuinely not
  the only writer. The old application lease was deleted with it. What did **not** cross over
  is the capability predicate: the rule is a hard-coded `role = 'admin'` literal in two SQL
  sites and two TypeScript sites. That is argued, not accidental — the migration header states
  SQL cannot import the constant that owns the role — and it is pinned by a test that fails if
  the two ever diverge. Record it as a trade the fork made with its eyes open. The residual is
  narrow and worth one sentence in their contract: a future admin-ish role falls outside
  retention and is **detected** by that test rather than **prevented** by construction.

## The Ports

**1 — Proxy matcher.** Copy the two-entry `config.matcher` and the comment explaining why
`/api/:path*` is a separate entry, plus the four matcher test cases and the `matches()`
helper. Verbatim-safe. Do not collapse it back into the negative lookahead. Add a line to the
test noting `/api/auth/**` is public, so the new entry gates nothing Better Auth needs.

**2 — moveObject partial failures.** Copy the result type, the `CopyObjectResult?.ETag` check
that throws _before_ the delete, and the try/catch returning a not-deleted flag. Update the
caller to destructure it and warn when the source survived. Do not copy this repository's
`lib/storage/attachment-lifecycle.ts` path — the fork moved that file under `features/asset/`.
Copy the move test as its own file; `vi.mock` is file-scoped and the existing s3 test drives
the real SDK. Port the storage-contract paragraph, adapting "a failed submit cannot strand a
durable orphan" from document-write to row-write language.

**3 — Presign endpoint.** Add the optional public-endpoint schema entry and field, parameterize
`createClient(endpoint)`, add a presign client, and switch **both** `presignUpload` and
`presignDownload` to it. Add the public endpoint to `compose.env` pointing at
`127.0.0.1:${S3_HOST_PORT:-8333}`, and a commented example to `.env.example`. Port the signed
content-length assertion and the "not proven here" section — a real browser PUT, the CORS
preflight and backend oversize rejection remain uncovered by any check. Register the variable
in `generate-reference.ts` rather than hand-writing the reference table.

**4 — Mid-stream CSV.** Copy the truncation marker, the stream options type, and the guarded
`pull` — with cell rendering _inside_ the guard, and `controller.close()` rather than
`.error()`. **Keep the existing `cancel(reason)` handler**; it already covers consumer-side
abort and the guard is a different failure. Make the correlation id required on the download
options and set the header. Update all three routes: resolve the id once, pass it to both the
stream and the response, log via the error hook. **Adapt the route comment**: this repository
says "a Firestore read error ten thousand rows in"; the fork's source is a keyset-batched
Postgres walk, so say a dropped connection or a cursor error mid-walk. Port the export-contract
paragraph.

**5 — Observability.** Create the report module verbatim (server-only, value import of the
SDK) and call it from the action-result catch-all and from `apiFailFrom` **only** when the
code is internal. Copy the allow-listed tag and context keys, the pick helper, the extra
deletion, the tags and contexts rebuild, and the breadcrumb allow-list. Prove with a full
`pnpm build` that the SDK did not reach the client bundle. Do not copy this repository's
Firebase prose into them. The earlier instruction to also rewrite the fork's own stale
Firebase comments in these files is **spent** — that sweep has since landed, and those headers
now describe Better Auth cookies and a driver-agnostic redaction rationale.

**6 — Async rate-limit seam.** Export the counter type, make the store's `hit` return a
promise, make the memory store's `hit` async, make `rateLimit` async. Do not copy this
repository's session-route change — that route does not exist there. The single call-site edit
is an `await`. Port the latency-driving test (a store resolving on a later microtask) and the
http contract sentence. Note the empty-key guard becomes a rejection rather than a synchronous
throw, so two existing `expect(() => ...).toThrow()` cases must become `rejects.toThrow()` —
that failure is the intended signal, not a surprise.

**7 — Per-surface admin gating.** The rewrite changed _where_ the mutation runs, not which
capability each control exercises, and it has since gated several of these correctly. **Five
edits remain**, one fewer than first written: topbar Impersonate moves to `impersonation:start`;
the admin page's accounts card moves to `admin:users:read` and its impersonation card to
`impersonation:start`; the accounts page's create link moves to `admin:users:manage`; the user
picker takes an actor can-impersonate prop; the audit column list becomes a factory so a
compliance-only reader sees plain text instead of account links. **Do not touch
`impersonate-row.tsx`** — it already withholds the live start button and gives ineligible rows
reason text; that edit is done. **Change no server gate and restructure no route.** Carry this
repository's residual note forward: a role holding `admin:users:read` but not
`impersonation:start` sees a disabled button with no reason text.

**8a — Self-target refusal.** Add a self-target forbidden error to the password-set and
session-revoke actions, comparing the parsed uid against the session uid. Do not rely on the
error translator — Better Auth emits no self-target code for these two operations. Keep the
reasoning in the comment (either one strips the actor's own credential or session
mid-operation; a personal "sign me out everywhere" flow is separate product work) and drop any
finding identifier.

**8b — Retention. Nothing to port; the slice this was written for has shipped.** It landed in
the database rather than the application, and for a reason this brief did not anticipate: an
application guard cannot cover a direct request to the admin endpoints Better Auth mounts and
the application does not own. The trigger binds those, and `psql` besides. Treat the earlier
instruction to "record the shape as the constraint on the later slice" as **satisfied and
closed** — do not re-open it, and do not propose swapping the trigger for an application lease.

One narrow follow-up is worth offering, and it is a sentence rather than a change: their
predicate is the role string `admin`, duplicated across two SQL and two TypeScript sites and
held together by a divergence test. That is a sound trade given SQL cannot import the constant.
The residual is that a future admin-ish role falls outside retention and is caught by a failing
test rather than being impossible — worth naming in their own contract so the next person to
add a role knows the test is what protects them.

## Risks

- **Sequencing.** The final-admin slice this brief once had to sequence around has landed, so
  the account action file is no longer about to be rewritten under you. Land 8a as its own
  small commit anyway — it sits beside code the retention work owns, and a self-contained
  commit is what keeps the two legible apart.
- **Prose drift.** This repository's comments are dense with Firestore and Firebase specifics.
  Copying them verbatim writes sentences the fork's code does not support — its own named
  most-expensive recurring defect.
- **Behaviour change.** Making the correlation id required is a breaking signature change
  caught by typecheck across three routes, which is safe. The rate-limit guard becoming a
  rejection breaks two existing tests loudly, which is the point.
- **False confidence on the presign fix.** It will typecheck and unit-test green while the
  containerized upload stays broken if `compose.env` is missed, or if SeaweedFS CORS refuses
  the cross-origin PUT — which nothing in either repository configures. The unit assertion
  proves only which host got signed.
- **False confidence on the proxy fix.** The proxy's own tests pass either way; only the
  matcher assertions can see this. Verify by deletion — remove the `/api/:path*` entry and
  confirm the dotted-path case fails.
- **Blast radius on admin gating.** Five UI files, no server-gate change, so the failure mode is
  over-hiding a control the actor legitimately holds. Drive it as a real admin and confirm
  nothing that worked before disappeared.

## Checkable Finish

Per port, a driven observation:

1. **Proxy** — `curl -i http://localhost:3000/api/export/assets/v1.2` with no session cookie
   returns 401 with the failure envelope and no location header (today it returns Next's
   routing answer). `/api-docs` still redirects to login; `/logo.svg` still returns 200. Then
   delete the new matcher entry and watch the test fail.
2. **moveObject** — the new test drives a stubbed send that (a) resolves a copy response with
   no result body and asserts no delete command was ever sent, and (b) rejects the delete after
   a good copy and asserts the not-deleted flag was returned rather than thrown. Then submit a
   real asset with an attachment and confirm the row's key resolves to a real object.
3. **Presign** — bring the local stack up, load the asset form in a real browser inside the
   containerized path, upload a file, and observe the PUT go to the loopback host and return
   200 — the same flow that today cannot resolve the compose-network name. Verify by deletion:
   sign through the original client again and the addressing test fails.
4. **CSV** — drive the CSV export against a row source rigged to throw on the third read. The
   downloaded file ends with a truncation row padded to the header width, the response carries
   the matching correlation header, and the server log has the throw under that id. Confirm a
   strict CSV parser still reads the file.
5. **Observability** — with a DSN pointed at a local sink, trigger an action that throws
   unexpectedly: the client gets an internal envelope and an event arrives tagged with the
   correlation id and capability, carrying no uid, no email and no extra. Then set a tag, an
   extra and a custom context before the throw and confirm all three are absent from the
   delivered payload. Confirm a forbidden error and a validation failure produce no event.
   Finally build and grep the client chunks for SDK value imports from the data and api layers.
6. **Rate limit** — the new test's store resolves on a later microtask and the decision is still
   correct (a missing `await` reads the count off a promise and mis-decides). Drive the AI action
   past its limit in a browser and see the resource-exhausted message.
7. **Admin gating** — sign in as a role granted only `admin:access` and `admin:audit:read` and
   confirm in a real browser: no Impersonate topbar entry, no accounts or impersonation card,
   audit rows showing actor and target as plain text. Then sign in as the default admin and
   confirm every control is back.
8. **Self-target** — an integration case where an admin calls the password-set and
   session-revoke actions on their own uid and gets a forbidden result, while the same calls
   against another admin still succeed.

Whole batch: `pnpm verify` green, the migration check clean, and `pnpm test:e2e:ci` driving the
real image — reported as behaviour observed.

## Sequencing

The ports are independent and can be delegated in parallel, with two constraints: the download
options must change before the three routes compile (one commit, not two); and the report
module must exist before its two call sites import it, with the build proving the SDK stayed
out of the client bundle running after both are wired. Ports 1, 2+3 (both storage, a natural
pairing), 6, 7 and 8a have no cross-dependency. The Better Auth migration that once had to be
sequenced around is complete, so nothing here is blocked by it — and with 8b closed, this brief
is six ports plus one self-guard rather than the eight items it opened with.
