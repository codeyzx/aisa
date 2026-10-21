# Admin Account Module Execution Handoff

## Handoff Metadata

- Sequence: `0020`
- Repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Created: `2026.07.21`
- Parent: `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- Status: `COMPLETE — acceptance carried by parent Phase 12`
- Next action: None. Residual undriven rows are named in the completion report below and owned by the same future passes as the parent's residual risks.

> **Status: COMPLETE — Phases 0–6 landed; Phase 7 acceptance was driven under parent Phase 12**
>
> The Phase 7 gate was satisfied and this handoff was activated. `/admin` is a
> canonical full page; the `one-surface-per-url` structure check proves no
> intercepted or parallel-route topology can return. See "Phase 0 record" below
> for the gate evidence and the inventory it produced.
>
> Phase 7's full acceptance matrix was deliberately merged into parent Phase 12 and
> driven there once, on 2026-07-22, rather than twice. The parent
> `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md` — "Browser
> Observations" and "Firestore Proof" of its Phase 12 completion report — is the
> authoritative evidence for the admin surface. The "Completion Report" below maps
> this module's matrix rows to that evidence and names the rows Phase 12 did not
> drive as residual.

This is the execution baton for the generic Admin Account module in the Firestore
foundation. It preserves the reusable administrator workflows already present in
the Aixel MBG system, improves their security, and finishes before the Firestore
fork tag.

## Parent Handoff And Current State

- Parent handoff: `docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md`
- Parent status when this handoff was authored: `IN PROGRESS`
- Parent active phase when this handoff was authored: Phase 5, action/API error and impersonation hardening
- Parent repository: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`
- Observed parent `HEAD` when this handoff was authored: `37e304a67c51fdf7dad1d0ef77a5ed1542c67a94`
- Required official downstream tag: `postgresql-fork-base-v1`
- Optional provisional downstream tag: `postgresql-fork-candidate-v1`
- PostgreSQL sibling: `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-postgresql`
- PostgreSQL must inherit the verified Auth behavior and port the persistence-owned audit repository, revocation/session adapter, and final-admin lease after the fork.

The parent handoff remains authoritative for repository rules, current Next.js
behavior, commit discipline, environment safety, verification doctrine, and fork
publication. This file owns only the Admin Account module.

The parent Lead MUST schedule this handoff as **Phase 7A**, immediately after the
parent routing phase and before the parent product-quality Phase 8. The parent Lead
must reserve the overlapping admin, Auth, audit, Rules, and package hotspots for this
handoff, then carry its evidence into Phase 8 and Phase 12. This handoff is not an
independent parallel train.

## Starting Instructions

The Lead MUST:

1. Work only in `/home/luthfi/code/work-noeffort/projects/aixel-std/boilerplate-nextjs-firestore`.
2. Read `AGENTS.md`, the complete parent handoff, `docs/conventions/auth.md`, `docs/conventions/impersonation.md`, `docs/conventions/realtime.md`, `docs/conventions/testing.md`, and the current Next.js 16 documentation relevant to routes, forms, cookies, and server actions.
3. Confirm the parent handoff has completed Phase 7 and `/admin` is a canonical full page with no `@modal`, `(.)` segment, or intercepted-route helper.
4. Confirm no other worker is editing shared Auth, RBAC, route, action, audit, or package-script hotspots.
5. Run `git status --short --branch`, `git diff`, `git log --oneline -10`, and `tt pi status` before editing.
6. Preserve unrelated worktree changes and stage only files owned by the active slice.
7. Never read, print, copy, or commit `.env*`, credentials, tokens, service-account material, reset links, temporary passwords, or other secrets.
8. Load `task-envelope` before delegating, `verify` before declaring a slice complete, `commit` before each commit, and `thin-pr` if the slice grows beyond one dominant review question.
9. Use `pnpm`, never `npm`.

If the Phase 7 gate is not true, report the blocker and stop. Do not begin account
actions against the old intercepted admin surface.

## User Story And Goal

As an internal-application administrator, I can find and manage accounts, roles,
access state, password recovery, sessions, impersonation, and account history from
one protected admin surface without sharing permanent credentials or losing the
ability to recover from a failed operation.

As a future PostgreSQL fork, I can inherit the Firebase Auth account lifecycle and
shared UI behavior while replacing the Firestore-owned session marker, durable audit
repository, and final-admin lease.

This module is intentionally parity-plus. It must not be a functional downgrade
from the Aixel MBG user-management surface.

## Target State

The module provides:

- Paginated Firebase Auth user directory with exact-email lookup.
- Safe account detail surface.
- Admin-created accounts with temporary passwords.
- Display-name and role updates.
- Account enable and disable.
- Admin-triggered temporary-password reset.
- Signed-in password change with recent reauthentication.
- Forgot-password email recovery.
- Sign out all sessions.
- Durable account-administration audit history and viewer.
- Existing impersonation, separately capability-gated and hardened.

The module does NOT provide:

- Kitchen, organization, tenant, or other domain-specific assignments.
- Email changes.
- Application account deletion.
- Bulk account operations.
- MFA recovery or enrollment administration.
- SCIM, SSO directory synchronization, or organization membership.
- Per-user permission overrides beyond the existing RBAC capability model.
- A speculative universal identity-provider abstraction.

### MBG Parity Baseline

The reusable MBG baseline was inspected at commit
`49fc585f2ca494cb0e151247e9c3687e479a5b06` in the separate read-only repository
`/home/luthfi/code/work-noeffort/projects/aixel-mbg/aixel-mbg-system`.

The parity floor is:

- User directory and account detail: `lib/repos/users.ts`, `app/(dashboard)/admin/users/page.tsx`.
- Admin create: `lib/actions/users.ts#createUserAction`.
- Display-name and role update: `lib/actions/users.ts#updateUserAction`.
- Enable and disable: `lib/actions/users.ts#setUserDisabledAction`.
- Admin password replacement: `lib/actions/users.ts#resetUserPasswordAction`.
- Signed-in password change: `components/profile/account-settings.tsx#PasswordForm`.
- Impersonation: `components/admin/users-table.tsx` and its server action path.
- Durable audit viewer: `/admin/audit` and the audit repository.

MBG-specific kitchen assignment, Kitchen Manager pairing, and Operational Director
creation are explicitly outside this parity floor.

## Locked Decisions

### Auth Authority

Firebase Auth is authoritative for UID, email, display name, verification state,
disabled state, password, last sign-in metadata, and custom claims. Do not create a
duplicate generic profile collection merely to mirror these fields.

The Admin SDK is server-only. No Admin SDK record, custom claim map, provider data,
MFA data, token, password hash, or reset secret may cross into browser code.

### Capabilities

Add semantic capabilities to `lib/auth/rbac.ts`:

- `admin:users:read`
- `admin:users:manage`
- `admin:audit:read`

