# Impersonation contract

- Type: Normative contract (reference)
- Owns: the sanctioned auth bypass — the signed ticket, the start/stop surfaces, the banner and the exit, the TTL, and the attribution trail
- Source of truth: `lib/auth/impersonation.ts`, `lib/auth/impersonation.config.ts`, `resolveImpersonation` in `lib/auth/session.ts`, `lib/actions/impersonation.action.ts`, `components/shell/impersonation-banner.tsx`, `components/shell/impersonation-blocked.tsx`
- Verified by: `pnpm check:static && pnpm test` (`lib/auth/impersonation.test.ts`, `lib/data/audit.test.ts`), then a driven round trip — start from `/admin`, confirm the target genuinely loses admin, exit from the banner
- Read when: before touching ANYTHING named impersonation, and before adding a role that may see the admin surface
- Does not define: how an ordinary session is resolved, guarded, or revoked, and how roles and capabilities are extended (`docs/reference/contracts/auth.md`)

_A deliberate, sanctioned auth bypass. Read this before touching it._

An admin can look at the app **as** a specific user — without that user's
password, and without leaving their own session. It exists because a support
engineer who cannot see what the user sees debugs by guessing.

This is the highest-risk feature in the boilerplate, and the risk is not that it
breaks: it is that it works. What follows is the model, and the limitation it
accepts on purpose.

## The one rule

**Impersonation is a new ANSWER from the existing boundary, not a new boundary.**

`docs/reference/contracts/auth.md` calls `getSession()` the single server-authoritative
"who is acting" boundary, and that stays exactly true. `runAction`,
`requireCapability` and `app/(app)/layout.tsx` all resolve
identity through that one function, and none of them knows impersonation exists.

Do **not** add a `getEffectiveSession()` beside `getSession()`: it is a
local-variant shape landing in the one place where a local variant is also a
security hole. Every authz check in the repo would keep seeing the admin, so the
"impersonated" session would be an admin wearing a name tag — and it would
typecheck.

## How it works

- The admin's **real session cookie is never touched** and stays the only root of
  trust. `getSession()` verifies it exactly as always.
- **Only then** does it ask: is there a second cookie holding a ticket signed by
  us, whose `actorUid` is this already-verified uid?
- If yes, the resolved `Session` is **the target's** identity — `uid`, `email`,
  `role`, all read fresh from the target's live user record — carrying an
  `impersonator` field naming the admin.
- Because `Session.uid` is always _who is being acted as_, every existing
  capability check keeps working unchanged. An impersonated admin **genuinely
  loses admin**: the `user` role has no `asset:write`, so creating an
  asset fails, and the **Impersonate** entry in the user dropdown disappears because
  it is gated on `can(session, 'admin:access')` — now the target's answer, which is
  false. Nothing is special-cased to make either happen.
- If the ticket is present but the target's live record **cannot be read**, the
  session is neither the admin's nor the target's: it carries
  `impersonationUnavailable`, `can()` fails closed on it, and the shell replaces the
  app with a blocking screen whose only action ends the overlay. See "When the
  directory is down" below.

The ticket is `{ actorUid, targetUid, exp }`, base64url, plus an HMAC-SHA256 over
it (`lib/auth/impersonation.ts`). Stateless: no collection, no document, no read
added to any request.

### The start surface — a dropdown, then a picker

Impersonation is **started** from the user dropdown, not a bare admin page. The
`Impersonate` entry (`components/shell/topbar.tsx`) shows only to a session that can
open `/admin` (`can(session, 'admin:access')`), and links to the `/admin` picker at
`app/(app)/admin/page.tsx` — ONE full page, the same surface whether the click is soft,
direct, or from a JS-off client. The picker browses Firebase Auth server-side
(`listUsers(25)` for the roster, exact `getUserByEmail` for a lookup) behind its own
`requireCapability('admin:users:read')` — opening the admin surface is not permission
to enumerate the account directory — hands the client SAFE DTOs only, and starts the
impersonation **by UID**. The dropdown link sets `prefetch={false}` so `listUsers`
never runs on hover — only on a real click.

Everything below — the ticket invariants, the banner, and the exit — is UNCHANGED by
where it starts.

### Why a ticket and not a real login

Minting a genuine Firebase session for the target (`createCustomToken` →
`signInWithCustomToken` → `createSessionCookie`) is the obvious alternative.
Reject it:

- It uses **no HMAC**.
- It mints a **genuine, indistinguishable credential for the target** — a leaked
  cookie is account takeover with no bound.
- It **overwrites the admin's own cookie**, so exiting means re-login or stashing
  a second cookie — at which point you have two cookies anyway, with the
  dangerous one on the outside. The admin must not get stranded as the target.
- It puts a Google round trip inside the auth path.

A Firestore ticket store is also rejected: it reshapes the data model and buys
one thing — revoking a live ticket — which the TTL below is the deliberate answer
to until someone states that requirement.

