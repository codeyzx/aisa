// GOOD: the ready gate answers the same question and one more — is this session
// entitled to do ordinary work at all.
import { requireReadySession } from '@/lib/auth/guards'

export default async function ReportsPage() {
  const session = await requireReadySession()
  return <main>{session.uid}</main>
}
