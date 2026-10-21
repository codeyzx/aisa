/**
 * The structural slice of a Zod issue needed to return form errors. Keeping this
 * dependency-free lets every feature share the classification without pulling
 * Zod into shared data plumbing.
 */
export interface FormValidationIssue {
  message: string
  path: readonly PropertyKey[]
}

export interface FormValidationErrors<Field extends string> {
  form: string | undefined
  fields: Partial<Record<Field, string>>
}

/**
 * Separate field issues from form-level issues. A Zod path without a string
 * first segment cannot name a form field, so it stays visible at form level.
 */
export function classifyFormValidationIssues<Field extends string>(
  issues: readonly FormValidationIssue[],
): FormValidationErrors<Field> {
  const fields: Partial<Record<Field, string>> = {}
  let form: string | undefined

  for (const issue of issues) {
    const path = issue.path[0]
    if (typeof path !== 'string') {
      form ??= issue.message
      continue
    }

    const field = path as Field
    fields[field] ??= issue.message
  }

  return { form, fields }
}

/**
 * The structural slice of a `safeParse` result this module can read. Spelled
 * out rather than imported from Zod for the reason at the top of this file:
 * shared data plumbing must not pull Zod in. A real `z.safeParse(...)` result
 * satisfies this shape as-is, so call sites pass one straight through.
 */
export type FormValidationResult =
  | { success: true }
  | { success: false; error: { issues: readonly FormValidationIssue[] } }

/**
 * Turn a schema parse result into the value TanStack's `onServerValidate`
 * expects: `undefined` when it passed, classified errors when it did not.
 *
 * This is the whole body every entity's server validator repeated verbatim —
 * parse, return nothing on success, classify the issues on failure. The SCHEMA
 * and the field projection stay at the call site, so what is validated remains
 * the feature's business and only the success/failure protocol is shared.
 */
export function toFormErrors<Field extends string>(
  result: FormValidationResult,
): FormValidationErrors<Field> | undefined {
  if (result.success) return undefined
  return classifyFormValidationIssues<Field>(result.error.issues)
}

/**
 * The reading half of the same protocol: pick the FORM-level message to show out
 * of what the client form ended up holding.
 *
 * `toFormErrors` above produces `{ form, fields }` on the server. Once that has
 * been merged back into the client form, the form-wide half arrives as an entry
 * in a loosely-typed array beside entries that are not messages at all — so a
 * form has to choose, and choosing wrong is silent.
 *
 * Two reasons this is owned here instead of re-derived per form. The array is
 * declared `never[]` by form-core's inference while demonstrably holding values
 * at runtime, so a call site that trusts the type writes `String(errors[0])` and
 * ships a literal "undefined" alert next to the real error — that shipped once,
 * and `e2e/unhydrated.spec.ts` asserts against it. And taking `readonly unknown[]`
 * means `never[]` satisfies it directly, so no form needs the widening cast that
 * made the unsound narrowing look deliberate.
 *
 * Only strings are picked, because only strings have been observed here. The
 * FIELD level has a second shape to handle (`components/ui/field.tsx` normalizes
 * `{ message }` too); if one ever reaches form level, it gets taught here, once.
 */
export function formErrorText(errors: readonly unknown[]): string | undefined {
  return errors.find(
    (error): error is string => typeof error === 'string' && error.length > 0,
  )
}
