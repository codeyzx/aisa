import { redirect } from 'next/navigation'

import { requireReadySession } from '@/lib/auth/guards'

/**
 * The old AISA home, kept so bookmarks and the post-login default still
 * land somewhere: everything it showed now lives on the Dashboard. The guard
 * runs first so an unready session goes where it must instead of bouncing twice.
 */
export default async function HariIniPage() {
  await requireReadySession()
  redirect('/dashboard')
}
