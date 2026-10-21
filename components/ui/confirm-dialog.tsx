'use client'

/**
 * Confirmation dialog for a programmatic mutation — a wrapper over `alert-dialog`.
 *
 * The gap it fills is not visual: the raw primitive is declarative JSX, so every
 * call site re-implements the same open state, in-flight flag, and result
 * handling. That triple is the whole point of this component.
 *
 * It pairs with the `runAction` / `ActionResult` mutation shape. `settleAction`
 * also converts a framework transport rejection into that envelope, so the dialog
 * owns the pending window and failure branch. Form mutations do NOT belong here —
 * they use the TanStack Form SSR action instead (see docs/reference/contracts/data.md).
 *
 * Flat named export, not a dotted compound — see the note in
 * components/shell/page.tsx. The footer's button order is owned here and is not
 * composable: Cancel then Confirm, always. In a destructive dialog that order is
 * a safety property, not a style choice.
 */
import {
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { settleAction, type ActionResult } from '@/lib/data/action.contract'

interface ConfirmDialogProps {
  /** The element that opens the dialog. Base UI composes via `render`, not `asChild`. */
  trigger: ReactElement
  title: ReactNode
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  /**
   * Opt IN. A default that presumes deletion would paint every confirmation red
   * and teach the eye to ignore it.
   */
  destructive?: boolean
  /**
   * The mutation. Returns the envelope — `runAction` never throws and never
   * redirects across the boundary, so this is awaited directly.
   */
  onConfirm: () => Promise<ActionResult<unknown>>
  /** Runs after a successful confirm, as the dialog begins closing. */
  onSuccess?: () => void
  /**
   * Where focus lands when the dialog closes. Pass this when the confirm
   * DESTROYS ITS OWN TRIGGER — the default (restore to the trigger) is then
   * unreachable by construction, and focus falls to `<body>`.
   *
   * That is not a hypothetical: driven on /assets, focus stayed on the confirm
   * button until the popup unmounted and then landed on `<body>` — the reader is
   * at the top of the document with no announced position. The toast says WHAT
   * happened (sonner's live region); nothing says WHERE they are.
   *
   * The primitive's own prop, re-exported rather than re-typed. Both forms are
   * deliberate and both are in use, because the two call sites can reach
   * different trees: a `RefObject` when the target is inside the same island,
   * and the FUNCTION form when it is not — a ref cannot cross an RSC boundary,
   * but an id string can, so the island resolves it at close time. Narrowing
   * this to an id would forbid the ref form; presetting it would charge rent for
   * a default that is already correct wherever the trigger survives.
   *
   * ⚠️ WHAT YOU PASS IS A TARGET, NOT NECESSARILY THE LANDING SPOT — verified in
   * the browser, not inferred. Base UI resolves it through
   * `FloatingFocusManager.getFirstTabbableElement`: the element IF it is
   * tabbable, else its first tabbable DESCENDANT, else the element itself. So a
   * `tabIndex={-1}` CONTAINER hands focus to the first control inside it and
   * takes focus itself only when it holds none. Pass a container deliberately
   * (see /assets) or pass a tabbable element; do not assume the node you named is
   * the node that ends up focused.
   *
   * It only fires when the dialog actually CLOSES, which is why the failure
   * branch needs no special case: `result.ok === false` keeps the dialog open,
   * so focus stays on the error the reader has to read.
   */
  finalFocus?: React.ComponentProps<typeof AlertDialogContent>['finalFocus']
}

function ConfirmDialog({
  trigger,
  title,
  description,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  destructive = false,
  onConfirm,
  onSuccess,
  finalFocus,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    // The transition covers the action round-trip: `pending` stays true until
    // the promise settles, which disables both footer buttons and blocks
    // dismissal while the mutation is in the air. It does NOT wait for
    // revalidation — Next resolves the action promise before it applies the new
    // server tree, so the dialog closes first and the refreshed list lands a
    // tick later.
    startTransition(async () => {
      const result = await settleAction(onConfirm)
      // React restores the transition scope synchronously at the first await, so
      // these post-await updates need their own transition to stay off the
      // default lane.
      startTransition(() => {
        if (result.ok) {
          setOpen(false)
          onSuccess?.()
          return
        }
        // Stay OPEN on failure — closing would discard the only surface where
        // the user can read why. `result.error` is user-safe by contract.
        setError(result.error)
      })
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No dismissing mid-flight: the mutation is already in the air.
        if (pending) return
        if (!next) setError(null)
        setOpen(next)
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            // Keeps the button focusable while in flight. A native `disabled`
            // attribute blurs the element the keyboard user just activated,
            // stranding focus on <body> — and on the failure branch the dialog
            // deliberately stays open, so they would have to re-traverse to
            // reach the error. Base UI still preventDefaults the click while
            // `disabled`, so this cannot double-submit; it swaps the attribute
            // for aria-disabled, hence the matching styles.
            focusableWhenDisabled
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? <Spinner /> : null}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