## The rules it enforces

- **Gate on the ACTOR:** `impersonation:start`, applied by `runFormAction` before
  a single user record is read. A dedicated capability naming "may act as another
  user", kept distinct from `admin:access` ("may open the admin console").
- **Refuse self.** A no-op that only muddies the trail.
- **Refuse any target who can open `/admin`.** Admin→admin is a lateral move that
  buys no support-debugging value.
- Both refusals **ask `can()`** about a `Session` built from the target's live
  claims. **Never keep a list of admin uids** — that is a hand-kept copy of what
  `lib/auth/rbac.ts` already models, and here it would be a security control that
  silently drifts from the real grant table.
- **Impersonation-within-impersonation** needs no rule: while impersonating, the
  session is the target, and the target holds neither `impersonation:start` nor
  `admin:access` — so the actor gate refuses before any user record is read.
- **The ticket authorizes WHO, never WHAT.** It carries a uid, never a role. A
  signed role is not forgeable, but it is **stale**: demote the target
  mid-session and the ticket keeps handing out the old role with our own
  signature on it.
- **A bad ticket means no impersonation. It never means no session.** Ticket
  resolution has its own try/catch; folding it into `getSession()`'s would mean
  one flipped cookie byte signs the admin out.
- **The refusals re-run on EVERY request, not only at the mint.** The start
  validates a LIVE re-read of the target (a picker row's `eligible` flag is
  display-only and may be stale), and `resolveImpersonation` re-reads and
  re-refuses on each subsequent request — so a target disabled or promoted after
  the mint loses the overlay without anyone revoking anything.

### When the directory is down

An overlay is only ever ended by a **definitive** answer. A malformed, expired or
wrong-actor ticket ends it (the admin resumes), and so does a Firebase
`auth/user-not-found`. **Anything else — an unreachable Admin SDK, a timeout, an
unknown fault — must not.** Falling back to the real admin on an unreadable
directory would drop the banner and silently restore full admin authority while the
impersonation cookie is still present.

So an unresolvable target produces a BLOCKED session instead: `uid` is the intended
target from the signed ticket, `impersonator` stays set so the block is attributable,
and `impersonationUnavailable` makes `can()` deny everything — the boundary half.
The UI half is `app/(app)/layout.tsx`, which audits `impersonation.blocked` and
renders `ImpersonationBlocked` **in place of** the app rather than beside it. That
screen is server-rendered with no `'use client'`, and its exit works while the
dependency is down because stopping reads only the signed cookie and never calls the
directory.

## The banner and the exit — do not "fix" this

An impersonated session is marked by a persistent banner
(`components/shell/impersonation-banner.tsx`), rendered by the app shell whenever
`session.impersonator` is set, carrying the only exit control.

⚠️ **The exit is gated on the TICKET's existence, never on a capability. This is
not an oversight — it is the whole design, and "tightening" it is a one-way door.**
While impersonating, the session **is** the target and holds none of the admin's
capabilities. An exit behind `admin:access` would be **a locked door from the
inside**: the admin could start an impersonation and not end it, leaving the TTL
(15 min) or a hand-cleared cookie as the only way out. The signed ticket already
proves an admin started this, which is exactly the authority needed to end it.

For the same reason the exit **cannot live on `/admin`**, the surface that starts
it: while impersonating, `can(session, 'admin:access')` is false and `/admin`
answers `/403`. The shell is the only surface still reachable — which is why the
banner, not the admin page, hosts the exit.

The banner rides in the shell's **sticky header block**, not page flow — an admin
who stops seeing it and writes data as someone else is the hazard, and a banner
that scrolls away addresses the wrong half of that. It is also **not** a
`'use client'` component — a plain `<form>` posting the server action needs no JS,
because the exit from a deliberate auth bypass must not depend on a bundle loading.

## The limitation this accepts

> **A live ticket cannot be revoked before it expires. The TTL is the bound.**

The ticket is stateless by design, so **its lifetime IS its revocation** — there
is no server record to tear up, and nothing to consult. If an admin starts an
impersonation and closes the laptop, that ticket keeps working until `exp`.

That is why the TTL is **15 minutes, absolute, with no refresh**
(`IMPERSONATION_TTL_MS`). Compare `SESSION_MAX_AGE_MS` — 5 days: 15 minutes is
the real unit of "look at what this user sees", and a deliberate auth bypass
takes the fail-closed default.

**Refreshing the ticket on activity is not on the table.** It converts a bounded
bypass into an unbounded one, silently, and nobody would notice.

If "kill a live impersonation from another device" ever becomes a stated
requirement, that is the Firestore ticket store, and it is a real reshape — not a
tweak.

### The signing secret

