import * as z from 'zod'

/**
 * The shared parse-or-throw used by every config function.
 *
 * There is NO bypass flag. A previous `SKIP_ENV_VALIDATION` let `validate` hand
 * back unparsed input, which meant the type said `string` while the value could
 * be `undefined` — the check that exists to prevent a bad boot could itself be
 * turned off, and a build that passed with no env had proven nothing. Builds now
 * pass explicit non-secret dummy public values instead, so the validator always
 * runs and always means what it says.
 */

/** A required, non-empty variable, with the variable's own name in the message. */
export function requiredVar(name: string) {
  return z
    .string({ error: `${name} is required (set it in .env)` })
    .min(1, `${name} must not be empty`)
}

/**
 * Parse `input` or throw an aggregated, actionable error naming every missing or
 * invalid variable in the group at once — never just the first.
 */
export function validate<T>(
  Schema: z.ZodType<T>,
  input: unknown,
  label: string,
): T {
  const result = Schema.safeParse(input)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.message}`)
      .join('\n')
    // "Copy .env.example to .env" alone was ACTIVELY WRONG for the variable that
    // triggers this most: `.env.example` ships the Firebase credentials EMPTY on
    // purpose, so there is nothing there to copy
    // and the reader who follows the advice literally gets the same refusal
    // again. What the template cannot ship, it cannot ship for anyone — the
    // second line says where those values actually come from. No variable is
    // named here: this message serves every group, and a capability's own name
    // living in the shared validator would survive deleting the capability.
    throw new Error(
      `Invalid ${label} environment:\n${details}\n` +
        'Copy .env.example to .env and fill in the missing values.\n' +
        'What it ships EMPTY it cannot ship for you: generate the secrets ' +
        '(`pnpm setup:local`, or `openssl rand -base64 32`); Firebase ' +
        'credentials come from your Firebase project.',
    )
  }
  return result.data
}

/**
 * Memoize a config loader so its schema parses once per process rather than once
 * per read. Config functions are called on hot paths (the Admin credential is
 * read on every authenticated request), so the parse must not repeat.
 *
 * A THROWN load is not cached: a boot probe and a later request must both see the
 * same failure, and caching a rejection would report a stale reason.
 */
export function once<T>(load: () => T): () => T {
  let cache: T | undefined
  return () => {
    cache ??= load()
    return cache
  }
}
