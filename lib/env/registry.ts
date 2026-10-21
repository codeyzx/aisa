import 'server-only'

import { getAisaApiConfig } from '../aisa-api/config'
import {
  getFirebaseAdminConfig,
  getFirebaseProjectId,
  isEmulatorTarget,
} from './server'

/**
 * THE CAPABILITY MANIFEST — the single list boot validation iterates, and the one
 * place that says which shipped capability requires which config.
 *
 * Deliberately THIN. Each entry only points at config the capability itself owns,
 * so deleting a capability is `trash lib/<capability>/` plus removing ONE line
 * here. Nothing about the capability's schema lives in this file, which is what
 * keeps a deleted capability from leaving an orphan behind.
 *
 * `enabled` is what makes the manifest honest about an OFF capability: a disabled
 * capability must NOT have its credentials validated — otherwise "off" would
 * still demand a secret. A capability with no toggle is always enabled.
 *
 * Adding a capability that reads env WITHOUT registering it here is the failure
 * this list exists to prevent: its config would then be validated on the first
 * request that happened to need it, in production, instead of at boot.
 */
export interface CapabilityConfig {
  /** Human name, used verbatim in the boot failure message. */
  name: string
  /** Whether this capability ships turned on. Omitted = always on. */
  enabled?: () => boolean
  /** Force this capability's config to parse. Throws if it is misconfigured. */
  validate: () => unknown
}

export const CAPABILITY_CONFIGS: CapabilityConfig[] = [
  // Not deletable and has no toggle: without a project there is nothing to talk
  // to.
  { name: 'Firebase project', validate: getFirebaseProjectId },
  // The service-account certificate, which ONLY a real project needs — an
  // emulator target authenticates with nothing. The capability is always on,
  // but the credential it requires
  // genuinely differs by target, and demanding a production key to boot against
  // a local emulator would be config theatre.
  {
    name: 'Firebase Admin credential',
    enabled: () => !isEmulatorTarget(),
    validate: getFirebaseAdminConfig,
  },
  // Every dashboard write goes to the Python aisa-api; without its URL and key
  // the manager could read but every button would fail, so it is required.
  { name: 'aisa-api', validate: getAisaApiConfig },
]

/**
 * Validate every ENABLED capability, collecting failures instead of stopping at
 * the first. Each entry is read in its own try/catch precisely so a missing
 * Firebase Admin credential does not mask another missing secret —
 * a fresh clone must see everything it has to fix in ONE boot, not one per run.
 *
 * A capability whose `enabled()` itself throws (a malformed toggle) is reported too: an unreadable toggle is a misconfiguration,
 * never silently "off".
 */
export function collectConfigFailures(): string[] {
  return CAPABILITY_CONFIGS.flatMap((capability) => {
    try {
      if (capability.enabled && !capability.enabled()) return []
      capability.validate()
      return []
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)]
    }
  })
}