Keep `impersonation:start` separate from account management. `admin:access` means
the ability to open the admin surface; it must not silently imply every account
mutation.

The navigation reads the same RBAC grant table as the server guards. Navigation is
not an authorization boundary.

### Roles And Claims

Custom claims retain the existing role and may include:

```text
role
mustChangePassword
```

Claims updates MUST preserve unrelated claims. A role update must not accidentally
clear `mustChangePassword`, and a password-state update must not accidentally clear
the role.

Role changes MUST revoke the target's refresh tokens and update the revocation
marker. Protect the final administrator and refuse unsafe self-demotion.

### Revocation Marker

Use exactly one marker field:

```text
authSessions/{uid}.revokedAfterEpoch: integer
```

The value is Unix epoch seconds in UTC. Do not add a duplicate Firestore Timestamp
field or another marker name.

The marker is written by Admin SDK code only. A signed-in client may read its own
marker so it can receive the revocation signal, even after that marker makes the
client token invalid for ordinary data reads. The marker read is the explicit Rules
exception; all writes remain denied to clients.

For protected direct Firestore reads, Rules compare the token `auth_time` against the
marker. The conservative contract is:

```text
request.auth.token.auth_time >= revokedAfterEpoch
```

The exact cutoff formula is `Math.floor(Date.now() / 1000) + 1`, never a bare
`Math.ceil(Date.now() / 1000)`. The extra second ensures a token issued during the
current second cannot pass an equality comparison. The marker is monotonic and may
only move forward. Existing accounts without a marker remain valid until a marker
is created.

The mutation sequence is:

1. Advance `revokedAfterEpoch` first so Rules, the server session boundary, and the
   official client watcher fail closed immediately.
2. Call Firebase `revokeRefreshTokens(uid)`.
3. Read Firebase's `tokensValidAfterTime` and advance the marker to the greater of
   the existing value and
   `Math.floor(Date.parse(tokensValidAfterTime) / 1000) + 1`.
4. If Firebase revocation fails, keep the marker, return a typed
   `revocation_pending` result, and make retry/reconciliation visible. Never lower
   the marker or report a fully successful operation.

`getSession()` must check the marker against the decoded token `auth_time` in addition
to Firebase's `checkRevoked=true`. A missing marker is allowed for legacy accounts;
an existing marker with a missing, malformed, or non-integer value fails closed.

`advanceRevokedAfterEpoch(uid)` uses a Firestore transaction and stores the maximum
of the current marker and the new cutoff. All account operations use this helper;
none writes the marker with a blind `set()`.

The driven service-level target is: server access fails on the next request, each
online official client signs out within 5 seconds of the marker update, no new
protected Firestore snapshot is delivered after revocation, and an offline client
is refused before receiving new network data when it reconnects. Data already
delivered to a device cannot be recalled and must not be described as revoked.

Server session verification continues to use Firebase `verifySessionCookie(...,
true)`. The marker and Firebase token revocation are both required; neither is
silently omitted when an account mutation succeeds.

### Passwords

Admin creation and admin reset use a cryptographically secure temporary password.
The password is generated on the server, revealed once, never logged, never
persisted in audit data, and never generated with `Math.random()`.

The target receives `mustChangePassword: true`. After the target signs in with the
temporary password, the only useful protected action is selecting a permanent
password or signing out.

`mustChangePassword` is enforced centrally, not only by UI routing. The parent page
guard, `runAction`, `runFormAction`, API response boundary, and Firestore Rules must
deny ordinary protected operations while the claim is true. Only the dedicated
password-transition action, logout, session refresh, and public auth paths are
exempt.

`getSession()` resolves the claim but does not silently discard it. The shared
`requireReadySession()` boundary rejects it for ordinary protected pages/actions/API
routes; `requireSession()` is reserved for logout, session refresh, and the dedicated
password-transition path. Structure checks must reject a protected entry point that
uses the weaker boundary without an explicit allowlist entry.

After the permanent password is selected, the target's sessions are revoked again,
the current browser session is cleared, and the user is sent to login.

The permanent-password transition is server-owned. The browser reauthenticates with
Firebase Web Auth, obtains a fresh ID token, and submits that proof plus the new
password to one dedicated server action. The server verifies the fresh token, checks
the target's `mustChangePassword` claim and recent `auth_time`, advances
`revokedAfterEpoch`, updates the password, clears the claim, revokes refresh tokens,
clears the current session cookie, and redirects to login. A client cannot clear the
claim by calling a separate action without proving the password mutation.

Direct temporary-password reset is a break-glass workflow for the starter. When a
transactional email capability exists, the normal admin path should become a
Firebase reset-link delivery flow. Do not add email infrastructure in this module.

### Audit

Account mutations and impersonation lifecycle events must be available in a durable
admin audit viewer. The existing structured stdout audit remains useful for runtime
operations, but stdout alone is not the Admin Account history contract.

The durable event contains only bounded, safe fields:

- Event ID
- Action code
- Real actor UID
- Effective actor UID when different
- Target UID
- Safe before/after values
- Reason where required
- Result status
- Correlation ID
- Server timestamp

Never store passwords, temporary passwords, reset links, cookies, tokens, request
bodies, or arbitrary error objects.

Cross-service operations are not atomic. The implementation MUST make partial states
visible and recoverable. An audit write failure must not be silently reported as a
fully successful account mutation.

Durable audit preparation precedes account mutation exports. Existing-target actions
write a deterministic `started` event, perform the mutation, and finalize the event
as `succeeded`, `failed`, or `reconciliation_required`. Newly created accounts may be
compensatingly removed if required initialization or the first audit write fails;
this is only orphan cleanup for the account created by that operation, not a general
user-deletion feature. Impersonation stop must always clear the ticket so an audit
failure cannot trap the administrator; it emits a bounded stdout fallback and leaves
the durable event visibly incomplete for reconciliation.

### Domain Boundary

The module owns generic identity lifecycle only. MBG-specific roles, kitchen IDs,
Kitchen Manager pairing, Operational Director creation, and kitchen health rules
must not enter this repository.

## Operation Contracts

### Directory And Detail

- Read Firebase Auth server-side with native forward pagination.
- Support exact-email lookup.
- Map each `UserRecord` to a safe DTO before any client component receives it.
- Show email, display name, role, enabled state, verification state, and last sign-in.
- Represent invalid page tokens, unavailable Auth, empty pages, and missing targets explicitly.
- Do not show custom claims or provider metadata wholesale.
- Keep directory reads behind `admin:users:read`.

### Create Account

- Require `admin:users:manage` and a valid target policy.
- Validate email, display name, and role at the server boundary.
- Generate a temporary password with a secure server-side generator.
- Create the Auth account and set `mustChangePassword` without marking email verified by assumption.
- Apply the selected role through the one claims helper.
- Write the durable `user.create` audit outcome.
- Show the temporary password exactly once and clear it when the surface closes.
- If creation succeeds but required account initialization or audit persistence fails, return a typed partial-failure result and make compensation or reconciliation explicit.

