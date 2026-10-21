// GOOD: a contract may import a schema library and type-only anything.
import * as z from 'zod'

import type { Helper } from './helper.ts'

export const Schema = z.object({ id: z.string() })
export type Parsed = z.infer<typeof Schema>
export type Wrapped = Helper<Parsed>
