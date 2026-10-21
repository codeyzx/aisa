// GOOD: a framework route entry is server-guaranteed by Next, so it needs no
// explicit mark even though it value-imports next/headers.
import { cookies } from 'next/headers'

export async function GET(): Promise<Response> {
  const jar = await cookies()
  return new Response(jar.get('x')?.value ?? '')
}