### Display Name And Role

- Keep email immutable in this module.
- For a role change, advance the target revocation marker before changing authority;
  a display-name-only update does not revoke sessions.
- Update Auth display name from the server.
- Update role through the canonical RBAC claims helper.
- Preserve `mustChangePassword` and unrelated claims.
- Revoke target sessions after the role change.
- Refuse final-admin removal and unsafe self-demotion.
- Acquire the final-admin mutation lease before any operation that can remove an
  administrator capability.
- Record safe before/after role and display-name values.

### Enable And Disable

- Update Firebase Auth `disabled` state.
- Do not create a second generic Firestore `active` authority.
- Refuse self-disable and final-admin disable.
- Advance `revokedAfterEpoch` before disabling, then revoke Firebase refresh tokens.
- Invalidate active impersonation of the target.
- Record the result even when the target was already in the requested state.
- Acquire the final-admin mutation lease before any operation that can remove an
  administrator capability.

### Admin Password Reset

- Re-read the target account at action time.
- Generate a secure temporary password on the server.
- Advance `revokedAfterEpoch` before changing the password, then update the password
  and set `mustChangePassword` while preserving role claims.
- Revoke Firebase refresh tokens and reconcile the marker with Firebase's cutoff.
- Reveal the temporary password once to the authorized administrator.
- Require an explicit confirmation and a reason for the operation.
- Never include the password in action results after the one-time display or in audit data.
- Audit target, actor, reason, and outcome only.

### Sign Out All Sessions

- Require `admin:users:manage`.
- Advance `revokedAfterEpoch` and revoke Firebase refresh tokens through the monotonic helper.
- Close official browser listeners through the client marker watcher.
- Do not affect the administrator's current session.
- Provide a separate operation from disablement so an account may remain enabled.

### Self-Service Password Change

- Require a current authenticated session.
- Require recent reauthentication with the current password.
- Submit the fresh Firebase ID-token proof and new password to the one server-owned transition action.
- Have that action advance `revokedAfterEpoch` first, update the password, and clear `mustChangePassword` as one server-controlled transition.
- Revoke all target sessions and clear the current session cookie.
- Redirect to login after success.
- Audit the action without password data.

The dedicated transition action is the only action allowed to clear
`mustChangePassword`; ordinary `runAction` and `runFormAction` calls reject that
claim.

### Forgot Password

- Keep the existing `/login/reset` Firebase email recovery flow.
- Keep the neutral response for missing accounts and invalid-account cases.
- Do not expose whether an email is registered.
- Drive the flow against the Auth emulator and record the observed behavior.

### Impersonation

- Keep the existing signed-ticket model and dedicated `impersonation:start` capability.
- Keep the target live re-read, disabled/admin/self refusals, persistent banner, short TTL, and no-JS exit.
- Account mutations must refuse impersonated sessions through the real-admin guard.
- Start and stop events must be visible in the durable account audit viewer with real and effective actor attribution.

## Ordered Phases

### Phase 0: Foundation Gate And Inventory

Start only after the parent Phase 7 route work is complete. Read the final admin
route tree and current installed Next.js docs. Inventory every current Auth,
RBAC, impersonation, audit, user-picker, session, Firestore Rules, and realtime
consumer before editing.

DONE WHEN:

- `/admin` is a canonical full page with no intercepted or parallel route.
- The inventory classifies every affected file as shared Auth, Admin Account, impersonation, audit, or Firestore-specific.
- No parallel worker owns an overlapping hotspot.

VERIFY:

- Run `pnpm structure:check`.
- Search for all `listUsers`, `adminAuth`, `getSession`, `requireCapability`, `audit`, `onSnapshot`, and `firestore.rules` consumers.
- Read the current Next.js route/form/cookie guidance from `node_modules/next/dist/docs/`.

#### Phase 0 record

**Gate.** `/admin` is one full page (`app/(app)/admin/page.tsx` plus `search-params.ts`
and two `_components/`). `pnpm structure:check` is green at 15 checks / 0 violations /
1 exemption, and `one-surface-per-url` now fails on any `@modal` or `(.)` segment — the
gate is machine-enforced, not observed once. No worker holds a hotspot (`tt pi status`
empty, tree clean, 56 commits ahead of origin, nothing pushed).

**Baseline — the module starts from less than the plan assumes.** None of the three
central artifacts exists anywhere in the tree, in code, Rules, indexes, or tests:

- `authSessions` collection — absent. `firestore.rules` has exactly two blocks: a
  signed-in read carve-out on `/assets/{assetId}` for the `/realtime` listener, and a
  deny-all `/{document=**}`. No `request.auth.token.*` claim check exists anywhere.
- `revokedAfterEpoch` — absent. No revocation marker of any kind.
- `mustChangePassword` — absent. `role` is the ONLY custom claim ever written
  (`scripts/seed-emulator.ts`, `setCustomUserClaims(uid, { role })`) and the only one
  ever read (`lib/auth/session.ts` via `isRole`). **There is no claim-preservation
  helper**, so the "a role update must not clear `mustChangePassword`" invariant has no
  existing mechanism to build on — it is new work, not a modification.
- `requireReadySession` — absent. `lib/auth/guards.ts` exports exactly one function,
  `requireCapability`.
- `revokeRefreshTokens`, `generatePasswordResetLink`, `deleteUser` — never called.
  `listUsers` has exactly one call site: the impersonation picker.

**Classification.** Every affected file is classified in the working inventory. The
shape that matters for the fork contract:

- `shared-auth` — the session DAL (`lib/auth/session.ts`), RBAC, guards, cookie
  constants and attributes, the login/reset surface, `runAction`/`runFormAction`, the
  proxy, and `lib/firebase/admin-auth.ts`. A PostgreSQL fork inherits these.
- `firestore-specific` — `admin-db`, `collections`, `client-db`, `use-firestore-query`
  (the only `onSnapshot` in the tree), `firestore.rules`, indexes, and the realtime
  demo. The fork replaces these.
- `impersonation` — the ticket, config, the two actions, the banner/blocked screens,
  and the `(app)` layout's outage handling.
- `audit` — `lib/data/audit.ts` (stdout only, dedicated debug-threshold logger) plus
  its nine call sites. **No durable audit store exists**, so Phase 3's substrate is
  entirely new.
- `admin-account` — today just `/admin`'s page, search params, and the user picker.

**Constraints discovered that change how later phases must land:**

- `capability-completeness` enforces the RBAC table BOTH ways — a declared capability
  with no call site fails `verify`. So `admin:users:read`, `admin:users:manage`, and
  `admin:audit:read` cannot be added ahead of their consumers; each must arrive in the
  same commit as a real guard that names it.
