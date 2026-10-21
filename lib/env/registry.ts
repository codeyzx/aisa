import 'server-only'

import { getAiConfig, isAiEnabled } from '../ai/config'
import { getImpersonationConfig } from '../auth/impersonation.config'
import { getStorageConfig } from '../storage/config'
import {
  getFirebaseAdminConfig,
  getFirebaseProjectId,
  isEmulatorTarget,
} from './server'

/**
 * THE CAPABILITY MANIFEST — the single list boot validation iterates, and the one
 * place that says which shipped capability requires which config.
 *
 * Deliberately THIN. Each entry only points at config the capability itself owns
 * (`lib/storage/config.ts`, `lib/ai/config.ts`, `lib/auth/impersonation.config.ts`),
 * so deleting a capability is `trash lib/<capability>/` plus removing ONE line
 * here. Nothing about the capability's schema lives in this file, which is what
 * keeps a deleted capability from leaving an orphan behind.
 *
 * `enabled` is what makes the manifest honest about an OFF capability: AI ships in
 * the tree but is disabled unless `AI_ENABLED` says otherwise, and a disabled
 * capability must NOT have its credentials validated — otherwise "off" would
 * still demand an API key. A capability with no toggle is always enabled.
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
  // to, so this differs in KIND from the capabilities below.
  { name: 'Firebase project', validate: getFirebaseProjectId },
  // The service-account certificate, which ONLY a real project needs — an
  // emulator target authenticates with nothing. This is not the AI-style "ship
  // it turned off": the capability is always on, but the credential it requires
  // genuinely differs by target, and demanding a production key to boot against
  // a local emulator would be config theatre.
  {
    name: 'Firebase Admin credential',
    enabled: () => !isEmulatorTarget(),
    validate: getFirebaseAdminConfig,
  },
  { name: 'S3 storage', validate: getStorageConfig },
  { name: 'AI', enabled: isAiEnabled, validate: getAiConfig },
  { name: 'impersonation', validate: getImpersonationConfig },
]

/**
 * Validate every ENABLED capability, collecting failures instead of stopping at
 * the first. Each entry is read in its own try/catch precisely so a missing
 * Firebase Admin credential does not mask a missing S3 or impersonation secret —
 * a fresh clone must see everything it has to fix in ONE boot, not one per run.
 *
 * A capability whose `enabled()` itself throws (a malformed toggle like
 * `AI_ENABLED=yes`) is reported too: an unreadable toggle is a misconfiguration,
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
