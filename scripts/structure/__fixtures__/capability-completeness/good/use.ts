// GOOD: only uses a declared capability.
import { requireCapability } from './req.ts'

export const guarded = requireCapability('example:read')
