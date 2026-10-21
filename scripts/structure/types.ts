/**
 * Shared vocabulary for the `structure:check` harness.
 *
 * A `Violation` names the offending FILE and the CONTRACT it broke in STABLE
 * terms — never a source line number as the identifier, because a line number
 * churns on every unrelated edit and cannot be matched by an exemption. The
 * `target` an exemption matches is the violation's `file` (repo-relative, posix).
 */
import type { StructureProgram } from './program.ts'

export interface Violation {
  /** Repo-relative, posix path of the offending file. The exemption key. */
  file: string
  /** The check id whose contract was broken (stable across edits). */
  contract: string
  /** Human-readable specifics — safe to change without breaking exemptions. */
  detail: string
}

export interface Check {
  /** Stable id; matches a directory under `__fixtures__/` and an exemption key. */
  id: string
  /** One line: what property this check holds, and where the deep form is owned. */
  describe: string
  /** Pure over the program — returns every violation it can see, unfiltered. */
  run(program: StructureProgram): Violation[]
}
