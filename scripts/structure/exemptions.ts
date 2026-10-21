/**
 * Tracked exemptions for `structure:check`.
 *
 * Each entry silences ONE check on ONE specific file — never a broad glob that
 * would blind a whole check. An exemption is a debt with an owner and a phase
 * that retires it: when `removePhase` lands, the underlying file is migrated and
 * the entry deleted, not renewed. This keeps the harness honest — a green run
 * means "no un-exempted violation", and every exemption is a visible, argued IOU.
 *
 * cli-safety is now complete in both assertions: the raw-shell-remove ban AND the
 * mutating-script safety manifest (an Admin-SDK-reaching script that mutates must
 * import a gate from `scripts/_safety.ts`). The deep assertion is deliberately
 * over-approximate, so a script that mutates only a local Map may be asked to
 * declare a gate it does not need — that case belongs HERE, as a named exemption,
 * never as a loosening of the check.
 *
 * capability-completeness is complete in both directions: used ⊆ declared
 * AND declared ⊆ used are both enforced.
 */

export interface Exemption {
  /** Check id this exemption applies to. */
  check: string
  /** Repo-relative posix file path the check flags (matches Violation.file). */
  target: string
  /** Who owns retiring it. */
  owner: string
  /** The phase whose landing removes this exemption. `never` = sanctioned forever. */
  removePhase: string
  /** Why the current-tree violation is acceptable until then. */
  reason: string
}

export const EXEMPTIONS: Exemption[] = [
  {
    check: 'ready-session-boundary',
    target: 'app/login/page.tsx',
    owner: 'auth/session',
    removePhase: 'never',
    reason:
      'The public login page. It reads the session only to send an ALREADY signed-in ' +
      'visitor away, so it must not be gated by anything — a ready-session guard here ' +
      'would redirect the very users the page exists to serve. It renders no protected ' +
      'data and performs no mutation.',
  },
]
