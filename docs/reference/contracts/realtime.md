# Realtime contract

- Type: Reference — normative contract
- Owns: client-side live reads — the `onSnapshot` bridge, the `firestore.rules` carve-out a browser read depends on, listener lifetime, and the realtime removal checklist
- Source of truth: `lib/firebase/use-firestore-query.ts`, `app/(app)/(examples)/realtime/`, the `assets` carve-out in `firestore.rules`
- Verified by: `pnpm test:integration` (it runs `firestore.rules.test.ts` against the emulator, then `pnpm indexes:check`) plus driving `/realtime` in a browser — sign in, watch a row change, sign out and confirm the stream dies
- Read when: adding or removing a browser listener, changing `firestore.rules`, or deleting the realtime capability
- Does not define: server-side reads and the `schema → repo → action` path ([data contract](data.md)), who holds a capability or how a session is revoked ([auth contract](auth.md)), or why the default is RSC rather than listeners ([realtime model](../../explanation/realtime-model.md))

The contract for the ONE route in this boilerplate that reads Firestore from the
browser (`/realtime`). Read this before adding a listener, and read the removal
checklist before deleting the capability — both halves are the point.

**The default is not this.** The repo is RSC-by-default: persisted data is read by
a Server Component and written by a server action, and `revalidate*()`
invalidates. This capability exists for the day a project meets data that
genuinely **pushes** — a queue, a live status board, another operator editing the
row you are looking at. It is not an upgrade.

## The layers

```
firestore.rules              THE security boundary for this path.
  |   Deny-all, with a read-only carve-out on `assets` for a signed-in,
  |   non-revoked session that does not owe a password change.
  |   Asserted both ways in firestore.rules.test.ts.
  v
lib/firebase/use-firestore-query.ts
  |   The generic bridge, NO data-fetching library: a refcounted onSnapshot
  |   per key (N readers, ONE listener) pushed to islands via React's
  |   useSyncExternalStore, gated so it opens only for a signed-in user and
  |   tears down on sign-out. Reusable by any collection.
  v
app/(app)/(examples)/realtime/_components/use-realtime-assets.ts
  |   The THIN consumer: one call supplying the asset query + key + parse.
  v
app/(app)/(examples)/realtime/     The example: page + islands.
```

`firestore.rules` holds a second carve-out, on `authSessions/{uid}`. It is **not
part of this capability** — it is the session-revocation marker, it grants no
application data, and it stays when realtime goes. It belongs to the
[auth contract](auth.md).

## The rule that makes this different from every other read

Every other read in this repo goes through the Admin SDK, which **bypasses**
`firestore.rules`. A listener is the **Web** SDK and is **subject** to them. Two
consequences that nothing will remind you of:

- A new collection needs its own carve-out, or the listener gets
  `PERMISSION_DENIED` on first paint. Do not relax the deny-all to "make the
  client work" — carve out ONE collection, read-only, and test both halves.
- `requireCapability()` in the page is **UX only** on this path. The Server
  Component is not in the listener's request path, so the rule is the boundary.

A carve-out MUST reassert the two token conditions the `assets` rule already
asserts, or a browser listener outlives the server's own gates:

- **not revoked** — the marker arithmetic (`auth_time >= revokedAfterEpoch`, an
  absent marker allows) hand-kept from `lib/auth/revocation.contract.ts`, because
  rules cannot import TypeScript.
- **password ready** — an account still owing a mandatory password change may do
  nothing but replace it, so `mustChangePassword != true` gates the read.

Both are properties of the token itself, and both are asserted in
`firestore.rules.test.ts`.

### The carve-out's drift condition

`assets` is readable by any signed-in user rather than by a role list. That is
not a weakening: every role in `ROLE_CAPABILITIES` holds `asset:read` today
(`admin: [...CAPABILITIES]`, `user: ['asset:read', 'storage:read']`), so "any
signed-in user" and "everyone holding `asset:read`" are the same set. A role list
inside `.rules` would be a hand-kept copy of `ROLE_CAPABILITIES` that nothing
type-checks.

**The day a role is added that does NOT hold `asset:read`, the rule becomes
wrong and nothing will say so.** There is no test that can catch it — the fact it
depends on lives in TypeScript. Revisit the rule in that same change.

## Auth is not optional plumbing here

Two failures, both invisible to typecheck, lint and build, both found by driving:

- **The Firestore Web SDK only sends a token if the Auth component was ever
  initialized.** `firebaseDb()` does not touch it. A page that never calls
  `firebaseAuth()` opens the stream anonymously and is denied — with a fully
  signed-in user in IndexedDB the whole time. `useAuthUid` (inside
  `lib/firebase/use-firestore-query.ts`) calls `firebaseAuth()` for this reason,
  so every consumer of the bridge gets it for free; it is load-bearing, not
  defensive.
- **Auth restores from IndexedDB asynchronously.** Subscribing on first paint can
  beat the restore. The hook waits for the first `onAuthStateChanged` and
  subscribes only for a resolved uid.

**A listener is not bounded by the session cookie.** Signing out must kill it, or
a signed-out tab keeps receiving documents indefinitely. The hook gets this from
the same auth gate — sign-out fires the listener with `null`, `enabled` goes
false, and `useSyncExternalStore` runs the store's teardown — and it depends on
`components/shell/topbar.tsx` actually calling `signOut(firebaseAuth())`.

## No provider, no dependency