- `route-guard-inventory` builds its allowed-guard set from `lib/auth/guards.ts`'s
  exports plus a hard-coded `'requireSession'`. `requireReadySession` must therefore
  live in `guards.ts` to be recognised automatically.
- The `firestore.rules` `assets` carve-out is justified by "every role holds
  `asset:read`", which is true only while `ROLES` is `['admin','user']`. Any Rules work
  in Phase 2 must not silently inherit that assumption.

**Stale references to correct when their file is next touched** (not fixed now — each
belongs to the phase that edits its file): `firestore.rules` cites `lib/firebase/admin.ts`,
a path split into `admin-app`/`admin-auth`/`admin-db` some phases ago; and
`user-picker.tsx` still describes the `@modal/(.)admin` route deleted in parent Phase 7.

### Phase 1: Contracts, Capabilities, And Safe DTOs

Add the three account capabilities, closed action/error codes, account DTOs,
account schemas, role-transition invariants, and the safe user-directory result
contract. Keep pure contracts free of Firebase Admin, cookies, filesystem, process,
and Firestore runtime imports.

Likely areas:

- `lib/auth/rbac.ts`
- `lib/auth/session.contract.ts`
- `lib/data/action-contract.ts`
- `lib/data/action-result.ts`
- New account contracts/schemas under the owning Admin Account path
- Structure-check fixtures and tests

DONE WHEN:

- Capability declarations, navigation, page guards, and actions use one vocabulary.
- Invalid roles, account states, and action inputs fail through closed contracts.
- Client DTOs cannot carry raw Auth records or secrets.

VERIFY:

- Unit-test role and capability invariants.
- Add negative structure fixtures for raw Admin SDK imports in client code and unwrapped account actions.
- Run typecheck and the focused static rules.

#### Phase 1 record

Landed as three commits. Two items in the phase brief were deliberately deferred,
each to the phase that brings its consumer — `capability-completeness` enforces the
RBAC table both ways, so a capability or predicate with no call site fails `verify`.

- `bfcb06f` — **a real leak, found while mapping the DTO work.** `Session.claims`
  carried the entire decoded session cookie (`auth_time`, `iat`, `exp`, `sub`,
  `firebase.identities`, `sign_in_provider`, every custom claim) into the RSC payload
  via the `'use client'` topbar. Confirmed in page source from a signed-in admin, not
  inferred. Three writers, zero readers — so the fix was deletion. The regression test
  pins the whole key set rather than the absence of one name, because the real failure
  mode is a future field spreading a token payload again.
- `401a319` — `admin:users:read`, gating the directory read on the component that
  performs it (`UserPicker`), plus `lib/auth/account.contract.ts`: the canonical
  `AccountSummary` and `toAccountSummary` allowlist. `PickerUser` now extends it
  instead of redeclaring three hand-picked fields. `roleFromClaims` extracted to
  `rbac.ts` once it had a third reader.

DEFERRED, with the phase that will land them:

- `admin:users:manage`, `admin:audit:read` — Phases 4 and 6, with their first guards.
- Role-transition invariants and new mutation error codes — Phase 4, with the
  mutations that produce them. `password_change_required` DID land in Phase 2,
  because `runAction` became its consumer there.

### Phase 2: Session Revocation And Firestore Rules

Implement `revokedAfterEpoch`, the Admin SDK revocation helper, server session
integration, the signed-in client marker watcher, and Rules enforcement for the
direct `assets` realtime carve-out.

Centralize the `mustChangePassword` gate in the same phase. Ordinary server actions,
form actions, API responses, protected pages, and direct assets reads must refuse the
claim. The password-transition action, logout, session refresh, and public auth paths
are explicit exceptions and must be covered by structure tests.

Likely areas:

- `lib/auth/session.ts`
- New server-only session-revocation module
- New server-owned password-transition module
- `lib/firebase/client-auth.ts`
- `lib/firebase/use-firestore-query.ts`
- `firestore.rules`
- `firestore.rules.test.ts`
- Realtime hook/provider tests

The client watcher MUST:

- Open only after Firebase Auth resolves a signed-in UID.
- Read only `authSessions/{uid}`.
- Sign out and close shared streams when the marker is newer than token `auth_time`.
- Handle document creation, update, listener error, logout, and unmount.
- Never expose the marker or Firebase Admin behavior to arbitrary UI code.

Rules MUST:

- Allow a user to read only their own `authSessions/{uid}` marker.
- Keep that own-marker read available even when the marker has already revoked the
  token for assets; otherwise the client cannot receive the sign-out signal.
- Deny every client write to the marker.
- Require a valid, non-revoked token for the assets realtime carve-out.
- Refuse assets reads while `mustChangePassword` is true.
- Keep all non-assets client reads and all client writes denied.

DONE WHEN:

- The same `revokedAfterEpoch` value drives server-session, Rules, and client behavior.
- Concurrent revocations cannot lower or stale-overwrite the marker.
- Old token auth time is denied for protected realtime reads.
- New authentication after the cutoff is allowed.
- Existing shared realtime streams close on marker change.

VERIFY:

- Rules-test missing marker, valid token, old token, equal-cutoff token, new token, wrong UID, unauthenticated, and client-write cases.
- Transaction-test concurrent marker advances and malformed marker fail-closed behavior.
- Browser-drive two target sessions while an admin revokes them; observe both target contexts sign out and the admin remains active.
- Confirm no new protected Firestore snapshot arrives after revocation.
- Test offline/reconnect behavior in the emulator-safe browser setup.

#### Phase 2 record

Complete and driven. Seven commits, `c08f0a8` through `0649d8a`.

**The marker.** `lib/auth/revocation.contract.ts` owns the path, the schema, the
cutoff formula, and `isTokenRevoked` — because Firestore Rules cannot import
TypeScript, and three enforcement points comparing `auth_time` must not each hold
their own arithmetic. `revocation.ts` owns the Admin-SDK access;
`advanceRevokedAfterEpoch` is a transaction storing `max(existing, cutoff)`.

Two asymmetries are load-bearing and are stated at every layer: an ABSENT marker
ALLOWS (every account predates its first revocation), while an UNREADABLE one —
corrupt document or unreachable Firestore — DENIES.

**Falsification, not just green.** Replacing the transaction with a read-then-write
leaves `1200` standing where `3000` was already written. Dropping `notRevoked()` and
`passwordReady()` from the assets rule fails exactly the before-cutoff,
corrupt-marker, and claim-set cases. Removing the `getSession` marker call fails
exactly its three tests.

**The gate.** `authorizeSession` in `guards.ts` is now the ONE place the three
questions are asked. Before this, the triple was hand-written at six call sites, and
`mustChangePassword` reached only the pages: the export routes, the upload
presigner, the PDF handler, `runAction`, and `runFormAction` all served a user the
page guard had just refused. `ready-session-boundary` keeps the weak boundary
reachable from one place, with three named exemptions (public login page, the
password screen the guard redirects TO, and the impersonation EXIT).

