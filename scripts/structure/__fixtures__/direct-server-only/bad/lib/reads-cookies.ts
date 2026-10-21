// BAD: value-imports next/headers but does not mark itself server-only.
import { cookies } from 'next/headers'

export async function currentToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get('x')?.value
}
