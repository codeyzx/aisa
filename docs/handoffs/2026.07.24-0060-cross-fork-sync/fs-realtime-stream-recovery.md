# A Refused Realtime Stream Never Recovers

Owner: this repository. Direction: found in the PostgreSQL fork, confirmed here.
Status: `OPEN — confirmed by static read, not yet driven`. Effort: M.

## Most Of The Fork's Realtime Work Does Not Apply

The fork owns its whole transport, so most of its `lib/realtime/` is plumbing the Firestore
Web SDK already provides here: the single reconnecting `LISTEN` with backoff, heartbeats,
`retry:`, `X-Accel-Buffering`, a concurrent-stream cap, the SIGTERM drain, and per-hint
authorization — whose equivalent here is `firestore.rules`, already written and asserted
both ways.

Its hint-and-resync model does not transfer at all. That exists because `NOTIFY` has no
replay, so the browser must be told to re-read. A Firestore snapshot carries the rows and
the SDK resumes from a resume token. There is nothing here for that model to solve.

Two further candidates were checked and rejected:

- Principal-as-stream-identity is already done here.
- The fork's stream-lifetime cap has no analogue, because there is no server-held stream to
  bound. How fast a revoked token stops an already-open listen is an SDK and backend
  property, and must not be asserted in a doc without driving it.

Exactly one idea transfers. It is a real gap.

## What Is Wrong

In `lib/firebase/use-firestore-query.ts`, a terminal `onSnapshot` error publishes
`{data: undefined, error}` and deliberately leaves the dead entry in the module-level
`streams` map. `openStream` runs only when `streams.get(key)` is missing. So as long as any
reader stays mounted, the board is dead forever:

- no retry, and no backoff
- no branch on the error code — a transient outage and a permanent refusal are handled identically
- no way for a reader to tell "still opening" from "dead". `data === undefined` means both,
  and `RealtimeCount`'s own comment admits it.

The error path is not exercised by a single unit test. The `firebase/firestore` mock in
`use-firestore-query.test.tsx` takes only `(_query, onNext)` and never receives an `onError`,
so nothing today can observe this behaviour changing.

## The Change

Bounded recovery from a terminal listener error without a remount, plus an honest status so
the UI stops conflating two states.

In `lib/firebase/use-firestore-query.ts`:

1. On the error callback, read the code with the existing `firebaseErrorCode(error)` — do
   not hand-roll a second reader — and branch. This is the structural equivalent of the
   fork's refusal classifier, and it is cheaper here because Firestore names the reason
   in-band: no probe fetch, no server round-trip, no `retryAfter` parsing.
   - `permission-denied`, `unauthenticated`, `failed-precondition` → **stop**. Stay in the
     error state; a person must act. A missing composite index is a permanent failure and
     retrying it is a loop.
   - `unavailable`, `resource-exhausted`, `aborted`, `internal`, `deadline-exceeded`,
     `cancelled` → tear the dead entry out of `streams` and reopen after a bounded
     exponential backoff.
2. Add a status to `FirestoreQueryResult` — `'connecting' | 'live' | 'offline'` — so
   `RealtimeCount` can stop reporting "opening" and "dead" as the same thing, and the board
   can say it is reconnecting instead of showing a terminal message.
3. Carry over two teardown subtleties in spirit:
   - The retry timer must be cancelled when the last reader releases. The entry's teardown
     already owns refcounting; hang it there.
   - A scheduled reopen must be disowned if the entry it belongs to was replaced or deleted.
     The fork uses an era counter. Here the identity check `streams.get(key) === entry` that
     the release path already performs is the same guard — reuse it rather than inventing an era.

## Do Not

- Do not copy the backoff constants. The fork's are sized against its own server-held stream
  lifetime, a number this repository has no equivalent of. Pick values from what this code
  actually waits on, and write down why.
- Do not port the probe fetch, the retry-after parsing, or the connection identifier.
  Firestore is not a route in this repository and there is no envelope on this path.
- Do not port anything from the fork's SSE, shutdown, listener or hint modules.
- Do not add a client-side stream-lifetime cap. The "connection outlives the cookie" concern
  is already answered by the auth gate on sign-out and by `notRevoked()` / `passwordReady()`
  in `firestore.rules`.
- Do not grow the status field into a general realtime-health surface. Keep it inside the
  bridge and the one example, or this becomes the seam that
  `docs/explanation/realtime-model.md` exists to refuse.

## Risks

- **A retry loop against a permanent refusal is the main hazard.** A `permission-denied`
  from a removed carve-out and a `failed-precondition` from a missing index must both stop.
  Get this wrong and the fix converts a visible dead board into a silent billing loop, while
  burying the very signal the error message exists to surface.
- **The retry timer is new lifetime** in a module whose whole claim is that the last reader
  out closes the stream. A timer outliving its readers reopens a listener nobody is
  watching — the Firestore-billing version of a leaked subscriber.
- **Reopening in place while readers stay mounted** must not resurrect a stale snapshot
  reference, or `useSyncExternalStore` will either loop or serve rows from the dead stream.

## Checkable Finish

Not "unit tests green". Three driven proofs in a real browser on `/realtime` against the
emulator:

1. **Transient.** With the board mounted, stop the Firestore emulator. The status goes to
   connecting/offline and the console shows a backing-off reopen. Restart the emulator and
   the board returns to live rows **without** touching the page or navigating.
2. **Permanent.** Remove the `assets` carve-out from `firestore.rules` and reload. The board
   shows the permission-denied message once and makes no further attempts — count the
   subscribe lines in the console and see exactly one.
3. **Lifetime.** Navigate away while a reopen is scheduled, and confirm no subscribe line
   appears afterwards.

Then `pnpm verify` and `pnpm indexes:check` after driving. Prove each new unit test is
load-bearing by reverting the behaviour and watching it fail.

The fork shipped this same shape of change proven by six load-bearing unit tests, and its
browser matrix — open when this was first written — has since been driven and closed. So
the bar to match is a driven one. The browser drive is the gate here, because a unit suite
cannot see any of the three proofs above.

## Files

- `lib/firebase/use-firestore-query.ts`
- `lib/firebase/use-firestore-query.test.tsx`
- `app/(app)/(examples)/realtime/_components/realtime-board.tsx`
- `docs/reference/contracts/realtime.md`

## Sequencing

Nothing imports `use-firestore-query.ts` besides the realtime example, and no change in the
fork is required. Land it after any slice that edits the realtime contract doc, to avoid two
edits to the same section.