**Driven evidence (Auth + Firestore emulators, Chromium, JS on and off):**

- Claim set on a seeded account: `/assets`, `/admin`, `/dashboard`, `/export` all land
  on `/password/change`. With JS off the shell has already flushed, so Next answers
  with `<meta http-equiv="refresh">` rather than a 307 — the navigation still
  completes, and the body carries no asset rows and no directory data.
- CSV export 200-with-rows before the claim, 403 `PERMISSION_DENIED` after; XLSX and
  `POST /api/storage/upload-url` likewise.
- `/realtime` streaming as admin, marker written out-of-band: the tab signed out and
  landed on `/login` **inside one second**, against the 5s target. The same cookie then
  answers 401 on the export API and a meta-refresh to `/login` on `/dashboard`.
- 27 Rules tests, 9 revocation integration tests, 594 unit tests.

**Two findings that change later phases:**

- Setting `mustChangePassword` does NOT affect an already-minted session cookie until
  the next sign-in. Confirmed by driving. So Phase 4's admin-reset MUST advance the
  marker alongside the claim, or the target keeps working until their cookie expires.
- A guard `redirect()` after the shell has flushed is a meta-refresh, not a 307 —
  repo-wide, pre-existing, and true of `/403` too. It is safe (no data in the body)
  but Phase 5's no-JS rows should record the observed mechanism rather than assume 307.

**Residual, carried to Phase 7:** an offline/reconnect case (a stale client resuming
after the cutoff) has not been driven yet; Rules cover it by construction, but the
handoff asks for it observed.

### Phase 3: Durable Audit Substrate And Mutation Safety

Build the durable audit event contract, repository, and operation-state protocol
before exporting account mutations. Add the short Firestore lease used to serialize
mutations that can remove administrator capability.

The final-admin lease MUST:

- Use one server-only document such as `adminLocks/accountMutation` with owner,
  operation ID, generation, and bounded expiry fields; this is separate from the per-user
  `authSessions/{uid}.revokedAfterEpoch` marker.
- Be acquired through a server-only Firestore transaction on one lock document.
- Have an owner, bounded expiry, and explicit release.
- Be acquired before role demotion or account disablement.
- Re-read all Auth pages and verify the postcondition immediately before mutation.
- Check the owner, generation, and unexpired lease immediately before every external
  Auth mutation and after it settles.
- Refuse an active unexpired lease held by another operation.
- Expire safely after a crashed process without an unlock action from the client.
- Bound the operation lifetime below the lease lifetime and return
  `lease_expired_reconciliation_required` instead of starting another mutation after
  the lease is lost.
- Be replaced by a PostgreSQL advisory/row lock in the sibling fork.

This lease serializes account mutations initiated by this application within a
bounded operation envelope. It cannot make Firebase Console changes or a
non-cancellable external SDK call atomic with Firestore. That residual limitation
must remain explicit in the completion report.

The audit event protocol MUST:

- Use typed action codes and bounded metadata.
- Persist a deterministic `started` event before an existing-target mutation.
- Finalize it as `succeeded`, `failed`, or `reconciliation_required`.
- Keep incomplete events queryable rather than hiding them.
- Compensate a newly created orphan account if its required initialization/audit cannot be completed.
- Always clear an impersonation ticket even if durable stop-audit finalization fails.

Likely areas:

- New Admin Account audit contract/repository modules
- Firestore collection path and indexes
- New server-only admin mutation lease module
- `lib/data/audit.ts` integration or explicit account-audit adapter
- Audit and lease tests

DONE WHEN:

- The durable audit writer and final-admin lease exist before account mutation exports.
- An incomplete audit event is visible and has a defined reconciliation result.
- Two concurrent in-app final-admin mutations cannot both pass the same live lease;
  an expired or lost lease produces an explicit reconciliation result.
- Audit fields cannot contain passwords, reset links, tokens, cookies, request bodies, or raw errors.

VERIFY:

- Inject audit-start, audit-finalize, Auth mutation, and lease-expiry failures.
- Run concurrent demotion/disable tests with one and multiple administrators.
- Verify the stdout fallback never traps the administrator during impersonation stop.

### Phase 4: Account Repository And Server Actions

Build the server-only account read and mutation path. Keep Auth operations behind
one owning module and keep form and programmatic entries unified.

Operations:

- List and exact-email lookup.
- Safe detail lookup.
- Create account.
- Display-name and role update.
- Enable and disable.
- Admin reset.
- Sign out all sessions.

Every mutation MUST:

- Authorize before target lookup where possible.
- Parse all input with Zod at the server boundary.
- Re-read the target live before mutation.
- Use typed expected errors for not-found, already-exists, invalid-state, unavailable, and partial-failure outcomes.
- Revoke sessions where the contract requires it.
- Write a bounded audit outcome.
- Revalidate the canonical admin and audit surfaces.

DONE WHEN:

- No mutation can be reached through an alternate exported path.
- Firebase Auth and claims changes preserve unrelated claims.
- Final-admin and self-protection rules are enforced server-side.
- Partial Auth/audit/revocation failures are visible and recoverable.

VERIFY:

- Unit-test every input and state transition.
- Integration-test Auth emulator create, update, disable, role, reset, and missing-target cases.
- Test duplicate submission and stale target behavior.
- Inspect action results for password, token, cookie, and provider-error leakage.

### Phase 5: Password And Account-State UI

Add the account detail/action surfaces and the mandatory password-change route.
Keep the admin account surface a canonical full page and use predictable query state
or full-page navigation according to the finalized parent routing contract.

Likely areas:

- `app/(app)/admin/page.tsx`
- `app/(app)/admin/search-params.ts`
- `app/(app)/admin/_components/**`
- New account detail/form/password components
- `app/login/login-form.tsx`
- Existing `app/login/reset/**`
- New required-password-change route and components
- Shell/session redirect helpers

UI requirements:

- Temporary password is never rendered before explicit creation/reset success.
- One-time display clears on close, navigation, and successful copy lifecycle.
- Password fields are not plaintext by default.
- Pending, success, partial-failure, and unavailable states are explicit.
- Role/status labels come from canonical maps.
- Admin actions are not offered while impersonating.
- No-JS form actions remain safe where the route contract promises progressive enhancement.

DONE WHEN:

- MBG-reusable admin workflows remain available.
- Target users can complete temporary-password to permanent-password flow.
- The administrator remains signed in while managing another user.
- Direct navigation, refresh, Back, Forward, keyboard, mobile, and no-JS behavior are predictable.

VERIFY:

- Browser-drive every account action with Auth emulator accounts.
- Test two target sessions for reset and disablement.
- Test required-password route cannot be bypassed by directly opening dashboard or action URLs.
- Test temporary password never appears in logs or audit viewer.

### Phase 6: Durable Audit Viewer And Integration

