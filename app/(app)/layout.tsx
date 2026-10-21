/**
 * Gate for the authenticated `(app)` route group. Server Component — verifies the
 * session cookie via the DAL and bounces anonymous visitors to /login before any
 * child page renders, then wraps everything in the app shell.
 */
import { cookies } from 'next/headers'

import { APP_NAV_SECTIONS } from '@/app/navigation'
import { AppShell } from '@/components/shell/app-shell'
import { filterNavByAvailability } from '@/components/shell/nav-config'
import {
  SIDEBAR_COOKIE_NAME,
  sidebarOpenFromCookie,
} from '@/components/ui/sidebar-cookie'
import { unavailableCapabilities } from '@/lib/auth/capability-availability'
import { requireReadySession } from '@/lib/auth/guards'

interface AppLayoutProps {
  children: React.ReactNode
}

export default async function AppLayout({
  children,
}: Readonly<AppLayoutProps>) {
  const session = await requireReadySession()

  // Hide capabilities this deployment has turned off. Done HERE because availability is server-only config, while the
  // shell's role filter is client-reachable — the two filters compose. This is
  // UX; `requireCapability` and `runAction` are the boundaries that refuse.
  const sections = filterNavByAvailability(
    APP_NAV_SECTIONS,
    unavailableCapabilities(),
  )

  // Honour the sidebar's persisted state on the SERVER render. `SidebarProvider`
  // has always written this cookie, but nothing ever read it — so a reader who
  // collapsed the rail got it back expanded on every load, and the write was
  // persistence the startup path ignored. Reading it here (this layout is
  // already dynamic — `requireReadySession` reads the session cookie above, so
  // this costs no extra rendering mode) puts the answer in the first HTML,
  // which a client-side restore could not do without a visible snap.
  const sidebarDefaultOpen = sidebarOpenFromCookie(
    (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value,
  )

  return (
    <AppShell
      session={session}
      sections={sections}
      sidebarDefaultOpen={sidebarDefaultOpen}
    >
      {children}
    </AppShell>
  )
}
