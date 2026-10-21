'use client'

/**
 * The client half of the server-action form bridge — the one piece of the
 * `useActionState` + TanStack wiring that is identical for every form and
 * expensive to get wrong.
 *
 * It renders nothing and it does NOT call `useForm`. Wrapping `useForm` would
 * mean accepting every form option through this hook, which is how a shared
 * helper turns into the mega-helper `docs/explanation/reusability-model.md`
 * refuses — and it would swallow TanStack's generic inference on the way. So
 * `useForm` stays at the call site with its own options and its own types, and
 * this returns the three values that wiring needs and nothing else. A form with
 * an unusual shape uses it unchanged rather than configuring it; a form that
 * wants a different merge policy passes its own `transform` and does not use it
 * at all.
 */
import { useActionState } from 'react'
import {
  initialFormState,
  mergeForm,
  useTransform,
} from '@tanstack/react-form-nextjs'

/** What a form server action hands back — the shape `initialFormState` carries. */
export type ServerFormState = typeof initialFormState

/** A form server action: (previous form state, submitted FormData) -> next state. */
export type ServerFormAction = (
  prevState: unknown,
  formData: FormData,
) => Promise<ServerFormState>

/**
 * What the call site spreads into its own `useForm` and `<form>`.
 *
 * The raw `useActionState` value is deliberately NOT returned, because no caller
 * needs it: a form reads server errors through `form.Subscribe(s => s.errors)`
 * and pending through `s.isSubmitting`, both of which read the form the merge has
 * already landed in. Returning the raw value as well would publish a SECOND read
 * of the same answer that leads the form by one layout effect — the merge runs
 * in `useForm`'s effect, so for one render the two do not yet agree. Not a
 * disagreement anyone has hit; simply a second source of truth bought for a need
 * that has not appeared. Add it back the day a caller has one.
 */
export interface ServerFormBridge {
  /**
   * Pass to `<form action=…>`. This is what lets a submit work BEFORE the bundle
   * has hydrated — a slow chunk, a failed chunk, a click in a page's first
   * moments. The floor is hydration, not JavaScript: the app requires scripting
   * to sign in at all, so "works with JS off" is not the property being bought.
   */
  formAction: (formData: FormData) => void
  /** Pass as `useForm({ transform })` — merges a server rejection back in. */
  transform: ReturnType<typeof useTransform>
}

/**
 * Bind a form server action and merge its validation answer back into the client
 * form.
 *
 * MERGE ONLY ONCE THE SERVER HAS ACTUALLY ANSWERED. `state.values` is defined
 * only when the action returns a `ServerValidateError`'s formState, which is
 * exactly when there is something to merge. Success never lands here; it
 * redirects.
 *
 * Merging the UNANSWERED state would be wrong on its face: `initialFormState` is
 * `{ errorMap: { onServer: undefined }, values: undefined, errors: [] }` — it HAS
 * a `values` key holding undefined — and `mergeForm` copies on key PRESENCE
 * (`if (!Object.hasOwn(source, key)) continue`), not on definedness, so it would
 * write `undefined` over every default. Note `state ?? {}` does not express this:
 * `state` is never nullish, since `useActionState` always hands back the initial
 * state, so that spelling guards the one thing that cannot happen while letting
 * the payload that is the problem straight through.
 *
 * WHAT IS NOT CLAIMED: that this guard is currently load-bearing. Driven on
 * @tanstack/react-form 1.33.2 — deleting it leaves form values untouched across
 * the first render and subsequent re-renders, because `useForm` skips the
 * transform on the first render (`if (!hasRan.current) return`) and `useTransform`
 * is `useCallback` keyed on `[state]`, so the identity cannot change while the
 * state is still the initial one. The guard is kept because it states the correct
 * rule for free, not because a test can currently fail without it. Do not delete
 * it as dead code on a version bump without re-driving that.
 */
export function useServerForm(action: ServerFormAction): ServerFormBridge {
  const [state, formAction] = useActionState(action, initialFormState)

  const transform = useTransform(
    (baseForm) => (state.values ? mergeForm(baseForm, state) : baseForm),
    [state],
  )

  return { formAction, transform }
}
