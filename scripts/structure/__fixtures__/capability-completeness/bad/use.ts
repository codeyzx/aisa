// BAD: uses a capability that rbac's CAPABILITIES does not declare.
import { requireCapability } from './req.ts'

export const guarded = requireCapability('bogus:cap')
