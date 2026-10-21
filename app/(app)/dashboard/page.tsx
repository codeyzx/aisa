import { redirect } from 'next/navigation'

import { requireReadySession } from '@/lib/auth/guards'

/**
 * The starter's landing route, kept so old links and the post-login default
 * still land somewhere: it forwards to Hari ini, the AISA home. The guard runs
 * first so an unready session goes where it must instead of bouncing twice.
 */
export default async function DashboardPage() {
  await requireReadySession()
  redirect('/hari-ini')
}
