# Four Security Surfaces Never Driven In A Browser

Owner: this repository. Direction: found in the PostgreSQL fork, confirmed here.
Status: `OPEN — confirmed by static read, not yet driven`. Effort: 1-2 days.
Severity: verification gap.

## What Is Wrong

Four surfaces are built here, unit-tested here, and have **never once been driven end to end
in a browser**:

- **The admin account directory** — `app/(app)/admin/accounts/_components/account-directory.tsx`
  and `app/(app)/admin/accounts/[uid]/page.tsx`.
- **The impersonation round trip** — `app/(app)/admin/_components/impersonate-row.tsx` and
  `user-picker.tsx`: start, act as the target, exit, and land back as the administrator.
- **The mandatory password-change gate** — `app/password/change/`, enforced at
  `lib/auth/guards.ts:66` and `:92`.
- **Revocation** — `lib/auth/revocation-watch.tsx`. The claim that a sitting-still tab is
  signed out when its session is revoked is **entirely unproven in a browser**.

These are the highest-consequence paths in the repository. A regression in any of them fails
open — an admin control that still renders, a gate that stops redirecting, a revoked tab that
keeps working — and every one of those failure modes is invisible to a unit suite that mocks
the boundary it is meant to be testing.

The fork now drives all four against its shipped image. This is persistence-neutral work: none
of it depends on which database is underneath.

## Why A Unit Test Cannot Close This

Each of these spans layers a unit test replaces with a mock:

- The directory renders through a real `await headers()` and a real session projection.
- Impersonation is a cookie overlay: the round trip only exists across three real requests,
  and the interesting failure — coming back as the wrong principal, or as nobody — happens in
  the cookie jar, not in a function.
- The gate is a redirect. A redirect that stops happening is a passing unit test and a broken
  product.
- Revocation is defined by what happens to a tab **that is not doing anything**. There is no
  function call to assert on; the whole claim is about elapsed time and a listener.

## Prerequisite, And It Must Land First

`e2e/sign-in.ts` has no retry and has never needed one. The session-mint budget is
`limit: 10 / 60s`, keyed per-uid (`app/api/auth/session/route.ts:57` and `:123`), and the
existing suite spends about three admin sign-ins.

Adding these four specs takes that to roughly eight or nine **on the same uid**, which crosses
the budget and produces a failure that will read as a broken test rather than a rate limit.

Add a bounded retry with backoff to the shared sign-in helper before writing the specs.

**Do not add an environment flag that disables the limit.** The fork considered exactly that
shape and fenced it to loopback with a boot refusal precisely because a bypass flag is
dangerous; here there is no obstacle that justifies one at all. A retry is honest — it waits
for a real limiter — and it keeps the limiter itself under test.

## What To Write

Four specs, each proving the behaviour rather than the render:

- **Directory** — sign in as an admin, land on `/admin/accounts`, and see the seeded accounts
  listed with their roles. Then follow a row into `[uid]` and confirm the detail page renders
  that account and not another.
- **Impersonation** — start impersonating a non-admin, confirm the banner appears and an
  admin-only control is gone, then exit and confirm the admin's own surfaces return. The exit
  half is the half that matters: the fork's browser close-out found a real defect there that
  six unit tests had not caught, where leaving an impersonation signed the administrator out
  entirely.
- **Password gate** — sign in as an account owing a change, confirm every route redirects to
  `/password/change`, then make the change and confirm the gate **releases**. A gate that never
  releases is as broken as one that never holds.
- **Revocation** — sign in, leave the tab idle, advance the `authSessions/{uid}` marker out of
  band, and confirm the tab signs itself out without being touched.

The revocation spec is **easier here than in the fork**: advance the marker through the
emulator REST surface. There is no trigger, no row-delete subtlety, and no impersonation
routing to reason about, because the watcher compares two numbers.

## A Structural Note Worth Copying

The fork put its e2e database helper under `scripts/` **specifically so the cli-safety
structure check scopes to it**, which makes its safety-gate import machine-checked rather than
a convention.

The equivalent helper here belongs beside `scripts/db-reset.ts` and should import
`requireEmulatorTarget`. The existing cli-safety check already covers `scripts/**` and already
recognises the emulator REST form, so this works with no change to the checker — but only if
the helper is placed there rather than under `e2e/`.

## Do Not

- Do not add an environment flag to disable rate limiting, as above.
- Do not assert on the fork's numbers or spec names. Its suite is shaped by Better Auth's
  session model; ours is shaped by a token and a marker. Same four behaviours, different
  mechanics.
- Do not fold these into an existing spec file. Each surface should fail on its own, so a red
  run names the broken surface without triage.

## Checkable Finish

`pnpm test:e2e:ci` — which builds and drives the **real image**, not `next start` — runs green
with the four new specs, and the report names the behaviour observed per spec rather than a
count. Specifically: the impersonation spec observed the admin returning as themselves; the
password spec observed the gate releasing after a change; the revocation spec observed an
untouched tab signing itself out.

Then prove the specs are load-bearing rather than decorative. For each, revert the behaviour it
covers and watch that spec fail: remove the gate's redirect, and the password spec fails;
neuter the revocation watcher, and the revocation spec fails. A spec that still passes with its
subject broken is worse than no spec, because it converts an untested surface into one that
reads as tested.

Report the runtime caveat with the result: local runs here execute under a Node version the
container does not ship.

## Files

- `e2e/sign-in.ts` — bounded retry (prerequisite)
- `e2e/admin-directory.spec.ts`, `e2e/admin-impersonation.spec.ts`,
  `e2e/password-change-gate.spec.ts`, `e2e/revocation.spec.ts` (all new)
- a shared emulator helper under `scripts/`, importing `requireEmulatorTarget`

## Sequencing

The sign-in retry lands first; everything else is parallelisable. Independent of the export and
realtime topics — no shared files.
