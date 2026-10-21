/**
 * The safety manifest for `scripts/`: the two — and only two — gates a script
 * that can mutate a database is allowed to stand behind.
 *
 *   1. `requireProjectIdConfirmation` — plan by default, then type the project id
 *      back on the CONTROLLING TERMINAL before anything is written
 *      (`migration/run.ts`, `snapshot/restore.ts`).
 *   2. `requireEmulatorTarget` — refuse to run at all unless the emulator hosts
 *      are set, so the script provably cannot reach a real database
 *      (`seed-emulator.ts`, `setup-local.ts`, `db-reset.ts`). This list is meant
 *      to be exhaustive: this module IS the manifest, so a gate whose callers are
 *      under-listed here is the one place the count may not drift.
 *
 * Both live HERE, as named exports of one module, because that is what makes the
 * rule machine-checkable: `structure:check`'s `cli-safety` check flags a script
 * that can mutate a database — by reaching the Admin SDK and calling a mutating
 * method, OR by deleting over `fetch` against an emulator admin endpoint —
 * without importing a gate from this file. That second form exists because
 * `db-reset.ts` does exactly it, and under the Admin-SDK-only criterion the
 * repo's most destructive script was the one script the manifest could not see.
 * A hand-rolled `if (!host) process.exit(1)` is invisible to a structure check;
 * an import edge is not.
 *
 * The `_` prefix marks a shared, non-entry module — it is imported, never run,
 * the same way `snapshot/_admin.ts` is.
 *
 * WHY THE CONFIRMATION IS SHARED RATHER THAN COPIED: the failure mode these CLIs exist to
 * prevent is not "wrote too early", it is "wrote to prod thinking it was
 * staging", and only typing the project id back catches that. Two hand-rolled
 * copies of that gate is two chances for one of them to be the weaker one — which
 * is exactly what happened here before: `restore.ts` accepted the confirmation as
 * a FLAG (`--confirm <projectId>`), so any script or CI job could auto-confirm a
 * wipe of a production database. One implementation, one strength.
 *
 * The paired convention every caller must keep: the plan is printed BEFORE this
 * is called, so the operator confirms against what they have just read.
 */
import { closeSync, openSync, readSync } from 'node:fs'

/**
 * The controlling terminal, per platform: `/dev/tty` on POSIX, `\\.\CONIN$` (the
 * console-input device) on Windows. Both name the REAL terminal, which is the
 * whole safety property in `promptOnTty` — not stdin.
 */
const TTY_DEVICE =
  process.platform === 'win32' ? String.raw`\\.\CONIN$` : '/dev/tty'

/** Ask a question on the controlling terminal and read one line back. */
function promptOnTty(question: string): string {
  // The controlling TERMINAL, NOT stdin, and this is a safety property rather
  // than a style choice: stdin is what makes `echo demo-prod | pnpm migrate
  // --apply` silently auto-confirm, and what makes a piped or CI invocation read
  // an EOF as an empty answer that some implementations treat as "default yes".
  // Reading the real terminal means a non-interactive caller cannot answer at
  // all — it gets the explicit bypass flag or it gets nothing. `\r` from a
  // Windows CONIN$ line ending is stripped by the `.trim()` on the way out.
  let fd: number
  try {
    fd = openSync(TTY_DEVICE, 'r')
  } catch {
    console.error(
      '\nRefusing to apply: no terminal to confirm on.\n' +
        'This run is not interactive, so the project-id confirmation cannot be\n' +
        'answered. If this is CI or a script, pass\n' +
        '  --dangerously-bypass-project-name-confirmation\n' +
        'and mean it.',
    )
    process.exit(1)
  }

  process.stdout.write(question)
  const buffer = Buffer.alloc(1)
  let answer = ''
  try {
    while (readSync(fd, buffer, 0, 1, null) === 1) {
      const char = buffer.toString('utf8')
      if (char === '\n') break
      answer += char
    }
  } finally {
    closeSync(fd)
  }
  // A silent EOF returns '' here, which will not equal the project id, so it
  // ABORTS. That is deliberate: an EOF must never read as a hang or as consent.
  return answer.trim()
}

