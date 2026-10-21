import 'server-only'

import { isAiEnabled } from '@/lib/ai/config'
import type { Capability } from './rbac'

/**
 * Capabilities switched OFF by DEPLOYMENT CONFIG — a different question from
 * "does this role grant it", which `rbac.ts` already owns.
 *
 * The two compose and must stay separate. A role check answers "may this person
 * do it"; this answers "does this deployment ship it at all". Collapsing them
 * into `can()` is not possible anyway — `rbac.ts` is client-reachable so a nav
 * can call it, while a config toggle is server-only — but it would also be wrong:
 * an admin who is denied AI because the deployment has it turned off has not been
 * denied by permission, and only one of those two facts is fixable by a role
 * change.
 *
 * Deletion-first: this is the same one-line-per-capability shape as
 * `lib/env/registry.ts`. `trash lib/ai/` removes the capability; the line here
 * goes with it, exactly like the registry entry.
 */
export function unavailableCapabilities(): readonly Capability[] {
  return isAiEnabled() ? [] : ['ai:invoke']
}

/**
 * Whether `capability` is unavailable in THIS deployment regardless of role.
 * Read by the server-side gates (`requireCapability`, `runAction`) and by the
 * shell's nav filter, so a turned-off capability is refused at the boundary AND
 * never advertised in the UI.
 */
export function isCapabilityUnavailable(capability: Capability): boolean {
  return unavailableCapabilities().includes(capability)
}