`IMPERSONATION_SECRET` is its own key (min 32 chars), read through
`getImpersonationConfig()` in **`lib/auth/impersonation.config.ts`** — the schema is
colocated with the capability, so `trash lib/auth/impersonation.ts` +
`impersonation.config.ts` deletes cleanly and leaves no orphan schema in a shared file.
The read is deliberately **not** at module top level: that would run at import time,
before the boot check's single controlled trigger, and would break importing the module
from a test that configures no secret. The requirement is enforced at boot instead —
`lib/env/registry.ts` lists impersonation in `CAPABILITY_CONFIGS` — so a build that still
ships the feature **requires the secret to start**. To run without it, delete the feature
AND remove its one line from `lib/env/registry.ts`.

Do not couple the HMAC key to the Firebase service-account private key. Deriving
it there buys one revocation lever — rotating that key invalidates every
outstanding ticket — but it couples signing to a credential with its own rotation
schedule and its own purpose. **The TTL is what this design buys instead.**

## The trail

`impersonation.start` is emitted by the admin's own session, so it reads
`uid = admin, target = user` — honest, and unremarkable.

`impersonation.stop` is the interesting one: it is emitted **while the ticket is
still live**, so `audit()` is handed the target's Session and the line carries
both — the target as `uid`, the admin as the actor. This is why stop audits
**before** clearing the cookie.

Exiting an impersonation of `user@aixel.test` started by `admin@aixel.test`:

```json
{
  "type": "audit",
  "action": "impersonation.stop",
  "target": "NTbs7mU9XoX1yEzPQwg6lZiQwXc2",
  "uid": "NTbs7mU9XoX1yEzPQwg6lZiQwXc2",
  "actor": "imqOELsxlQ2RtvnRN2WHJdAkJW8t",
  "at": "2026-07-17T12:43:20.616Z"
}
```

`uid` is the target; `actor` is the admin. `audit()` emits `actor` off the
`impersonator` on the Session it is **already handed**, so no call site knows this
happened and every existing `audit(session, …)` tells the truth for free.

> ⚠️ **`actor` is unit-tested (`lib/data/audit.test.ts`) and exercised on the
> lifecycle path above; the domain-mutation path is not reachable with the seeded
> roles.** Every `audit()` call site sits behind `asset:write`, and
> `ROLE_CAPABILITIES.user` is `['asset:read','storage:read']`, so **no
> impersonatable principal can reach an audited domain action**: the refusal rule
> rejects any target holding `admin:access`, the only seeded principal that has
> `asset:write`. Grant a role `asset:write` **without** `admin:access` and an
> impersonated `asset.create` carries `actor` with no code change — the same field
> doing the same job.

**Do not invent a second audit sink for impersonation.** `audit()` is the seam for
the stdout trail, and the durable half goes through the SAME shared writer every
account mutation uses (`lib/audit/account-audit.repo.ts`) — not a bespoke one.

### The durable half, and the one rule it must not break

Both lifecycle events are also written to the durable account-administration
history and shown in the viewer at `/admin/audit`, with `actorUid` = the real
administrator and `effectiveActorUid` = the identity they act AS. On **start** the
session is still the admin, so the target uid supplies the effective actor; on
**stop** the session IS the target, so both come off opposite halves of one
`Session`. That is the fact an ordinary log line loses.

> ⚠️ **STOP always clears the ticket, whatever the audit does.** The durable write
> is best-effort on that path and only on that path: a Firestore outage in front
> of `cookieStore.delete` would leave the admin inside a deliberate auth bypass
> with the exit button throwing, and the 15-minute TTL as the only way out. On
> failure it emits a bounded stdout line (`durableAudit: 'unopened' | 'unsettled'`)
> and leaves the durable event visibly incomplete for reconciliation.

**START is the opposite and deliberately so:** if its event cannot be opened, the
whole start is refused. An impersonation nobody can account for must not begin,
and refusing traps no one — the admin simply stays themselves.

## Extending roles — read this first

⚠️ **The two ends of this feature are gated on DIFFERENT capabilities, and the
asymmetry is the thing to understand before you add a role.**

The ACTOR end is gated on `impersonation:start` — a capability that names exactly
"may act as another user", so a project can grant the admin console without granting
this by removing one entry from `ROLE_CAPABILITIES`.

The TARGET end still reads **"refuse anyone who may open `/admin`"**
(`can(target, 'admin:access')`), not "refuse anyone who may impersonate". Those
coincide while `ROLES` is `['admin','user']` and `ROLE_CAPABILITIES.admin` is
`[...CAPABILITIES]`. **They diverge the moment a project adds a third role** — the
extension point `rbac.ts`'s own header advertises.

> **If you add a role that may see the admin surface but is not privileged enough to
> be off-limits as a target, revisit the target rule at the same time.** It is a
> refusal, so widening it is safe and narrowing it is not.

Concretely: a read-only `auditor` role granted `admin:access` becomes
**un-impersonatable** as a side effect of that one grant — which may be exactly right,
or may hide a support account nobody can debug. Decide it deliberately; the rule asks
`can()` about the target's live claims and never a hand-kept list of admin uids, so
changing the sentence is a one-line change in one place.