/**
 * Refuse to continue until the operator types `projectId` back on the
 * controlling terminal. Returns only when the write may proceed; otherwise it
 * has already printed why and exited 1.
 */
export function requireProjectIdConfirmation(options: {
  projectId: string
  /**
   * The verb phrase completing "Type the project id to ___ (<projectId>)", e.g.
   * `'write to it'` or `'wipe and restore into it'`. It names what the operator
   * is about to do, at the moment they are asked to authorise it.
   */
  action: string
  /** True when `--dangerously-bypass-project-name-confirmation` was passed. */
  bypassed: boolean
}): void {
  const { projectId, action, bypassed } = options

  if (bypassed) {
    console.log('\n⚠️  Project-id confirmation BYPASSED by flag.')
    return
  }

  const answer = promptOnTty(
    `\nType the project id to ${action} (${projectId}): `,
  )
  if (answer !== projectId) {
    console.error(
      `\nAborted — got "${answer}", expected "${projectId}". Nothing was written.`,
    )
    process.exit(1)
  }
}

/** The env var each emulator surface is fenced by — the Admin SDK's own switch. */
const EMULATOR_HOST_ENV = {
  auth: 'FIREBASE_AUTH_EMULATOR_HOST',
  firestore: 'FIRESTORE_EMULATOR_HOST',
} as const

/**
 * Refuse to run unless EVERY named emulator host is set. Returns only when the
 * process provably cannot reach a real database (the Admin SDK routes to the
 * emulator exactly when these are set); otherwise it has printed why and exited 1.
 *
 * WHY THIS IS EXTRACTED RATHER THAN INLINED: not for reuse — it was extracted
 * when `seed-emulator.ts` was its only caller and the four lines it replaced were
 * already correct. It is extracted so the fence is a CHECKABLE IMPORT EDGE rather
 * than hand-rolled control flow. `cli-safety` demands that a script under
 * `scripts/` which can mutate a database — whether it reaches the Admin SDK and
 * calls a mutating method, or deletes over `fetch` against an emulator admin
 * endpoint — imports a gate from this module. Those scripts are exempt from
 * `--apply`-style confirmation BECAUSE of this fence, and that exemption has to
 * be earned and machine-verified, not merely asserted in a comment a structure
 * check cannot read.
 *
 * It now has three callers, which is what makes the machine check worth its
 * keep: `db-reset.ts` arrived later and is the most destructive script in the
 * repo, and it was covered by the same rule without anyone having to remember.
 */
export function requireEmulatorTarget<
  Surface extends 'auth' | 'firestore',
>(options: {
  need: Surface[]
  /** Completes "Refusing to ___:" — the thing being refused, e.g. `'seed'`. */
  action: string
}): Record<Surface, string> {
  const named = options.need
    .map((surface) => EMULATOR_HOST_ENV[surface])
    .join(' and ')

  const resolved = {} as Record<Surface, string>
  for (const surface of options.need) {
    const host = process.env[EMULATOR_HOST_ENV[surface]]
    if (!host) {
      console.error(
        `Refusing to ${options.action}: ${named}\n` +
          'must be set, so this can only ever touch a local emulator.\n' +
          // Names the command, not the file edit: `.env.example` ships these set
          // rather than commented out, so "uncomment the emulator lines" sent the
          // reader looking for lines that are not there. `pnpm setup:local` is
          // the copy, and the fallback covers a `.env` already pointed at a real
          // project — where the fix is to move it aside, not to edit it.
          'Run `pnpm setup:local` to create a .env pointed at the emulators, or\n' +
          `set ${named} for this command.`,
      )
      process.exit(1)
    }
    resolved[surface] = host
  }
  // Returning the hosts is the point of the return type: the fence has just
  // PROVEN they are set, so the caller should not have to re-read them as
  // `string | undefined` and narrow again what this already guaranteed.
  return resolved
}
