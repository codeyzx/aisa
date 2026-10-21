'use client'

// BAD: a client entry value-imports a `server-only` module directly — it would
// pull that module into the browser bundle.
import { secret } from './server-mod.ts'

export const shown = secret
