// GOOD: gates on a guard before rendering.
import { requireCapability } from '../../../lib/auth/guards.ts'

export default function FooPage() {
  requireCapability('example:read')
  return null
}
