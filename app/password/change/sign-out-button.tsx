'use client'

import { LogOut } from 'lucide-react'

import { useSignOut } from '@/lib/auth/use-sign-out'
import { Button } from '@/components/ui/button'

/**
 * The one control on the mandatory password screen that is not the password form
 * itself. It exists so the screen is never a trap: a user who cannot or will not
 * complete the change must always be able to leave cleanly, rather than closing
 * the tab on a live session.
 *
 * Shares `useSignOut` with the topbar, so both halves of signing out — the
 * httpOnly cookie AND the Firebase refresh token — are ended identically here.
 */
export function SignOutButton() {
  const handleSignOut = useSignOut()

  return (
    <Button variant="outline" className="w-full" onClick={handleSignOut}>
      <LogOut />
      Keluar
    </Button>
  )
}
