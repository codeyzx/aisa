'use client'

import { onAuthStateChanged } from 'firebase/auth'
import {
  onSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { firebaseAuth } from '@/lib/firebase/client-auth'

/**
 * Subscribe a React tree to a live Firestore query — the domain-agnostic bridge
 * behind /realtime, reusable by ANY collection. Consumers stay a single lean
 * call (see `app/(app)/(examples)/realtime/_components/use-realtime-assets.ts`); the
 * subtle parts live here, once.
 *
 * WHAT IT BUYS, precisely: N components calling this with the SAME `key` share
 * ONE `onSnapshot` listener — billed once, one copy of the truth, delivered to
 * every reader via React's `useSyncExternalStore`. Call `onSnapshot` directly
 * from two components and you get two streams, two costs, and two copies that
 * can disagree mid-flight. The refcount below is what makes "one listener" true;
 * the SUBSCRIBE / RETAIN / RELEASE logs are how you check it rather than trust it.
 *
 * Everything a data-fetching library (TanStack Query, SWR) would add on top is
 * inert against a stream — the stream pushes, so there is no fetch to re-run,
 * nothing is stale, and the Firestore Web SDK already owns its own cache and
 * reconnect. So this is built on `useSyncExternalStore` with NO dependency. See
 * `docs/reference/contracts/realtime.md` for the full argument and the when-to-add-Query
 * line.
 *
 * THE KEY IS THE STREAM'S IDENTITY. Two callers passing the same key with
 * different `createQuery`s silently share the FIRST one's stream. Make the key
 * describe the query completely (collection + filters + order); the realtime
 * example does this by owning key and query in one hook.
 *
 * The AUTHENTICATED PRINCIPAL is part of that identity too, and the hook adds it
 * for you — a caller's key describes the QUERY, `useFirestoreQuery` prefixes the
 * uid so two people signing into the same tab can never share a map entry. See
 * the comment at `streamKey` for why refcount teardown alone was not enough.
 */

export interface FirestoreQueryResult<T> {
  /** The rows, or `undefined` while the stream is still opening / signed out. */
  data: T[] | undefined
  /** Set if the stream could not open (in practice, PERMISSION_DENIED). */
  error: unknown
}

/**
 * ONE frozen object is the pending value everywhere — signed out, restoring, and
 * a freshly-opened entry — so `useSyncExternalStore` always sees a stable
 * reference for "not ready yet" and never loops.
 */
const PENDING: FirestoreQueryResult<never> = Object.freeze({
  data: undefined,
  error: undefined,
})

/**
 * Module-level on purpose: the sharing invariant is only real if it spans
 * component instances, and a ref/state would scope it to one. This is
 * browser-only state — the hook is `'use client'` and the store is only ever
 * touched inside `subscribe`, which React runs after commit, never during SSR.
 */
interface StreamEntry {
  readers: Set<() => void>
  unsubscribe: () => void
  /** Replaced with a NEW reference only when a snapshot or error arrives. */
  snapshot: FirestoreQueryResult<unknown>
}
const streams = new Map<string, StreamEntry>()

function openStream<T>(
  key: string,
  createQuery: () => Query,
  parse: (snapshot: QueryDocumentSnapshot) => T,
): StreamEntry {
  console.debug(`[firestore-query] onSnapshot SUBSCRIBE ${key}`)
  const entry: StreamEntry = {
    readers: new Set(),
    unsubscribe: () => {},
    snapshot: PENDING,
  }
  streams.set(key, entry)

  const publish = (snapshot: FirestoreQueryResult<unknown>) => {
    entry.snapshot = snapshot
    entry.readers.forEach((notify) => notify())
  }

  try {
    entry.unsubscribe = onSnapshot(
      createQuery(),
      (snap) => {
        // A parser throw must become the error STATE, not an uncaught exception
        // that leaves the store stuck pending with the listener still live. A
        // parse failure is a data problem, not a stream one — the listener stays
        // open and the next valid snapshot recovers, unlike a Firestore stream
        // error which is terminal.
        try {
          publish({
            data: snap.docs.map((doc) => parse(doc)),
            error: undefined,
          })
        } catch (error) {
          publish({ data: undefined, error })
        }
      },
      // Firestore terminates the stream on error, so it is dead now. Publish the
      // error for mounted readers; the entry lingers until its last reader
      // unmounts, and a later remount opens a fresh one.
      (error) => publish({ data: undefined, error }),
    )
  } catch (error) {
    // `createQuery()` / `onSnapshot()` threw synchronously (a malformed query,
    // say). Roll the entry back so a later mount opens a fresh stream instead of
    // joining this dead, listener-less one — then fail loud.
    streams.delete(key)
    throw error
  }

  return entry
}

/**
 * The `subscribe` half of `useSyncExternalStore`: open-or-join the one listener
 * for `key`, refcounted so the LAST reader out closes it. Returns the cleanup
 * React runs on unmount (or when the subscription is replaced).
 */
function subscribe<T>(
  key: string,
  createQuery: () => Query,
  parse: (snapshot: QueryDocumentSnapshot) => T,
  notify: () => void,
): () => void {
  const entry = streams.get(key) ?? openStream(key, createQuery, parse)
  entry.readers.add(notify)
  console.debug(
    `[firestore-query] RETAIN ${key} — readers=${entry.readers.size}`,
  )

  return () => {
    entry.readers.delete(notify)
    console.debug(
      `[firestore-query] RELEASE ${key} — readers=${entry.readers.size}`,
    )
    if (entry.readers.size > 0) return
    // Last reader out closes the stream. Without this the listener outlives the
    // page and keeps billing — and, after sign-out, keeps receiving. The
    // identity guard retracts only THIS entry, never a live replacement a
    // remount installed under the same key.
    entry.unsubscribe()
    if (streams.get(key) === entry) streams.delete(key)
    console.debug(`[firestore-query] onSnapshot UNSUBSCRIBE ${key}`)
  }
}

/**
 * Resolves the signed-in uid: `undefined` while auth is still restoring,
 * `string` when signed in, `null` when signed out.
 *
 * Load-bearing twice, and neither shows up in a static read — only driving does:
 *
 *  1. IT IS WHAT MAKES THE LISTENER AUTHENTICATED. The Firestore Web SDK reads
 *     its token from the Auth component of the same FirebaseApp, but only if that
 *     component was ever INITIALIZED. `firebaseDb()` never touches it — so a page
 *     whose only Firestore access is this hook is denied unless SOMETHING calls
 *     `firebaseAuth()`. This hook does, which is why it is safe to build a live
 *     read that never mounts the login form.
 *  2. IT IS THE RACE. Auth restores from IndexedDB asynchronously, so a listener
 *     that subscribes on first paint can beat the restore and get denied. Gating
 *     on the first `onAuthStateChanged` makes "signed in" true before we ask.
 *
 * It also closes the stream on SIGN-OUT for free: signing out fires this with
 * `null`, `enabled` goes false, and `useSyncExternalStore` runs the teardown
 * above. A Firestore listener is not bounded by the session cookie, so without
 * this a signed-out tab keeps receiving documents indefinitely.
 */
function useAuthUid(): string | null | undefined {
  const [uid, setUid] = useState<string | null | undefined>(undefined)

  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth(), (user) => setUid(user?.uid ?? null)),
    [],
  )

  return uid
}

