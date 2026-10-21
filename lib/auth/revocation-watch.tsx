'use client'

/**
 * The client half of revocation: watch this account's marker and sign out the
 * moment it invalidates the token this tab is holding.
 *
 * WHY A CLIENT WATCHER IS NEEDED AT ALL. The server boundary already refuses a
 * revoked session on the next request, and Rules already refuse a revoked
 * listener. Neither reaches a tab that is sitting still: the browser holds a
 * valid ID token for up to an hour and an open `/realtime` stream keeps
 * rendering whatever it last received. Without this, "signed out everywhere"
 * means "signed out the next time they click something".
 *
 * It renders nothing and exposes nothing. The marker never becomes a prop, a
 * context value, or a hook return — a UI that could read it would start making
 * decisions with it, and the only decision it authorizes is this one.
 *
 * Closing the shared Firestore streams is NOT done here, and that is
 * deliberate: signing out fires `onAuthStateChanged(null)`, which flips
 * `useFirestoreQuery`'s `enabled` to false and runs its own teardown. Reaching
 * into that module from here would be a second owner of the same lifetime.
 */
import { useEffect, useRef } from 'react'
import { onIdTokenChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

import { firebaseAuth } from '@/lib/firebase/client-auth'
import { firebaseDb } from '@/lib/firebase/client-db'

import {
  AUTH_SESSIONS_COLLECTION,
  isTokenRevoked,
  REVOKED_AFTER_EPOCH_FIELD,
} from './revocation.contract'
import { useSignOut } from './use-sign-out'

export function RevocationWatch() {
  const signOut = useSignOut()
  // The handler identity changes every render; the effect must not. Held in a
  // ref so the subscription is opened once per signed-in user, not per paint.
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut

  useEffect(() => {
    let stopWatching: (() => void) | undefined
    // Guards the async gap below: a fast sign-out can land while
    // `getIdTokenResult()` is still in flight, and without this the stale
    // continuation would open a listener nothing will ever close.
    let current = 0

    // `onIdTokenChanged`, not `onAuthStateChanged`: a token REFRESH is when
    // `auth_time` could change without a sign-in event, and the comparison below
    // is only meaningful against the token actually in hand.
    const stopAuth = onIdTokenChanged(firebaseAuth(), async (user) => {
      const generation = ++current
      stopWatching?.()
      stopWatching = undefined
      if (!user) return

      const { claims } = await user.getIdTokenResult()
      const authTime = Number(claims.auth_time)
      // No usable `auth_time` means there is nothing to compare against.
      // Watching anyway could only produce a sign-out we cannot justify, and the
      // server boundary refuses this token on its own next request regardless.
      if (!Number.isFinite(authTime)) return
      if (generation !== current) return

      stopWatching = onSnapshot(
        doc(firebaseDb(), AUTH_SESSIONS_COLLECTION, user.uid),
        (snapshot) => {
          // Fires on creation AND on every later advance, so a first-ever
          // revocation and a subsequent one are the same code path.
          const epoch = snapshot.get(REVOKED_AFTER_EPOCH_FIELD)
          if (typeof epoch !== 'number') return
          if (isTokenRevoked(authTime, epoch)) void signOutRef.current()
        },
        (error) => {
          // Fails OPEN, and only here. A listener error is not evidence of
          // revocation, and signing a user out on a transient stream fault would
          // be an outage that logs everyone out. Nothing is lost by waiting: the
          // server boundary and Rules both fail CLOSED on the same marker, so a
          // tab that keeps its stale token cannot read or write anything with it.
          console.debug('[revocation] marker watch failed', error)
        },
      )
    })

    return () => {
      current += 1
      stopAuth()
      stopWatching?.()
    }
  }, [])

  return null
}
