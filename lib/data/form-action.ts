import { redirect, RedirectType } from 'next/navigation'
import { ServerValidateError } from '@tanstack/react-form-nextjs'

import { authorizeSession, pathForDenial } from '@/lib/auth/guards'
import { type Capability } from '@/lib/auth/rbac'
import { type Session } from '@/lib/auth/session'

/**
 * Run a FORM server action — the form counterpart to `runAction`. Owns the
 * boilerplate every `<verb><Entity>FormAction` repeats:
 *
 *   1. auth-gate with REDIRECTS (a form bounces anonymous users to /login,
 *      unauthorized ones to /403, and a user owing a mandatory password change
 *      to the password screen — it does not return an envelope like `runAction`),
 *   2. validate the FormData (via TanStack `createServerValidate`),
 *   3. run the mutation, then
 *   4. `redirect` on success — with `RedirectType.replace`, so the submitted
 *      form's URL is REPLACED in history rather than pushed over. A reader who
 *      saves and then presses Back returns to wherever they came from, never onto
 *      the form they just submitted — nobody wants Back to reopen a done form.
 *
 * A `ServerValidateError` is caught and its form state returned, so field / form
 * errors merge back to the client; any other error rethrows to the error
 * boundary. Call it INSIDE the exported action (like `runAction`), never as a
 * `export const x = runFormAction(...)` — Next only detects a `'use server'`
 * export that is syntactically an async function.
 *
 * Config is an object because it takes >= 3 inputs. `validate`
 * is the function returned by `createServerValidate(...)`; `run` does the write
 * + audit + revalidate.
 *
 * Boundary rule (server action vs route handler): docs/reference/contracts/http-api.md
 */
export async function runFormAction<TValues>(config: {
  capability: Capability
  formData: FormData
  validate: (formData: FormData) => Promise<TValues>
  redirectTo: string
  run: (session: Session, values: TValues) => Promise<void>
}) {
  // Same gate as every other boundary, answered the way a FORM must answer:
  // with a redirect. `pathForDenial` is shared with `requireCapability` so a
  // form and the page hosting it can never disagree about where a refusal goes.
  const auth = await authorizeSession(config.capability)
  if (!auth.ok) redirect(pathForDenial(auth.denial))

  try {
    const values = await config.validate(config.formData)
    await config.run(auth.session, values)
  } catch (error) {
    if (error instanceof ServerValidateError) return error.formState
    throw error
  }

  redirect(config.redirectTo, RedirectType.replace)
}
