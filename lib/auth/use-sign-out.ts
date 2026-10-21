'use client'

/**
 * Signing out, as one hook, because it is two operations that must BOTH happen
 * and neither is obvious — dropping either leaves a screen that looks signed
 * out while the account is still reachable.
 */
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'

import { revokeSession } from '@/lib/auth/client'
import { firebaseAuth } from '@/lib/firebase/client-auth'
import { clearUserBrowserData } from '@/lib/user-browser-data'

/**
 * Returns a handler that ends the session and navigates to /login, or reports a
 * failure and stays put.
 *
 * BOTH halves are required. `revokeSession()` clears the httpOnly cookie the
 * server trusts; `signOut()` clears the Firebase refresh token the SDK persists
 * in IndexedDB. Leave the refresh token behind and the account is still
 * reachable without a password: `getIdToken()` mints a fresh ID token from it,
 * and `POST /api/auth/session` trades any valid ID token for a new session
 * cookie — it has no way to know this user just signed out.
 *
 * `allSettled`, so neither half can cancel the other: sequencing them would let
 * a failed cookie DELETE strand the credential, and a failed `signOut()`
 * suppress the DELETE's error. They are independent — DELETE authenticates by
 * cookie, not by Firebase state — so there is no order to preserve.
 */
export function useSignOut(): () => Promise<void> {
  const router = useRouter()

  return async function handleSignOut() {
    const [cookie, credential] = await Promise.allSettled([
      revokeSession(),
      signOut(firebaseAuth()),
    ])

    // Navigate only once BOTH are actually gone. /login over a half-dead session
    // is the failure this exists to prevent: it looks signed out and is not.
    // React drops an onClick handler's rejection, so say it out loud.
    if (cookie.status === 'rejected' || credential.status === 'rejected') {
      toast.error('Gagal keluar — Anda masih masuk. Silakan coba lagi.')
      return
    }

    // Drop the client Router Cache, then leave the now-gated shell.
    // Only after the session is really gone: a failed sign-out stays signed in
    // and must keep the user's data. On a shared computer nothing of theirs
    // (e.g. the Tanya AISA history) should outlive the session.
    clearUserBrowserData()
    router.refresh()
    router.push('/login')
  }
}
