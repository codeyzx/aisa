'use client'

/**
 * The outcomes an account mutation can have on screen, and the one hook every
 * action control on this surface drives them with.
 *
 * ── WHY THIS EXISTS RATHER THAN `ConfirmDialog` ──────────────────────────────
 * `ConfirmDialog` owns open + pending + `ActionResult` and is the right tool for
 * a one-click destructive mutation — but it collapses every `ok: false` into one
 * inline error beside a Confirm button the reader may press again. That is
 * exactly wrong for one code in this family. `reconciliation_required` means the
 * Auth mutation LANDED and a follow-up did not; retrying it is the specific harm
 * the two-step audit protocol exists to prevent, and a dialog that stays open
 * with a live Confirm button is an invitation to do it.
 *
 * So the states are modelled explicitly and the CONTROL reads them:
 *
 *  - `pending`      — in flight. Controls disable; nothing is claimed yet.
 *  - `success`      — the operation completed, including its follow-ups. It is
 *                     announced with `toast.success`, which is this repo's rule
 *                     for success (`components.md`: failure inline, success in a
 *                     toast) and is also what sonner's live region announces to a
 *                     screen reader. The three below stay INLINE, beside the
 *                     control, because a message that can time out before it is
 *                     read is a message the reader never got.
 *  - `failed`       — nothing changed. Safe to fix the input and try again.
 *  - `unavailable`  — the request never landed (a transport rejection
 *                     `settleAction` caught). Kept apart from `failed` because
 *                     the remedy is "try again unchanged", not "something about
 *                     this request was wrong".
 *  - `reconciliation` — neither success nor failure. The control LOCKS: see
 *                     `locked` below.
 *
 * The messages are never written here. They come from `ACTION_ERROR_MESSAGE` via
 * the envelope's `error`, which is the contract's one user-safe string per code;
 * a second wording on this surface would be a second taxonomy to keep in sync.
 */
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  settleAction,
  type ActionErrorCode,
  type ActionResult,
} from '@/lib/data/action.contract'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export type AccountActionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success' }
  | { kind: 'failed'; message: string; code: ActionErrorCode }
  | { kind: 'unavailable'; message: string }
  | { kind: 'reconciliation'; message: string }

export interface AccountActionRunner<T> {
  state: AccountActionState
  /** Fire the mutation and settle the state. Never throws. */
  run: (
    action: () => Promise<ActionResult<T>>,
    options: { successMessage: string; onSuccess?: (data: T) => void },
  ) => Promise<void>
  /** Back to `idle` — for a control that reopens or a field the reader edits. */
  reset: () => void
  /**
   * Whether the control must stop offering itself. TRUE only for
   * `reconciliation`: the change has already been applied, so the honest UI has
   * no button left to show. Pending is handled by `disabled`, not by this — a
   * disabled button still says "this is the thing you pressed".
   */
  locked: boolean
}

export function useAccountAction<T>(): AccountActionRunner<T> {
  const router = useRouter()
  const [state, setState] = useState<AccountActionState>({ kind: 'idle' })

  const run = useCallback(
    async (
      action: () => Promise<ActionResult<T>>,
      options: { successMessage: string; onSuccess?: (data: T) => void },
    ) => {
      setState({ kind: 'pending' })
      // `settleAction` turns a framework transport rejection into the same
      // envelope, so there is one shape to branch on and no try/catch here.
      const result = await settleAction(action)

      if (result.ok) {
        options.onSuccess?.(result.data)
        setState({ kind: 'success' })
        toast.success(options.successMessage)
        // The account actions revalidate `/admin`; these surfaces live BELOW it
        // (`/admin/accounts/…`), which that path does not cover. `router.refresh()`
        // re-renders the route the reader is actually on — the row, the badge and
        // the header all come back from the server as they now stand.
        router.refresh()
        return
      }
      if (result.code === 'reconciliation_required') {
        setState({ kind: 'reconciliation', message: result.error })
        return
      }
      if (result.code === 'unavailable') {
        setState({ kind: 'unavailable', message: result.error })
        return
      }
      setState({ kind: 'failed', message: result.error, code: result.code })
    },
    [router],
  )

  const reset = useCallback(() => setState({ kind: 'idle' }), [])

  return { state, run, reset, locked: state.kind === 'reconciliation' }
}

/**
 * The three states that draw something. `idle` and `pending` draw nothing —
 * pending is shown by the control's own spinner, where the reader's attention
 * already is — and `success` is a toast, not an inline box, so a screen does not
 * accumulate green confirmations of things the refreshed data already shows.
 */
export function AccountActionStatus({ state }: { state: AccountActionState }) {
  if (
    state.kind === 'idle' ||
    state.kind === 'pending' ||
    state.kind === 'success'
  ) {
    return null
  }

  if (state.kind === 'reconciliation') {
    return (
      // Not `destructive`: this is not a failure, and painting it red would
      // teach the reader to retry the one outcome they must not retry.
      <Alert role="alert">
        <TriangleAlert />
        <AlertTitle>Perubahan diterapkan sebagian</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  )
}
