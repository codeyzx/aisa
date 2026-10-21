# The capability model: deletion is the design

Most starters are judged by what they include. This one is judged by what comes **out**
cleanly. A capability here — storage, AI, export, realtime, impersonation, observability,
rate limiting — is built so a fork can delete its directory and have its configuration stop
being required, with no dangling secret and no orphaned schema left behind in a file
somebody else owns.

That is a design constraint, not a slogan: **the test of a seam is its removal.** If
deleting a capability forces edits scattered across files that have nothing to do with it,
the seam leaked, and the leak was there long before anyone tried to delete anything. It
just was not visible while everything was switched on.

The procedure is [remove a capability](../how-to/remove-capability.md). This file is why it
is short enough to be a procedure at all.

## What makes a capability removable

**Its config lives beside its code.** Each capability owns its own schema in its own
directory, so deleting the directory takes the schema with it. This is the deliberate
opposite of a central env module, where deleting a feature left its schema behind still
demanding a secret nothing read any more — and nothing failed, so nobody noticed until the
next deployment asked an operator for a key that did nothing.

**The manifest is thin on purpose.** `lib/env/registry.ts` holds one line per capability: a
name, a pointer at the capability's own validator, and optionally its enabled toggle.
Nothing about a capability's _schema_ lives there, which is what keeps the line genuinely
one line, and what keeps the registry from becoming the central module it replaced.

The registry exists at all because boot validation needs a list to iterate. Before it, the
boot check held a hand-maintained array of reads — so the set of capabilities that read env
and the set the boot check knew about were two lists free to drift apart. Registering is now
the single act. A capability that reads env without an entry is exactly the bug the list
prevents: its config would first be validated in production, on the first request that
happened to need it.

**Boot is the gate, not first use.** Validating at startup means a misconfigured deployment
refuses to serve instead of failing deep inside a user's action hours later, and every
misconfigured group is reported at once rather than one restart at a time.

## Shipped-but-off is a third state, and it has to be honest

A capability can ship in the tree and stay disabled. That creates a trap: if boot validated
a disabled capability's credentials, "off" would still demand an API key, and nobody could
actually run without it. So the toggle is read first and a disabled capability's config is
never parsed. A capability with no toggle is always on.

A toggle that cannot be understood is reported as a boot failure rather than silently read
as off — an unparseable flag is an operator who _believes_ the feature is on, and quietly
disagreeing with them is worse than refusing to start.

Not every toggle means the same thing, which is worth noticing before adding one. Some
capabilities ship off by intent. Others are always on but need different credentials
depending on the target — demanding a production service-account key to boot against a
local emulator would be configuration theatre, so that condition is about the target, not
about the feature being optional.

## Availability is not permission

A disabled capability also has to disappear from the product surface, and that is a
different question from what a role grants. `lib/auth/capability-availability.ts` answers
"does this deployment ship it at all"; the RBAC grant table answers "may this person do it".
The server gates and the navigation filter read both, so a switched-off capability is
refused at the boundary **and** never advertised.

They stay separate for two reasons. The mechanical one: the grant table is
client-reachable so navigation can call it, while a config toggle is server-only. The real
one: an admin denied AI because the deployment turned it off has not been denied by
permission, and only one of those two facts is fixable by changing a role. Collapsing them
would make the product lie about which.

## Why each capability has its own contract file

The same argument, applied to the docs. Every normative contract in
[`../reference/contracts/`](../reference/contracts/) names something a fork can remove on
its own, with its own removal checklist. The optional capabilities are separate files rather
than one shared `capabilities.md` precisely because deleting one would otherwise mean
editing a document three surviving capabilities depend on — which works directly against the
model.

Impersonation is split from auth for a different reason: it is a sanctioned auth **bypass**
and the highest-risk surface in the repo. Folding it into a longer auth contract lowers the
odds someone reads it before touching it, and that is the one thing that must not happen.

## The examples are deletable by construction

The demo surfaces live in one route group that comes out in a single cut, and the
dependency only ever points **example → feature/lib**, never the reverse. A lint rule
enforces that direction, so the day someone reaches the other way the build says so, rather
than the deletion discovering it months later.

That leaves exactly one thing the static proof cannot catch: navigation entries pointing at
routes that no longer exist. A dead link is not a compile error. Removing the demo section
from application navigation is part of the real deletion, and confirming it is a browser
step — see [verify a change](../how-to/verify-change.md).

## Adding a capability

The same properties, in reverse. A new capability owns its own directory and its own config
schema, registers one line for boot validation, adds one availability line if it ships with
a toggle, gets its own contract file, and keeps every dependency pointing inward. If you
cannot describe its removal in a short checklist, it is not a capability yet — it is
entangled application code wearing the name.
