/**
 * The emulator gate: skip loudly with no emulator, FAIL HARD in CI.
 *
 * The reason this is one module rather than a copy per suite: A SKIPPED SUITE IS
 * GREEN. A test that silently does not run reports the thing it was written to
 * check as checked. Locally that is a tolerable trade — a human sees the warning
 * and `pnpm test` has to stay runnable in parallel git worktrees, none of which
 * have an emulator. In CI it is exactly the hole the suite exists to close, so
 * there a missing emulator is a FAILURE.
 *
 * `CI` is the trigger rather than a bespoke REQUIRE_EMULATOR flag because every
 * runner sets `CI` without being asked. A flag can be forgotten by a workflow,
 * and forgetting it reopens the hole while staying green — the same shape as the
 * skip itself. `firestore.rules.test.ts` hand-rolls this same gate; two copies
 * of a fail-closed rule is two places to get it wrong.
 *
 * The host default (127.0.0.1:8080) is the SHARED band. An unsourced `pnpm test`
 * therefore probes whatever sits on the default port — harmless (project ids
 * namespace the data), but a suite that needs its OWN emulator must export
 * FIRESTORE_EMULATOR_HOST to reach it. See docs/reference/contracts/testing.md.
 */
export const EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'

/**
 * Is a Firestore emulator answering at `EMULATOR_HOST`?
 *
 * A plain GET at the emulator root answers 200 without credentials — it is the
 * emulator's own liveness surface, not a data read, so this neither needs
 * `Authorization: Bearer owner` nor trips `firestore.rules` (which is deny-all
 * and would 403 a real read).
 */
export async function emulatorReachable(): Promise<boolean> {
  try {
    const res = await fetch(`http://${EMULATOR_HOST}/`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Resolve the gate for a suite that needs the emulator. Call at module scope and
 * hand the result to `describe.skipIf(!reachable)`.
 *
 * Throws — rather than returning false — when `CI` is set and nothing answers.
 * At module scope that fails the test FILE, which vitest cannot report as green.
 * `label` names the suite in that error, because the CI operator reading it has
 * no other clue which suite went missing.
 */
export async function requireEmulatorOrSkip(label: string): Promise<boolean> {
  const reachable = await emulatorReachable()

  if (!reachable && process.env.CI) {
    throw new Error(
      `No Firestore emulator at ${EMULATOR_HOST}, and skipping is not allowed in CI: ` +
        `a skipped suite is green, which would report ${label} as tested when it ` +
        `never ran. Wrap the test command in \`firebase emulators:exec\`.`,
    )
  }

  if (!reachable) {
    console.warn(
      `${label} SKIPPED: no Firestore emulator at ${EMULATOR_HOST}. ` +
        `Run \`pnpm emulators\` (or a lane's own band) to execute them.`,
    )
  }

  return reachable
}