There is no `QueryProvider`, no `app/providers.tsx`, and no root seam — the store
is plain module state in `lib/firebase/use-firestore-query.ts`, shared because
every reader imports the same module. Two things follow, and both are the point:

- **Footprint.** The only client dependency this route adds over any other is the
  Firestore Web SDK, on `/realtime` alone. No data-fetching library rides along.
- **Deletability.** `trash "app/(app)/(examples)/realtime"` removes the page and its
  islands in one command. The generic bridge in `lib/firebase/` is reusable infra
  that stays behind (nothing else imports it — keep it or trash it, your call),
  exactly as a real project keeps the library and deletes the demo.

**Why raw `useSyncExternalStore` and not the repo's zustand stores** (`/state`,
bulk selection): zustand models one global value, but the invariant here is a
RESOURCE whose lifetime follows its subscribers — open the listener when the first
island mounts, close it when the last unmounts. That is exactly what a `subscribe`
function's returned cleanup is, refcounted in the store. zustand would need a
separate effect to manage that lifecycle; the built-in primitive already is it.

## The stream key

**The key IS the stream's identity.** Two callers subscribing with the same key
but a different query would silently share the first one's stream. This example
avoids that structurally rather than by discipline: key and query live in ONE hook
(`useRealtimeAssets`), so there is only one query and "same key ⇒ same query"
cannot be violated. The key still names every input that changes the query
(collection path + status) so it stays true if a second board is added beside it.

**The authenticated principal is part of that identity, and the bridge adds it.**
A caller's key describes the QUERY; `useFirestoreQuery` prefixes the signed-in
uid to produce the key the module-level `streams` Map is actually keyed by. That
Map survives a sign-out, so a principal-free key named the same slot for everyone
who ever signed into the tab, and isolation rested on the refcount teardown
reaching zero before the next principal subscribed — TIMING, not identity. It
does not always hold: a terminal stream error deliberately leaves its entry in
place until the last reader unmounts, so a later reader can find it. Prefixing
the uid makes two principals' slots different entries by construction.

**Honest limit: this is the FIREBASE AUTH principal, the only one a client can
see.** Impersonation is a server-side signed-cookie overlay resolved inside
`getSession()`; it is `server-only` and never changes the client's Auth user. So
starting or stopping an impersonation does NOT re-key a live stream, and the
listener continues reading with the administrator's own Firebase token
throughout. That is currently harmless because the `assets` rule is "any
signed-in user" and every role holds `asset:read` — but a fork that scopes a
realtime collection by owner uid must not assume this hook re-keys on the
impersonated identity, because it cannot.

The generic bridge takes the key as an OPAQUE string — it never interprets it
beyond that uid prefix. The asset-specific key is built in the consumer
(`useRealtimeAssets`), NOT in a central registry, so it deletes with the example. The repo's own precedent:
`ASSET_STATUS_LABEL` sits beside its enum, its comment rejecting a registry by
name as "the parallel taxonomy that goes stale" — a key registry in `lib/` would
be exactly that, and would strand asset knowledge in shared infra.

## Rules that are not obvious

- **Never port `zodConverter` to the Web SDK.** `lib/data/converter.ts` is typed
  against `firebase-admin/firestore`, so `.withConverter()` will not typecheck on
  a Web SDK ref. Parse with the schema: `AssetSchema.parse({ id: doc.id,
...doc.data() })` is literally what `zodConverter.fromFirestore` does.
  `lib/data/timestamp.ts` is already duck-typed for both SDKs on purpose.
- **Never hard-code a collection path on the client.** Pass the dependency-free,
  feature-owned path down from the Server Component — `/realtime` hands
  `ASSETS_COLLECTION` (`features/asset/asset.path.ts`) to its islands as a prop.
  The Admin-SDK accessor in `lib/firebase/collections.ts` remains `server-only`;
  the client must not create a second path literal.
- **`.where(A,'==') + .orderBy(B)` needs a composite index and nothing catches a
  missing one.** `pnpm indexes:check` only knows queries that actually RAN,
  so drive the page first or the report is honest about nothing.

## Removal checklist

The whole claim of "optional" is that this is one command and no hand-edit:

```bash
trash "app/(app)/(examples)/realtime"
trash .next                 # NOT optional — see below
pnpm typecheck && pnpm build:ci   # green
```

Then, deliberately, revert the security surface this example bought:

- **Revert the `assets` carve-out in `firestore.rules`** to deny-all, and drop
  the assets block from `firestore.rules.test.ts`. The carve-out exists ONLY for
  the listener; leaving it behind is a widened security boundary with no
  consumer. **Leave the `authSessions/{uid}` carve-out and the `notRevoked()` /
  `passwordReady()` helpers alone** — they serve the revocation marker, which is
  not part of this capability.
- Remove the realtime entry from `app/navigation.ts`.
- **`lib/firebase/use-firestore-query.ts` is domain-agnostic and stays green with
  the example gone.** It is reusable infra, not part of the example — `trash` it
  too only if you are sure no future client-side live read will want it.

**Why `trash .next` is in the list:** Next 16 generates
`.next/types/validator.ts` naming every route. Delete a route and a stale
validator still references `app/(app)/(examples)/realtime/page.js`, so `pnpm typecheck`
fails with `TS2307: Cannot find module`. That is a stale build artifact, **not a
dangling seam** — clear `.next` and the acceptance test passes.
