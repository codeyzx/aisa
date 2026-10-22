/**
 * Gate for the authenticated `(app)` route group. Server Component — verifies the
 * session cookie via the DAL and bounces anonymous visitors to /login before any
 * child page renders, then wraps everything in the app shell.
 */
import { cookies } from 'next/headers'

import { APP_NAV_SECTIONS } from '@/app/navigation'
import { AssistantDock } from '@/app/(app)/_components/assistant/assistant-dock'
import { TourController } from '@/app/(app)/_components/tour/tour-controller'
import { AppShell } from '@/components/shell/app-shell'
import { filterNavByAvailability } from '@/components/shell/nav-config'
import { type ShellData } from '@/components/shell/shell-data'
import { nextDigest } from '@/components/shell/shell-routes'
import {
  SIDEBAR_COOKIE_NAME,
  sidebarOpenFromCookie,
} from '@/components/ui/sidebar-cookie'
import { AISA_READ, AISA_RESPOND } from '@/features/aisa/aisa.capability'
import {
  CATEGORY_LABEL,
  HISTORY_ACTION_LABEL,
  historyDetailText,
  labelOf,
  sectorLabel,
} from '@/features/aisa/aisa.labels'
import {
  getLatestDigest,
  listHistory,
  listRecentProposals,
  listUnrespondedProposals,
} from '@/features/aisa/aisa.repo'
import {
  awaitsDecision,
  DELETED_PROPOSAL_NAME,
} from '@/features/aisa/aisa.schema'
import { unavailableCapabilities } from '@/lib/auth/capability-availability'
import { requireReadySession } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'

/** How many audit rows the bell shows. */
const NOTIFICATION_LIMIT = 10

const EMPTY_SHELL_DATA: ShellData = {
  pending: 0,
  proposals: [],
  notifications: [],
  latestDigestAt: null,
}

/**
 * The shell's own facts: the pending badge, the ⌘K proposal index, and the
 * bell's audit rows. The pages read the same repo functions, and `cache` shares
 * them within one request.
 */
async function loadShellData(): Promise<ShellData> {
  const [unresponded, proposals, history, digest] = await Promise.all([
    listUnrespondedProposals(),
    listRecentProposals(),
    listHistory(NOTIFICATION_LIMIT),
    getLatestDigest(),
  ])
  return {
    pending: unresponded.filter(awaitsDecision).length,
    proposals: proposals.map((p) => ({
      id: p.id,
      name: p.name,
      founder: p.founder?.name ?? null,
      sector: p.profile?.sector ? sectorLabel(p.profile.sector) : null,
      categoryLabel: p.effectiveCategory
        ? CATEGORY_LABEL[p.effectiveCategory]
        : null,
    })),
    notifications: history.map((row) => {
      const linkable =
        row.proposalId && row.proposalName !== DELETED_PROPOSAL_NAME
      return {
        id: row.id,
        // A deleted proposal's rows keep a placeholder name; the bell shows
        // just the action, as the Dashboard's Aktivitas terakhir does.
        title:
          row.proposalName && row.proposalName !== DELETED_PROPOSAL_NAME
            ? `${labelOf(HISTORY_ACTION_LABEL, row.action)} · ${row.proposalName}`
            : labelOf(HISTORY_ACTION_LABEL, row.action),
        description: historyDetailText(row.detail),
        at: row.at.toISOString(),
        href: linkable ? `/proposal/${row.proposalId}` : '/riwayat',
      }
    }),
    latestDigestAt: digest ? digest.sentAt.toISOString() : null,
  }
}

interface AppLayoutProps {
  children: React.ReactNode
}

export default async function AppLayout({
  children,
}: Readonly<AppLayoutProps>) {
  const session = await requireReadySession()

  // Hide capabilities this deployment has turned off. Done HERE because
  // availability is server-only config, while the shell's role filter is
  // client-reachable — the two filters compose. This is UX; `requireCapability`
  // and `runAction` are the boundaries that refuse.
  const sections = filterNavByAvailability(
    APP_NAV_SECTIONS,
    unavailableCapabilities(),
  )

  // Read on the SERVER so the first HTML already has the sidebar the reader
  // left; a client-side restore would paint it and then snap it away.
  const sidebarOpen = sidebarOpenFromCookie(
    (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value,
  )

  // The shell shows proposal data, so it asks the same capability the
  // proposal pages guard on.
  const data = can(session, AISA_READ)
    ? await loadShellData()
    : EMPTY_SHELL_DATA

  return (
    <AppShell
      session={session}
      sections={sections}
      data={data}
      sidebarOpen={sidebarOpen}
      initialNext={nextDigest(new Date())}
      // The keys are for React's dev check, which flags a server-created element
      // rendered among the client frame's children as an unkeyed list child.
      // The tour only steers the UI; every action it points at is still
      // guarded by its own capability check.
      dock={[
        <AssistantDock key="assistant" />,
        <TourController
          key="tour"
          uid={session.uid}
          canRespond={can(session, AISA_RESPOND)}
        />,
      ]}
    >
      {children}
    </AppShell>
  )
}