Add the durable admin audit viewer on top of the Phase 3 account-audit repository
without pretending it is tamper-evident compliance storage. Keep the existing
structured audit stream for runtime operations, but route account and impersonation
lifecycle events through the durable account history contract.

Likely areas:

- `app/(app)/admin/audit/**`
- Admin audit search parameters and table components
- Audit emulator/integration tests

DONE WHEN:

- Create, role, name, enable, disable, reset, session revoke, impersonation start, and impersonation stop are queryable.
- Actor attribution distinguishes real administrator and effective target.
- Audit filters and cursor pagination are deterministic.
- Incomplete or failed audit writes are visible as explicit outcomes.
- No secret or arbitrary payload enters durable audit or stdout.

VERIFY:

- Integration-test audit writes, failure states, query filters, cursor boundaries, and ordering ties.
- Browser-drive the viewer as an administrator and deny it for non-admin or impersonated sessions.
- Inspect logs and stored fixtures for forbidden fields.

#### Phases 3–6 record

Complete. Commits `63f4eab`, `b9e8318`, `5c83bce`, `7d1c520`.

**Phase 3 — substrates.** The audit protocol is two steps because an Auth call and a
Firestore write cannot be made atomic: writing the audit AFTER a successful mutation
makes the crash-in-the-middle the one state that leaves no trace. `before`/`after` are
a STRICT closed object — Zod's default would strip an unknown key silently, and a
silent drop makes the trail lie about what it was asked to record.

The lease's GENERATION counter was nearly shipped untested. Removing it passed every
test written for it, because each used a different `operationId` and the owner check
covered for it. The case it uniquely catches is a retry under the SAME `operationId`:
an operation stalls past its TTL, its supervisor re-acquires, and the owner on the
document now matches the stalled holder's own id. Two tests now pin it.

**Phase 4 — mutations.** `setCustomUserClaims` is a REPLACE, not a patch, so
`setCustomUserClaims(uid, { role })` at a role site silently deletes
`mustChangePassword` and the mirror call silently deletes `role`. One writer, live
read, merge; deletion is `null` because `{k: undefined}` and `{}` are
indistinguishable. The marker advances BEFORE the Auth call — it is the only step
that fails closed.

**Phase 5 — surface + transition.** The transition gate is three parts: a verified
session, a fresh reauthentication ID token, and that token's uid + claim + `auth_time`
re-checked server-side. It cannot use `runAction`, because `authorizeSession` refuses
a session carrying `mustChangePassword` before it looks at a capability — every
legitimate caller would be refused by construction. The claim is cleared in exactly
one place, inseparable from the password write; there is no `clearMustChangePassword`
export for an action to reach for.

**A real leak, found by driving.** Next 16 logs every Server Function call to the dev
terminal WITH ITS ARGUMENTS. Driving the password change printed the user's chosen
password and their Firebase ID token verbatim into `pnpm dev` output. Dev-only, which
is exactly why it is easy to dismiss — a developer's terminal is where these
credentials actually exist in this project. `logging.serverFunctions` is now off in
`next.config.ts` with the reasoning attached.

**Phase 6 — viewer.** The composite-index bill is FOURTEEN, not seven, and only
driving found it: `paginate`'s previous branch is `endBefore` + `limitToLast`, which
Firestore serves by REVERSING the query, so every filter combination needs an ASC
mirror of its DESC index. Forward-only driving reported seven, passed
`indexes:check`, and would have made the first "Sebelumnya" click under any filter a
production `FAILED_PRECONDITION`. Written into `docs/conventions/data-layer.md`.

Ordering is on `startedAt`, never `settledAt`: Firestore drops documents missing the
ordered field, so ordering on `settledAt` would make a crashed operation INVISIBLE.

Impersonation start and stop are deliberately asymmetric. A failed audit OPEN refuses
the start; every failure in STOP is swallowed, because a Firestore outage in front of
`cookieStore.delete` would trap the admin inside the impersonation with the exit
button producing an error page. Both failure modes proved by injection.

**Driven evidence (emulators, Chromium, JS on and off):** created an account and
revealed the one-time password (in the DOM while revealed, absent after dismissal,
never in a URL, never in the dev log); signed in with it; was forced to
`/password/change` from every route; was refused with a wrong current password;
completed the change; was signed out; found the old password rejected and the new one
landing on `/dashboard` with no forced change; Firebase then showed `{"role":"user"}`
with `validSince` advanced — claim cleared, role preserved. Self-demotion, self-disable
and a genuine final-admin case all refused with the `admin_lockout` message. Thirty
audit events with ELEVEN sharing one `startedAt` paged across a boundary inside the
tie with no skip and no repeat. All stored events dumped: the field-name set is
exactly the schema, and no password, token, cookie, link, body or provider message
appears anywhere.

Gates at Phase 6 close: 632 unit, 119 integration, `indexes:check` 27/27 observed and
declared, `structure:check` 0 violations / 6 exemptions / 16 checks, `build:ci` green.

### Phase 7: Full Driven Acceptance And Fork Integration

Freeze feature edits after focused checks pass. Run the complete Admin Account matrix,
the parent handoff chain, and the production artifact checks. The parent Lead must
carry this handoff's evidence into parent Phase 8 and Phase 12; do not claim the
parent fork ready until every Admin Account row is driven.

The module is part of the final Firestore verified fork commit, not a post-fork
cherry-pick.

## Likely Files And Artifacts

Discover exact paths before editing. Expected areas include:

- `lib/auth/rbac.ts`
- `lib/auth/session.ts`
- `lib/auth/session.contract.ts`
- `lib/auth/client.ts`
- `lib/data/action-result.ts`
- `lib/data/form-action.ts`
- `lib/api/response.ts`
- `lib/api/errors.ts`
- `lib/firebase/admin-auth.ts`
- `lib/firebase/admin-db.ts`
- `lib/firebase/client-auth.ts`
- `lib/firebase/use-firestore-query.ts`
- `lib/actions/impersonation.action.ts`
- New Admin Account server actions and contracts
- `app/(app)/admin/page.tsx`
- `app/(app)/admin/search-params.ts`
- `app/(app)/admin/_components/**`
- Existing `app/login/reset/**`
- New required-password-change route
- `components/shell/impersonation-banner.tsx`
- `firestore.rules`
- `firestore.rules.test.ts`
- `firestore.indexes.json`
- `firestore.rules` lease/session fixtures and negative tests
- Admin audit repository, viewer, and tests
- `docs/conventions/auth.md`
- `docs/conventions/impersonation.md`
- `docs/conventions/realtime.md`
- Parent handoff references and browser matrix
- Generated command/capability/project references after the parent docs phase

Do not assume any path listed here is still current after the parent foundation
train changes it.

## Commit Boundaries

Use one intent per verified local commit. Suggested boundaries:

