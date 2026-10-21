// BAD: reaches past the ready gate to the raw DAL. A session owing a mandatory
// password change resolves here exactly like any other and sees the page.
import { requireSession } from '@/lib/auth/session'

export default async function ReportsPage() {
  const session = await requireSession()
  return <main>{session.uid}</main>
}
