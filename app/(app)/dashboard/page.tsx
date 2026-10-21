import { type Metadata } from 'next'

import { AISA_READ, AISA_RESPOND } from '@/features/aisa/aisa.capability'
import {
  countProposalsSince,
  getLatestDigest,
  getLatestInsightDigest,
  getRules,
  getRuntime,
  listDailyStats,
  listHistory,
  listReviewedProposals,
  listUnrespondedProposals,
} from '@/features/aisa/aisa.repo'
import { requireCapability } from '@/lib/auth/guards'
import { can } from '@/lib/auth/rbac'

import { DashboardOverview } from './_components/dashboard-overview'
import { TREND_DAYS } from './_components/weekly-trend'

export const metadata: Metadata = { title: 'Dashboard' }

/** How many history rows "Aktivitas terakhir" shows. */
const RECENT_ACTIVITY = 5

/** The AISA home: what waits for a decision, what is worth a look, and how it trends. */
export default async function DashboardPage() {
  const session = await requireCapability(AISA_READ)

  const [
    unresponded,
    reviewed,
    digest,
    insightDigest,
    runtime,
    rules,
    stats,
    history,
  ] = await Promise.all([
    listUnrespondedProposals(),
    listReviewedProposals(),
    getLatestDigest(),
    getLatestInsightDigest(),
    getRuntime(),
    getRules(),
    listDailyStats(TREND_DAYS),
    listHistory(RECENT_ACTIVITY),
  ])
  const newSinceDigest = digest
    ? await countProposalsSince(digest.sentAt)
    : null

  return (
    <DashboardOverview
      unresponded={unresponded}
      responded={reviewed.filter((p) => p.responded)}
      digest={digest}
      newSinceDigest={newSinceDigest}
      insightDigest={insightDigest}
      paused={runtime?.paused ?? false}
      thresholds={rules?.thresholds ?? null}
      stats={stats}
      history={history}
      canUpload={can(session, AISA_RESPOND)}
    />
  )
}
