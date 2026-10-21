'use client'

/**
 * Per-row actions: an EDIT link (navigates to the edit form) + a DELETE button.
 *
 * Delete is the canonical PROGRAMMATIC-mutation example — a one-click imperative
 * action, so it uses the `ActionResult` entry (`deleteAssetAction`), NOT a form.
 * `ConfirmDialog` owns the open state, the pending window, and the envelope
 * branch, so none of that triple is re-rolled here.
 *
 * Delete carries `destructive` at the TRIGGER, not only on the confirm inside
 * the dialog: the colour is what separates the irreversible button from the one
 * beside it, and it has to do that BEFORE the click. The variant is a tint
 * (`bg-destructive/10`), not a solid fill, so a column of them still reads as a
 * warning rather than a wall of red. Edit stays neutral — red only keeps its
 * meaning if nothing next to it borrows it.
 */
import Link from 'next/link'
import { FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteAssetAction } from '@/features/asset/asset.action'

import { assetEditHref } from '../search-params'

interface AssetRowActionsProps {
  id: string
  name: string
  /**
   * Show each action's word beside its icon. CARDS do; table rows do not.
   *
   * The two surfaces genuinely differ. A table repeats these buttons down a
   * column under a header that has already said what they are, and the row's own
   * name column supplies the context — icons keep that column narrow. A card has
   * no header row and no column, so an unlabelled icon in its footer is a
   * guess.
   *
   * The `aria-label` stays either way, and stays WIDER than the visible word:
   * "Edit" repeated once per card is what a screen reader hears when it lists
   * the buttons, so the name keeps the asset in it. That satisfies label-in-name
   * (WCAG 2.5.3) because the accessible name still contains the visible text.
   */
  labelled?: boolean
  /**
   * The id of the element focus retreats to once the row is gone — the list
   * wrapper on the page.
   *
   * A STRING, not a ref, and that is the RSC boundary showing through rather
   * than a preference: `/assets/page.tsx` is a Server Component, so it cannot
   * hand a `RefObject` down here. It can hand an id, because a string is
   * serializable — and this island resolves it in the browser at close time,
   * which is the only moment the answer is knowable anyway.
   *
   * It has to come from OUTSIDE: every element this island can reach lives
   * inside the row that the confirm unmounts, and after `revalidatePath` the
   * surviving list is a NEW server tree, so no element identity could have been
   * captured up front either.
   */
  finalFocusId: string
  /**
   * The list URL the reader is looking at, carried into the Edit link as
   * `?returnTo` so a save (or Cancel) lands back on the same page — same filter,
   * sort, search, page size, view, and cursor. Built ONCE server-side
   * (`assetsCurrentHref`) and threaded down through both views; this component
   * never assembles it, it only forwards it into `assetEditHref`.
   */
  returnTo: string
}

export function AssetRowActions({
  id,
  name,
  labelled = false,
  finalFocusId,
  returnTo,
}: AssetRowActionsProps) {
  // Outline when labelled — it is a lone pair in a card footer rather than one
  // of twenty-five in a column, so it can afford an edge. EDIT only; Delete is
  // `destructive` on both surfaces.
  const variant = labelled ? 'outline' : 'ghost'
  const size = labelled ? 'sm' : 'icon-sm'

  return (
    <div
      className={cn(
        'flex items-center justify-end',
        labelled ? 'gap-2' : 'gap-1',
      )}
    >
      {/* Styled <Link>, not <Button render={<Link/>}> — see the note in
          data-table.tsx: Base UI's Button would stamp role="button" over the
          anchor's link role, so Edit would announce as a button, not a link. */}
      <Link
        href={assetEditHref(id, returnTo)}
        aria-label={`Ubah ${name}`}
        className={cn(buttonVariants({ variant, size }))}
      >
        <Pencil />
        {labelled && 'Ubah'}
      </Link>

      {/* PDF is the one strand that fully degrades: a plain <a download>, no JS.
          The route (app/api/export/assets/[id]/pdf) sets Content-Disposition, so
          the browser saves it.
          `<a>`, NOT next/link: this navigates to a route handler that answers
          bytes, not a page — Link would prefetch an RSC payload that does not
          exist. And a REAL anchor with buttonVariants, never
          `<Button render={<Link/>}>`: Base UI's Button stamps role="button" over
          the anchor's link role (see the Edit link above and data-table.tsx).
          `<a download>` is the right primitive here, not next/link. */}
      <a
        href={`/api/export/assets/${id}/pdf`}
        download
        aria-label={`Unduh ${name} sebagai PDF`}
        className={cn(buttonVariants({ variant, size }))}
      >
        <FileText />
        {labelled && 'PDF'}
      </a>

      <ConfirmDialog
        destructive
        trigger={
          <Button
            variant="destructive"
            size={size}
            aria-label={`Hapus ${name}`}
          >
            <Trash2 />
            {labelled && 'Hapus'}
          </Button>
        }
        title="Hapus aset?"
        description={`Ini menghapus permanen “${name}”. Tindakan ini tidak dapat dibatalkan.`}
        confirmText="Hapus"
        // No router.refresh(): deleteAssetAction already revalidates `/assets`
        // server-side, and a server action's revalidation refreshes the calling
        // route on its own.
        onConfirm={() => deleteAssetAction(id)}
        // Success closes the dialog, so there is no inline surface left to write
        // to — and the row itself vanishes, taking the trigger (and the focus)
        // with it. The toast is the only thing that confirms the delete happened,
        // and sonner's live region is what announces it to a screen reader.
        // Failures stay inline, inside the still-open dialog.
        onSuccess={() => toast.success(`“${name}” dihapus`)}
        // Resolved at CLOSE time, not at render: the row this button sits in is
        // being deleted, so the target has to be an element that outlives it —
        // and after revalidation the list is a new tree, so it is looked up
        // fresh rather than captured.
        //
        // The wrapper is a SCOPE, not the landing spot: Base UI focuses its
        // first TABBABLE element, so the reader lands on the first control in
        // the list and only on the wrapper itself when the list is empty. See
        // ASSETS_LIST_ID on the page for the resolver's actual rule — it is not
        // what the prop name suggests.
        //
        // Returning null (the element somehow gone) falls back to Base UI's
        // default, which is the <body> we already had — never worse.
        finalFocus={() => document.getElementById(finalFocusId)}
      />
    </div>
  )
}
