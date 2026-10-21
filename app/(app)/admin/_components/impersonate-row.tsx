'use client'

/**
 * One row in the impersonation picker, and the ONLY client code on this surface.
 *
 * Each row owns its own `useActionState`, so a refusal (a target that went
 * stale between the list rendering and the click) renders inline on THAT row via
 * `role="alert"` without navigating — the start action returns a form-level
 * message instead of a redirect. Pending is read with `useFormStatus` from a
 * child of this row's own `<form>`, so only the clicked row shows "Memulai…"; a
 * shared spinner would light every row at once.
 *
 * It receives a SAFE DTO (`PickerUser`) — never a raw `UserRecord`. The
 * `eligible`/`reason` fields are DISPLAY ONLY: an ineligible row shows a disabled
 * control and its reason, and the server re-checks eligibility live on click
 * regardless, so this flag can never authorize anything on its own.
 */
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { initialFormState } from '@tanstack/react-form-nextjs'
import { LoaderCircle } from 'lucide-react'

import { startImpersonationFormAction } from '@/lib/actions/impersonation.action'
import type { AccountSummary } from '@/lib/auth/account.contract'
import { Button } from '@/components/ui/button'

/**
 * The shape that crosses to the client: the canonical safe `AccountSummary`
 * (`lib/auth/account.contract.ts` decides what a `UserRecord` may become) plus the
 * picker's own display-only verdict. Extending the shared DTO rather than
 * redeclaring a hand-picked subset is the point — a field that must never travel
 * is excluded ONCE, in the mapper, for every account surface at the same time.
 */
export interface PickerUser extends AccountSummary {
  /** Display-only — the server re-checks live at start; never trusted to authorize. */
  eligible: boolean
  /** Indonesian reason shown on an ineligible row; null when eligible. */
  reason: string | null
}

/**
 * The submit control, split out so `useFormStatus` can read THIS form's pending
 * state — the hook only sees a `<form>` from an ancestor, so it cannot live in
 * the row body beside the `<form>` itself.
 */
function StartButton({ targetLabel }: { targetLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      aria-label={`Impersonate ${targetLabel}`}
    >
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          Memulai…
        </>
      ) : (
        'Impersonate'
      )}
    </Button>
  )
}

export function ImpersonateRow({
  user,
  canImpersonate,
}: {
  user: PickerUser
  /**
   * Whether the ACTOR holds `impersonation:start` — a property of the reader,
   * not the row. Display-only, like `eligible`: the start action re-checks the
   * actor's capability live. False withholds the live start control from every
   * row, so a reader who may browse the roster but not impersonate is never
   * shown an action the server would refuse.
   */
  canImpersonate: boolean
}) {
  const [state, formAction] = useActionState(
    startImpersonationFormAction,
    initialFormState,
  )
  // The refusal message the start action returned (a form-level string), or null.
  // `errorMap.onServer` is exactly what `onServerValidate` handed back; on the
  // initial state it is undefined, so the alert stays absent until a real refusal.
  const error =
    typeof state.errorMap?.onServer === 'string'
      ? state.errorMap.onServer
      : null
  const targetLabel = user.email ?? user.uid

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
      {/* THE ROW WRAPS. It used to be a non-wrapping `flex justify-between` with
          a `shrink-0` action cluster, which at a 320px viewport pushed that
          cluster ~115px past the card — and the card is `overflow-hidden`, so
          the ineligible row's REASON and its Impersonate control were clipped
          with no scroller to reach them (measured: cluster right edge 435px in a
          320px viewport, nearest scroll ancestor `overflow: hidden`). This is
          not tabular data, so it does not get to scroll sideways: it reflows.

          `basis-40` on the identity block is what makes the wrap happen at the
          right moment — it lets identity take a whole line of its own once the
          actions no longer fit beside it, instead of squeezing to a few
          characters and truncating. `gap-x-3 gap-y-2` because a wrapped row needs
          vertical rhythm the single-line version never did. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          {/* `wrap-anywhere`, NOT `truncate`. A clipped email is lost content
              (WCAG 1.4.10 reflow), and an email is exactly the string a reader
              is here to identify — it has no spaces to break at, so ordinary
              wrapping would not help it either. */}
          <p className="text-sm font-medium wrap-anywhere text-foreground">
            {user.email ?? 'Tanpa email'}
          </p>
          {user.displayName ? (
            <p className="text-xs wrap-anywhere text-muted-foreground">
              {user.displayName}
            </p>
          ) : null}
        </div>

        {user.eligible && canImpersonate ? (
          // `ml-auto` so the control stays right-aligned even on the line it
          // wrapped ONTO: `justify-between` is applied per flex LINE, so a lone
          // item on the second line would otherwise sit at the start and the two
          // row variants would disagree about where the action lives.
          <form action={formAction} className="ml-auto shrink-0">
            {/* The UID rides in FormData, so the start works no-JS. It is
                UNTRUSTED server-side — re-read live and re-refused on click. */}
            <input type="hidden" name="uid" value={user.uid} />
            <StartButton targetLabel={targetLabel} />
          </form>
        ) : (
          // NOT `shrink-0`: the reason is a sentence ("Akun admin tidak dapat
          // di-impersonate"), and holding a sentence at its intrinsic width is
          // what shoved the disabled button out of the card. It wraps, and the
          // button stays `shrink-0` inside so only the PROSE reflows.
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">{user.reason}</span>
            {/* A disabled control, never a live start: a row the server would
                refuse — an ineligible target, or any row when the actor lacks
                `impersonation:start` — must not offer an action. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              className="shrink-0"
              aria-label={`Impersonate ${targetLabel}`}
            >
              Impersonate
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  )
}
