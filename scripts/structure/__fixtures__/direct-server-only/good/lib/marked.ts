// GOOD: value-imports next/headers AND marks itself server-only directly.
import 'server-only'

import { cookies } from 'next/headers'

export async function currentToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get('x')?.value
}
