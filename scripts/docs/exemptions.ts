/**
 * Tracked, phase-owned exemptions — the ONLY sanctioned way a real-tree gap
 * passes `docs:check`. Each entry is specific (one `check` + one stable `target`)
 * and names the phase that must delete it; there are no broad or wildcard ignores.
 *
 * The list is EMPTY, and that is the intended steady state: an exemption is a
 * debt, not a setting. `evaluate()` reports an entry matching no violation as an
 * unused exemption, so a stale entry is noise rather than cover — delete the
 * entry in the same change that fixes the doc it excused.
 */

/** A single, specific, phase-owned exemption. */
export interface Exemption {
  /** The check whose violation this excuses (matches a registry key). */
  check: string
  /** The exact violation target this excuses (must equal `Violation.target`). */
  target: string
  /** Who owns resolving the underlying gap. */
  owner: string
  /** The phase in which this exemption MUST be removed. */
  removePhase: string
  /** Why the gap is tolerated for now. */
  reason: string
}

export const exemptions: Exemption[] = []
