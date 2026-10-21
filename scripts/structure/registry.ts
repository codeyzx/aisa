/**
 * The registered checks, in report order. One import per check module keeps the
 * CLI and the test driving the exact same set — add a check here and both pick
 * it up.
 */
import type { Check } from './types.ts'

import { check as noWildcardBarrel } from './checks/no-wildcard-barrel.ts'
import { check as importDirection } from './checks/import-direction.ts'
import { check as clientServerBoundary } from './checks/client-server-boundary.ts'
import { check as directServerOnly } from './checks/direct-server-only.ts'
import { check as contractPurity } from './checks/contract-purity.ts'
import { check as indexAllowlist } from './checks/index-allowlist.ts'
import { check as reservedFrameworkNames } from './checks/reserved-framework-names.ts'
import { check as publicPathMatch } from './checks/public-path-match.ts'
import { check as routeGuardInventory } from './checks/route-guard-inventory.ts'
import { check as readySessionBoundary } from './checks/ready-session-boundary.ts'
import { check as actionWrapperShape } from './checks/action-wrapper-shape.ts'
import { check as singleOperationEntry } from './checks/single-operation-entry.ts'
import { check as capabilityCompleteness } from './checks/capability-completeness.ts'
import { check as cliSafety } from './checks/cli-safety.ts'
import { check as converterBypass } from './checks/converter-bypass.ts'
import { check as collectionPathConstant } from './checks/collection-path-constant.ts'
import { check as oneSurfacePerUrl } from './checks/one-surface-per-url.ts'

export const CHECKS: Check[] = [
  noWildcardBarrel,
  importDirection,
  clientServerBoundary,
  directServerOnly,
  contractPurity,
  indexAllowlist,
  reservedFrameworkNames,
  oneSurfacePerUrl,
  publicPathMatch,
  routeGuardInventory,
  readySessionBoundary,
  actionWrapperShape,
  singleOperationEntry,
  capabilityCompleteness,
  cliSafety,
  converterBypass,
  collectionPathConstant,
]
