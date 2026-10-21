import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/lib/auth/session'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { ChangePasswordForm } from './change-password-form'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = {
  title: 'Ganti kata sandi',
}

/**
 * The mandatory password-change screen — where `requireReadySession` sends a
 * session carrying `mustChangePassword`.
 *
 * It is the ONE protected page that must use `requireSession` rather than
 * `requireReadySession`, and the reason is structural: the ready guard redirects
 * HERE, so guarding this page with it would bounce the user into an infinite
 * loop. That exemption is recorded in `structure:check`'s
 * `ready-session-boundary`, not left to be rediscovered.
 *
 * It sits OUTSIDE `app/(app)` deliberately. The app shell renders navigation
 * into surfaces this session may not use, and offering links the guard will only
 * refuse is a UI that lies about what is available.
 *
 * A session that does NOT owe a password change is sent away, so the screen
 * cannot be reached as a dead end by typing the URL.
 */
export default async function PasswordChangePage() {
  const session = await requireSession()
  if (!session.mustChangePassword) redirect('/dashboard')

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ganti kata sandi</CardTitle>
          <CardDescription>
            Akun <span className="font-medium">{session.email}</span> masih
            memakai kata sandi sementara. Anda perlu menggantinya dengan kata
            sandi permanen sebelum dapat memakai aplikasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* The form re-authenticates BY EMAIL (see its header), so an account
              with no email address on the record cannot use this flow at all.
              Saying so is the only honest option: rendering the form would show
              a control that fails on submit with a Firebase error nobody can
              act on. It is not a reachable state today — every account in this
              starter is created email/password — and it is handled anyway
              because the alternative is a screen that traps its user. */}
          {session.email ? (
            <ChangePasswordForm email={session.email} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Akun ini tidak memiliki alamat email, sehingga kata sandi tidak
                dapat diganti sendiri. Hubungi administrator.
              </p>
              <SignOutButton />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