```text
feat(auth): add account-management capabilities and contracts
feat(auth): enforce epoch-based session revocation
feat(auth): add Firebase account administration actions
feat(auth): add temporary-password lifecycle
feat(admin): add canonical account management surface
feat(audit): persist and browse account administration events
test(auth): drive account lifecycle and revocation behavior
docs(auth): publish Admin Account module contracts
```

Do not combine route deletion, RBAC migration, password lifecycle, Rules changes,
durable audit schema, and broad documentation rewrites in one commit.

## Browser Acceptance Matrix

Record browser, viewport, JavaScript mode, role, URL, action, and observed result.
Use only Auth/Firestore emulators and local storage. Do not use production accounts.

### Directory And Access

- Open `/admin` directly, by navigation, by refresh, Back, Forward, and no-JS.
- Confirm the same canonical full page appears for every navigation mode.
- Browse forward through multiple Auth pages and use exact-email lookup.
- Submit an invalid or stale page cursor and observe an explicit safe state.
- Observe Auth outage as unavailable, not as an empty directory.
- Confirm non-admins receive `/403` without account data loading.
- Confirm impersonated sessions cannot open or mutate the account surface.

### Create And Detail

- Create a user with valid data and observe the one-time temporary-password result.
- Repeat create, detail, and validation-failure flows with JavaScript disabled; server-owned forms must remain truthful and safe.
- Attempt duplicate email, invalid role, malformed input, and duplicate submission.
- Sign in as the created user and observe mandatory password change.
- Attempt direct dashboard navigation before changing the password and observe the required-password guard.
- Complete the permanent password change and observe sign-out and fresh login.
- Confirm the temporary password is absent from audit, stdout, page source after close, and controlled error output.

### Role And Status

- Change a target role and observe the target's old session lose access after revocation.
- Repeat role, enable, disable, and session-revoke submissions with JavaScript disabled; preserve the result and safe redirect.
- Confirm the target can regain only the new capability set after fresh login.
- Disable a target and observe all target browser contexts sign out and new protected reads fail.
- Re-enable the target and observe login works with the existing permanent password.
- Attempt self-disable, self-demotion, and final-admin removal; observe closed failures.
- Verify the administrator performing the mutation remains signed in.

### Password Operations

- Request forgot-password recovery for an existing and unknown email; observe the same neutral response.
- Complete signed-in password change after recent reauthentication.
- The signed-in Firebase reauthentication/password transition may require JavaScript; with JavaScript disabled, show an explicit truthful requirement rather than a fake successful form.
- Attempt a password change with an incorrect current password.
- Admin-reset a user in two browser contexts and observe both contexts sign out.
- Sign in with the temporary password, complete required change, and observe final sign-out.
- Confirm admin reset does not sign out the acting administrator.

### Revocation And Realtime

- Start an assets realtime listener in two target browser contexts.
- Trigger role change, disablement, admin reset, and explicit session revoke separately.
- Observe `revokedAfterEpoch` marker creation/update.
- Observe each official client closes its listener and signs out within the documented bound.
- Confirm no new protected Firestore snapshot arrives after revocation.
- Reconnect an offline/stale client and confirm it cannot receive new protected data before reauthentication.
- Confirm a fresh login after the cutoff is allowed.

### Audit

- Confirm each account mutation appears with action, real actor, target, result, and timestamp.
- Confirm impersonation start and stop show both real and effective actor attribution.
- Filter and page the viewer through duplicate timestamps without skips or repeats.
- Inject a durable audit write failure and observe an explicit incomplete/reconciliation state.
- Confirm passwords, reset links, tokens, cookies, request bodies, and provider errors are absent.
- Confirm non-admin and impersonated sessions cannot read the viewer.

### Accessibility And Responsive Behavior

- Operate directory, detail, create, edit, reset, disable, audit filters, and pagination with keyboard only.
- Confirm dialog or full-page focus behavior is predictable and errors are announced once.
- Test at 320 CSS pixels and 200% zoom.
- Confirm account rows wrap without clipping identity, status, or actions.
- Confirm temporary-password visibility, copy action, and revocation state are understandable to assistive technology.
- Record the actual assistive technology, browser, and versions for every screen-reader or announcement claim.

## Risk Register

### Password Secret Exposure

- Risk: temporary password appears in logs, audit, URLs, server errors, or remains in the DOM.
- Mitigation: server CSPRNG, one-time result, bounded UI state, explicit redaction tests, no URL transport.
- Evidence: controlled log/audit/page-source inspection.

### Claims And Profile Drift

- Risk: role or password-state updates replace unrelated claims or create a second profile authority.
- Mitigation: one claims helper, Auth as identity authority, preservation tests.
- Evidence: before/after claim integration tests.

### Partial Auth, Marker, And Audit Writes

- Risk: one external system succeeds while another fails.
- Mitigation: explicit operation states, marker-first fail-closed behavior where needed, compensation for newly created accounts, visible reconciliation events.
- Evidence: injected failure tests and audit viewer observations.

### Revocation Is Not Actually Immediate

- Risk: Firebase refresh-token revocation leaves direct Firestore listeners alive until token refresh.
- Mitigation: marker-first monotonic cutoff, exact `floor(now / 1000) + 1` formula, server marker check, `revokedAfterEpoch` Rules check, client marker listener, and `checkRevoked=true` server verification.
- Evidence: two-browser and stale/offline reconnect tests.

### Mandatory Password State Is Bypassed

- Risk: a client calls a generic action or clears `mustChangePassword` without actually changing the password.
- Mitigation: central ordinary-action denial plus one server-owned fresh-ID-token/password transition action.
- Evidence: direct action/API attempts with the claim set and proof-token replay/omission tests.

### Last Administrator Lockout

- Risk: an operation removes the only remaining administrator.
- Mitigation: server-only Firestore lease with owner/generation/expiry checks serializes bounded in-app demotion/disable operations, followed by live count and postcondition checks; PostgreSQL uses its own lock equivalent.
- Evidence: role and disablement matrix with one and multiple administrators.

Firebase Console changes and external Admin SDK callers are outside the lease and
remain a declared residual risk; do not claim cross-system atomicity.

### Durable Audit Finalization Fails

- Risk: Auth mutation succeeds while the durable audit remains unfinished, or impersonation stop traps the administrator while trying to audit.
- Mitigation: started/finalized event states, deterministic event IDs, visible reconciliation, and unconditional impersonation-ticket cleanup with bounded stdout fallback.
- Evidence: injected audit-start/finalize failures and stop-impersonation browser flow.

### Audit Viewer Overclaims Durability

- Risk: a Firestore collection is described as tamper-evident compliance storage.
- Mitigation: document application audit history honestly and preserve downstream retention responsibility.
- Evidence: operation docs and audit failure behavior.

### Admin Surface Races Routing Work

- Risk: account UI is built against intercepted-route behavior that Phase 7 later removes.
- Mitigation: hard gate on Phase 7 and serialize route/admin hotspots.
- Evidence: structure check proves canonical topology before account implementation starts.

