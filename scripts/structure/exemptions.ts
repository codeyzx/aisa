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
    check: 'action-wrapper-shape',
    target: 'lib/actions/impersonation.action.ts',
    owner: 'auth/impersonation',
    removePhase: 'never',
    reason:
      'stopImpersonationFormAction is the single sanctioned unwrapped action — it ' +
      'cannot hold a capability gate (the impersonated session holds none of the ' +
      "admin's capabilities, so an admin-gated exit is a locked door from inside) " +
      'and is gated by a signed ticket instead. Mirrors the ast-grep `ast-grep-ignore` ' +
      'on the same export in rules/action-export-wraps-run-action.yml.',
  },
  {
    check: 'action-wrapper-shape',
    target: 'lib/actions/password.action.ts',
    owner: 'auth/password-lifecycle',
    removePhase: 'never',
    reason:
      'changeOwnPasswordAction is the self-service password transition, and it is the ' +
      "second export that clears the rule's bar: it IS gated, and the gate CANNOT be a " +
      'capability. runAction takes a Capability and authorizeSession refuses a session ' +
      'carrying mustChangePassword before it looks at one — so every legitimate caller ' +
      'would be refused by construction. Its gate is a verified session PLUS a fresh ' +
      'Firebase ID token proving the current password, matched to that session uid. ' +
      'Mirrors the ast-grep `ast-grep-ignore` on the same export in ' +
      'rules/action-export-wraps-run-action.yml.',
  },
  {
    check: 'ready-session-boundary',
    target: 'lib/actions/password.action.ts',
    owner: 'auth/password-lifecycle',
    removePhase: 'never',
    reason:
      'The password TRANSITION itself — the path the ready boundary exists to send ' +
      'people to. requireReadySession would redirect it back to the screen that calls ' +
      'it (an infinite loop, the same reason app/password/change/page.tsx is exempt), ' +
      'and requireSession redirects where an action must return an envelope. The raw ' +
      'session is not the authorization here: it only establishes that this is a ' +
      'protected entry point rather than a public password RPC. The actual proof is a ' +
      'fresh reauthentication ID token whose uid, mustChangePassword claim and ' +
      'auth_time are all re-checked server-side.',
  },
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
  {
    check: 'ready-session-boundary',
    target: 'app/password/change/page.tsx',
    owner: 'auth/password-lifecycle',
    removePhase: 'never',
    reason:
      'The destination requireReadySession redirects TO. Guarding it with the ready ' +
      'boundary would bounce the user into an infinite loop, so it is the one ' +
      'protected page that must resolve the raw session — and it refuses a session ' +
      'that does NOT owe a password change, so it is not a way around the gate.',
  },
  {
    check: 'ready-session-boundary',
    target: 'lib/actions/impersonation.action.ts',
    owner: 'auth/impersonation',
    removePhase: 'never',
    reason:
      'stopImpersonationFormAction is an EXIT path, in the same class as logout: it ' +
      'removes authority rather than exercising it, so refusing it for a session ' +
      'owing a password change would trap the admin inside an impersonation. The ' +
      'START path is gated normally through runFormAction; its getSession call is a ' +
      'cache()d re-read AFTER that gate has already run.',
  },
]