export interface UseFirestoreQueryOptions<T> {
  /** Identifies the shared stream. MUST describe the query completely. */
  key: string
  /** Built lazily so a re-render does not construct a throwaway Query. */
  createQuery: () => Query
  /** Per-document decode. Parse with the entity schema — never a converter. */
  parse: (snapshot: QueryDocumentSnapshot) => T
}

export function useFirestoreQuery<T>({
  key,
  createQuery,
  parse,
}: UseFirestoreQueryOptions<T>): FirestoreQueryResult<T> {
  const uid = useAuthUid()
  // The stream opens only for a signed-in user. `undefined` (auth still
  // restoring) is deliberately NOT enabled — subscribing then is the race that
  // produces PERMISSION_DENIED against a perfectly valid session.
  const enabled = typeof uid === 'string'

  // THE PRINCIPAL IS PART OF THE STREAM'S IDENTITY, and the caller does not have
  // to remember that. `streams` is module-level and survives a sign-out, so a
  // principal-free key like `assets:active` names the same map slot for every
  // person who ever signs into this tab. Isolation then rests entirely on the
  // teardown running to zero readers before the next principal subscribes —
  // which is TIMING, not identity, and it does not always hold: a terminal
  // stream error deliberately LEAVES its entry in place until the last reader
  // unmounts, so a later reader can find it. Folding the uid in makes A's slot
  // and B's slot different entries by construction, so B can never be served
  // A's cached rows.
  //
  // HONEST LIMIT: this is the FIREBASE AUTH principal, which is the only one a
  // client can see. Impersonation is a server-side signed-cookie overlay and
  // never changes the client's Auth user, so starting or stopping it does NOT
  // re-key this stream — see `docs/reference/contracts/realtime.md`.
  const streamKey = enabled ? `${uid}:${key}` : key

  // `createQuery`/`parse` are re-created every render by design, but the key is
  // the stream's identity. Read them from refs so `subscribe`/`getSnapshot`
  // depend on [key, enabled] alone — keying on the callbacks would tear the
  // stream down and rebuild it every render, the opposite of what this buys.
  const createQueryRef = useRef(createQuery)
  const parseRef = useRef(parse)
  createQueryRef.current = createQuery
  parseRef.current = parse

  const subscribeToStream = useCallback(
    (notify: () => void) =>
      // Read the latest query/parse ONCE, here at subscribe time, and hand them
      // in as FIXED values. The shared stream freezes the opener's parser for
      // its whole life, so one subscriber later switching keys can never make
      // another subscriber's still-open stream parse with the wrong function.
      enabled
        ? subscribe(streamKey, createQueryRef.current, parseRef.current, notify)
        : () => {},
    [streamKey, enabled],
  )

  const getSnapshot = useCallback(
    () => (enabled ? (streams.get(streamKey)?.snapshot ?? PENDING) : PENDING),
    [streamKey, enabled],
  )

  // The store is keyed by `key` and typed `unknown` per entry; this call's
  // `parse` is what produced the rows, so narrowing to T here is the contract's
  // boundary, the same trust `apiFetch<T>` documents at its edge.
  return useSyncExternalStore(
    subscribeToStream,
    getSnapshot,
    () => PENDING,
  ) as FirestoreQueryResult<T>
}
