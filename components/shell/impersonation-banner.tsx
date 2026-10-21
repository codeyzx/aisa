import { UserRoundCheck } from 'lucide-react'

import { stopImpersonationFormAction } from '@/lib/actions/impersonation.action'
import { type Session } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'

/**
 * The persistent mark on an impersonated session, and the ONLY exit from one.
 *
 * WHY IT IS NOT OPTIONAL: an admin who forgets they are impersonating writes data
 * as someone else, and the audit trail records it faithfully. The topbar shows the
 * TARGET's email, so without this the one surface that could correct the
 * impression is the one reinforcing it. It rides in the shell's sticky header
 * block rather than in page flow so it cannot be scrolled away — the hazard is
 * precisely an admin who stopped looking.
 *
 * WHY IT LIVES IN THE SHELL and not on /admin: while impersonating, the session IS
 * the target and `can(session, 'admin:access')` is false, so /admin answers /403.
 * The shell is the only surface still reachable, which is why the exit lives in
 * `components/shell/**` rather than where impersonation was started.
 *
 * NO `'use client'`: a plain <form> posting a server action needs no JS, which
 * matters more here than anywhere else in the app — the exit from a deliberate
 * auth bypass must not depend on a bundle loading.
 */
interface ImpersonationBannerProps {
  session: Session
}

export function ImpersonationBanner({ session }: ImpersonationBannerProps) {
  // Absent on an ordinary session: the shell renders nothing and keeps its
  // existing layout exactly, so this costs a non-impersonated request nothing.
  if (!session.impersonator) return null

  return (
    // A complementary LANDMARK, not a live region: impersonation is a standing
    // condition of the whole session, not an event that just fired. It arrives on
    // a fresh document (both actions redirect), so there is nothing for a live
    // region to announce — but a labelled landmark is reachable at any time by a
    // screen-reader user who wants to ask "whose session am I in?".
    <aside
      aria-label="Impersonate"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-950 md:px-4 dark:text-amber-100"
    >
      <UserRoundCheck className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        Melihat sebagai{' '}
        <strong className="font-semibold">
          {session.email ?? session.uid}
        </strong>
        . Anda masuk sebagai{' '}
        <strong className="font-semibold">
          {session.impersonator.email ?? session.impersonator.uid}
        </strong>
        {' — '}
        setiap tindakan tercatat atas nama Anda.
      </p>
      {/* Gated on the TICKET, never on a capability: while impersonating the
          session holds the target's capabilities, so an admin-gated exit is a
          locked door from the inside. The action re-checks the same thing
          server-side; this form is only how it is reached. */}
      <form action={stopImpersonationFormAction}>
        <Button type="submit" size="sm" variant="outline">
          Berhenti impersonate
        </Button>
      </form>
    </aside>
  )
}
