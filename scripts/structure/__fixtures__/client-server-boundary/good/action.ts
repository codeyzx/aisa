'use server'

// A server action re-exports server work behind an RPC boundary. A client that
// imports it gets a stub, so its deps below never reach the client bundle.
import { secret } from './server-secret.ts'

export async function doWork(): Promise<string> {
  return secret
}