## Fork Contract

The Firestore Lead MUST:

- Complete this module before the final verified fork commit.
- Preserve Firebase Auth and the account lifecycle in the tagged Firestore base.
- Keep `revokedAfterEpoch` and Firestore Rules proof in the Firestore implementation.
- Leave MBG-specific domain assignments out of the shared module.
- Record the module's browser, emulator, Rules, audit, password, and revocation evidence in the parent completion report.
- Include this handoff in the tagged source history or link it from the canonical parent handoff before tagging.

The PostgreSQL Lead MUST:

- Read this handoff and the parent fork contract before implementation.
- Preserve Firebase Auth, capabilities, account actions, password lifecycle, and UI behavior.
- Replace the Firestore durable audit repository, revocation marker machinery, and final-admin lease with PostgreSQL-owned table/advisory-lock implementations where the PostgreSQL architecture requires it. Firebase Auth behavior and the user-visible lifecycle remain shared.
- Use authenticated SSE/session revalidation for PostgreSQL realtime rather than copying Firestore Rules.
- Not add a second account lifecycle or silently remove any MBG-parity operation.

## Completion Report

This report does not re-drive the matrix; it maps each row to the parent Phase 12
evidence that drove it and names every row Phase 12 did not drive as residual. The
authoritative observations live in
`docs/handoffs/2026.07.21-0010-next-generation-foundation/README.md` under "Browser
Observations" and "Firestore Proof" of the Phase 12 completion report (driven
2026-07-22 in Chromium across port-isolated lanes). Line references below point into
that file.

### Outcome

- Status: `COMPLETE — acceptance carried by parent Phase 12`
- Parent foundation phase at activation: Phase 7A, immediately after the parent routing phase.
- Parent evidence: Phase 12 completion report, "Browser Observations" and "Firestore Proof".
- Parent official fork tag: `postgresql-fork-base-v1` → `b74fb503a52bc9a1e3e5ce47b7f3bf9c3a56fb63`.
- Worktree at parent tag time: clean (`git status --porcelain` empty, per parent Phase 12).

### Operations Verified (via parent Phase 12)

- Directory/detail: DRIVEN. `[user]` gets `/403` on every admin surface and the
  `/admin/accounts` RSC payload carried only the reader's own email; `[admin]` list works.
- Create/temp password/mandatory change: DRIVEN. Create reveals a 20-char password once
  in a `role="alert"` panel; signing in forces `/password/change` and every protected
  route redirects there until the change completes.
- Display-name/role update: DRIVEN. A role change wrote `{"role":"admin"}` and advanced
  `validSince` (read back over the Auth REST API); the change ended every target session.
- Enable/disable: DRIVEN. Disable set `disabled=true` and made a direct
  `signInWithPassword` answer `USER_DISABLED`.
- Admin reset: DRIVEN. `user.password.reset` audit doc carries the typed reason and no
  password field; the reset ended every target session.
- Self-service password change: DRIVEN. A completed change cleared `mustChangePassword`
  while PRESERVING the role; the only `<noscript>` on `/password/change` renders truthfully.
- Sign out all sessions: DRIVEN. Two contexts on `/realtime`; after "Keluarkan semua
  sesi" both were on `/login` with empty cookie jars within ~2s.
- Impersonation: DRIVEN. An admin impersonating a user gets `/403` on read, and a
  mutation from a stale admin-rendered page answers "Anda tidak memiliki izin" with the
  target's revocation marker unchanged.
- Durable audit viewer: DRIVEN. Audit docs were read back over the REST API for every
  mutation (real actor uid, target uid, action, result, timestamps); no temp password
  appears in the audit page DOM.
- Forgot-password recovery: NOT DRIVEN under Phase 12 — see Residual Risks.

### Revocation Proof

- Marker path: `authSessions/{uid}`
- Marker field: `revokedAfterEpoch`
- Epoch unit: `UTC Unix seconds`
- Cutoff formula: `floor(Date.now() / 1000) + 1`
- Server `checkRevoked` + Rules old/new token: DRIVEN via rules tests — a
  `mustChangePassword` token reads `assets` 403 while the account's own marker stays 200,
  the asymmetry that lets a client learn it was revoked.
- Client marker watcher: DRIVEN — both contexts left for `/login` at t+2s after the marker advanced.
- Two-browser sign-out bound: ~2s observed (revocation clicked 08:39:12Z; both contexts on `/login` at t+2s).
- Offline/reconnect behavior: NOT DRIVEN — see Residual Risks.

### Security Proof

- Passwords absent from logs: DRIVEN — zero occurrences of the temp password in the dev log or emulator log.
- Passwords absent from audit: DRIVEN — zero occurrences in the full audit dump or the audit page DOM.
- Temporary password one-time reveal: DRIVEN — revealed once, absent from the page DOM after dismissal.
- `mustChangePassword` central gate: DRIVEN — every protected route redirects to `/password/change` until change completes.
- Server-owned permanent-password transition: DRIVEN — the completed change cleared the flag server-side and preserved the role.
- Impersonated-admin refusal: DRIVEN — impersonated session can neither read nor mutate the account surface.
- Non-admin denial: DRIVEN — `[user]` gets `/403` everywhere and asset delete is refused server-side, the row surviving.
- Final-admin protection / lease-concurrency: NOT DRIVEN under real contention — see Residual Risks.
- Partial failure/reconciliation behavior: NOT DRIVEN by a real failure — states were injected only; see Residual Risks.

### Residual Risks

The following rows were not driven under parent Phase 12 and are inherited by the same
future passes as the parent's own residual risks (next verifier / PostgreSQL Lead / next
UI pass). They are named here rather than claimed:

- Forgot-password recovery UI (the reset-link send/consume flow) was not driven in the
  Phase 12 browser matrix. Owner: next verification pass.
- Offline/reconnect of a stale client resuming after the revocation cutoff was not driven
  (parent names it undriven). Owner: next verification pass.
- Final-admin protection was not driven under real concurrent contention on the lease;
  only the single-path guard is covered by unit/integration. Owner: next verification pass.
- Partial-failure reconciliation (`reconciliation_required` / `failed` audit states) was
  exercised by injection, never by an actually-caused durable-write failure. Owner: next verification pass.
- Cross-system atomicity with Firebase Console / external Admin SDK callers outside the
  lease is a permanent declared residual — the lease bounds this app, not other clients.

## Final Declaration

Made against the driven rows above; the residuals named above are explicitly excluded and
carried, matching the parent's accepted residual risks:

```text
ADMIN ACCOUNT MODULE READY: Firestore Auth account administration, parity-plus
password lifecycle, epoch-based revocation, durable admin audit, and impersonation
integration are driven under parent Phase 12 and included in the foundation fork scope
(`postgresql-fork-base-v1`), with the residual rows above named and carried, not claimed.
```
