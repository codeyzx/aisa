# Why realtime looks like this

Rationale for the one route in this starter that reads Firestore from the
browser. The rules it must obey — the carve-out, the listener lifetime, the
removal checklist — live in the [realtime contract](../reference/contracts/realtime.md).
This page is only the argument behind them.

## The default is a request, not a stream

Nearly every screen here reads its data on the server: a Server Component asks a
repository, the repository asks Firestore through the Admin SDK, and a write
invalidates what it changed. That shape is the default because it makes one
question easy to answer — _who is allowed to see this?_ — and it answers it in
one place, in TypeScript, next to the code that knows the domain.

A live listener answers that question somewhere else entirely. It is a browser
holding an open connection to the database, and no server code sits between the
two. Everything the server boundary was doing for free has to be redone by a
second mechanism.

So realtime is not the better version of a read. It is a different trade, and
the starter takes it exactly once, on one route, so that a reader can see the
trade in full rather than infer it from an abstraction.

## What the one route actually costs

The costs are worth naming because each one is invisible until it bites.

- **A second security boundary.** The Admin SDK bypasses database rules; the Web
  SDK is subject to them. A browser read therefore depends on a deny-all
  ruleset acquiring a carve-out. That carve-out is real security surface, written
  in a language that cannot import the repo's capability map, so it can only
  mirror the server's intent by hand — and mirrors drift.
- **A duplicated authorization decision.** The server gate on the page becomes
  cosmetic for the listener's data: the page is not in the listener's request
  path. Two places now encode "who may read this", and only one of them is
  type-checked.
- **A second SDK in the browser.** Live reads pull the Firestore Web SDK into the
  client bundle. Confining that to a single route is what keeps every other page
  paying nothing for a capability it does not use.
- **A connection that outlives your assumptions.** A session cookie expires; an
  open socket does not notice. Sign-out, revocation and a mandatory password
  change all have to be re-expressed as conditions the stream itself respects,
  because nothing else will end it.
- **A query the database will refuse in production.** A filtered, ordered live
  query needs a composite index like any other, and a local emulator is happy to
  let it through. The failure surfaces where it hurts most: a page that renders
  empty for real users on real data.

None of these are arguments against realtime. They are the bill, and the point of
concentrating them in one route is that the bill arrives in one place.

## Why no data-fetching library came with it

The obvious move — reach for a client cache and a provider at the root — was
declined. The problem a live listener poses is not caching; it is a **resource
whose lifetime follows its subscribers**. Open it when the first component that
needs it appears, close it when the last one leaves, and let everyone in between
share the single copy. React's own subscription primitive is that shape already,
so a library would mostly be re-describing it while adding a dependency, a
provider, and a second model of freshness competing with the server's.

There is also a deletion argument. A root provider is a seam every future page
inherits whether it wants it or not. Module-level state that only the importers
touch is a seam that disappears the moment its importers do — which is the whole
premise of this starter's [capability model](capability-model.md).

## When a fork should add a listener

Add one when the data genuinely **pushes**: it changes without this user acting,
and the user is worse off for not seeing the change immediately. A dispatch
board, a job queue, a document two operators edit at once, a device feed. The
signal is that a manual refresh would be the user's instinct — and that being
seconds late has a cost.

Add it narrowly. One collection, read-only, with the carve-out written and tested
in the same change that adds the listener. A stream added "while we are here"
widens a security boundary for a feature nobody asked for, and boundaries are far
easier to widen than to take back.

## When a fork should remove them

Remove realtime entirely when the answer to "does anything here push?" is no. A
project whose data only changes when its own users submit forms gets nothing from
a listener except the costs above — a carve-out to maintain, an SDK to ship, and
a second reason a page can go blank.

Removing it also means giving back the security surface it bought. A carve-out
whose only consumer is gone is not neutral leftovers; it is an open door with
nobody walking through it, and the next reader will assume something depends on
it. The [realtime contract](../reference/contracts/realtime.md) names exactly
what to revert and, just as importantly, what to leave alone — not every
exception in the ruleset belongs to this capability.

## The drift nobody can test for

The carve-out grants a signed-in browser a read that the server would grant on a
capability. Those two sets match today by argument, not by construction: no test
can compare a database rule against a TypeScript map, because the rule cannot see
the map.

That is a deliberate choice over the alternative — hand-copying the capability
table into the ruleset, where it would silently disagree the first time someone
edits one and not the other. A single argued equivalence, written down where the
rule is, beats a copy that looks authoritative and is not. The price is that the
argument has to be re-checked whenever the roles change, and the contract says so
in the loudest terms it has.
