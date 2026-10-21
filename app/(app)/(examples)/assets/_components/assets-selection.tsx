'use client'

/**
 * Bulk selection for /assets — the checkbox cells, the page header checkbox, and
 * the bulk bar, as THREE SMALL ISLANDS over one store.
 *
 * ═══ WHY THIS IS NOT `'use client'` ON `data-table.tsx` ═══
 *
 * Selection is client state, which might read as forcing "bulk select makes the
 * whole list page a client island". The premise is true and the conclusion does
 * not follow. Client state
 * needs a client ISLAND, not a client PAGE — and the distance between those two
 * is every list page in every app built from this boilerplate.
 *
 * What makes the narrow version work is the RSC boundary itself:
 * `data-table.tsx` has no 'use client', so `DataTableColumn.cell` is called
 * DURING THE SERVER RENDER. A cell may therefore RETURN a client component —
 * `<AssetSelectCheckbox id={item.id} />` is a client reference with serializable
 * props, which is an ordinary RSC-renders-a-client-component. The cell FUNCTION
 * still never crosses the boundary, which is the invariant that was actually at
 * stake. So `/assets` keeps its columns inline, keeps its Server Component, and a
 * list page that never selects anything pays nothing — it does not import this
 * file.
 *
 * The precedent is already in the repo, not invented here: `/state`'s
 * `DensityScope` is a client island wrapping SERVER-rendered children over
 * a module-level zustand store. This is that pattern with three subscribers.
 *
 * ═══ WHY ZUSTAND AND NOT CONTEXT ═══
 *
 * The state-management rule puts zustand LAST, and `/state` honestly admits that
 * on ITS page zustand was a demonstration rather than a necessity — Context could
 * have done it, since an RSC can wrap two islands in one client provider and pass
 * server-rendered `children` through. That applies
 * here too: a `<SelectionProvider>` around the table and the bar would work.
 *
 * The reason it is not the choice is the ONE argument `/state` names as zustand's
 * real trigger — Context re-renders its whole consuming subtree on every change,
 * and here the subtree is UP TO 100 ROWS (the page-size ceiling), every one of
 * them a consumer, on every single tick. zustand's subscribers each read a
 * BOOLEAN slice, so ticking row 3 re-renders row 3's checkbox, the header, and
 * the bar — not the other 99.
 *
 * Do not read that as a measured win: 100 checkboxes re-rendering is not a
 * profiled problem, and this was not benchmarked. It is a structural argument,
 * and the honest weight is that Context's cost here grows with page size while
 * zustand's does not, and the store also spares the page a provider spanning two
 * distant slots (the table, and the bar above it).
 *
 * ═══ WHY NOT THE URL (nuqs) ═══
 *
 * It is the ladder's first rung and it was weighed, not skipped. It genuinely
 * buys reload-survival and needs no store. It loses because selection is not the
 * kind of state the URL is for: `?selected=a,b,c,…` for 50 accumulated ids is a
 * query string measured in kilobytes, every tick is a server round-trip and a
 * new history entry, and a "shareable" link to a transient selection is a link
 * to something the recipient's filter may not even contain. The URL is for state
 * worth bookmarking; a selection about to be deleted is the opposite.
 *
 * FLAT NAMED EXPORTS — a 'use client' object export becomes one client-reference
 * whose `.Root` reads `undefined` from an RSC.
 */
import { useRef } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  deselectIds,
  EMPTY_SELECTION,
  isPagePartiallySelected,
  isPageSelected,
  selectedIds,
  setPageSelected,
  toggleSelected,
  type Selection,
} from '@/components/ui/data-table-selection'
import { ASSET_BULK_DELETE_MAX } from '@/features/asset/asset.schema'
import { deleteAssetsAction } from '@/features/asset/asset.action'

/**
 * The scope a selection is stamped with: the opaque RESULT-SET identity built
 * ONCE on the page (`assetScope` — the status filter AND the effective search,
 * exactly the string the cursor uses). A plain `string` because it is that opaque
 * identity, not an enum this island interprets — the page owns its shape. A change
 * to the filter OR the search yields a DIFFERENT string, which is what makes
 * `selectedIds` mask a stale selection so a bulk delete cannot act on a row the
 * search has hidden. The sort and the page size are NOT in it (they never change
 * which rows are in the set — see `selectedIds`), so re-sorting or re-paging keeps
 * the selection.
 */
type SelectionScope = string

interface AssetsSelectionState {
  selection: Selection
  toggle: (scope: SelectionScope, id: string) => void
  setPage: (scope: SelectionScope, pageIds: string[], selected: boolean) => void
  reset: (scope: SelectionScope) => void
  deselect: (ids: string[]) => void
}

/**
 * The PRODUCT cap on bulk selection, owned by the asset feature
 * (`ASSET_BULK_DELETE_MAX`). Enforcing it HERE — at the store, the one place that
 * owns "how many are picked" — keeps the Delete confirm from ever assembling an
 * over-cap array: a blocked add never enters the set, so no downstream control
 * has to re-check. `AssetIdsSchema.max` on the server is the loud twin of this
 * friendly stop; both read the same product constant, which is DISTINCT from
 * Firestore's batch ceiling (the repo enforces that separately).
 */
const SELECTION_CAP = ASSET_BULK_DELETE_MAX

/**
 * The id the bulk bar's select-all points `aria-labelledby` at. One constant
 * because two attributes in the same JSX have to agree on it, and a typo would
 * fail silently — a dangling `aria-labelledby` computes an EMPTY name, which is
 * strictly worse than the unnamed control this whole exercise is about.
 */
const SELECT_ALL_LABEL_ID = 'assets-select-all-label'

/**
 * WHAT SELECT-ALL SELECTS, said in one string, used as BOTH the visible text and
 * the accessible name of every select-all control on this surface.
 *
 * ═══ WHY THE SCOPE IS IN THE WORDS ═══
 *
 * "Pilih semua" is a lie by omission on a server-paginated list. The reach of
 * this control is `pageIds` — the rows in the window the server handed back —
 * while the thing on screen around it is a FILTERED SET whose size is printed a
 * few pixels away ("Menampilkan 25 dari 87"). A reader who ticks a box labelled
 * "select all" beside a count of 87 has been told they picked 87. They picked 25,
 * and the next control they reach is Delete. The scope has to be readable BEFORE
 * the click, not inferable from the counter that appears after it.
 *
 * The COUNT is in the string for the same reason, and it is the part that makes
 * the claim checkable: `n` is `pageIds.length`, the exact array
 * `setPageSelected` iterates, so "Pilih semua 25 aset di halaman ini" followed
 * by "25 dipilih" is the control's promise and its receipt agreeing. A page-size
 * change re-renders both from the same array; they cannot drift.
 *
 * ═══ WHY ONE STRING AND NOT A VISIBLE LABEL PLUS A LONGER aria-label ═══
 *
 * The bar used to pair a visible "Pilih semua" with `aria-label="Pilih semua
 * aset di halaman ini"`. That passes label-in-name (WCAG 2.5.3 — the accessible
 * name contains the visible text) and still fails the reader it matters to: the
 * SIGHTED user, who is shown the shortest and least true version. Naming the
 * scope only to assistive tech is the inversion this repo warns about elsewhere
 * ("if you are writing an aria-label to say what dimension a control is on, the
 * control cannot say so itself"). So the two are the SAME string — which also
 * makes label-in-name hold by construction rather than by review.
 *
 * The `aria-label` is still not redundant, and removing it silently breaks the
 * name: Base UI's Checkbox renders a visible `<button role="checkbox">` plus a
 * hidden `<input aria-hidden>`, and `id` lands on the INPUT — so `htmlFor` names
 * the input nobody reads and leaves the button unnamed. Both are required.
 *
 * The zero case drops the number rather than printing "Pilih semua 0": the
 * header checkbox outlives its rows (a zero-row table keeps its headers), and
 * "0" there reads as a broken counter rather than as an empty page.
 */
function selectAllLabel(pageCount: number): string {
  if (pageCount === 0) return 'Pilih semua aset di halaman ini'
  return `Pilih semua ${pageCount} aset di halaman ini`
}

/** Told the reader, once, why an add was refused. The store calls it on a block. */
function warnCapReached() {
  toast.error(`Hapus massal dibatasi hingga ${SELECTION_CAP} aset.`)
}

/**
 * Module-level store: ONE instance per browser tab, created on first import.
 * Correct here for the same reason `/state` gives — this is client-only
 * ephemeral state — and it is why the selection survives the re-render that
 * `revalidatePath` triggers after a delete. That survival is a FEATURE (paging
 * and re-sorting must not drop the set) and a HAZARD (deleted ids would linger),
 * which is what `deselect` on success is for.
 *
 * Not exported. The three islands below are the API; the store is how they agree
 * (`docs`: an export to signal an implementation detail is not an API).
 */
const useItemsSelectionStore = create<AssetsSelectionState>((set, get) => ({
  selection: EMPTY_SELECTION,
  toggle: (scope, id) => {
    const current = selectedIds(get().selection, scope)
    // Block only a GROWTH past the cap; a REMOVE (id already in the set) always
    // passes, so a full selection stays editable down.
    if (!current.has(id) && current.size >= SELECTION_CAP) {
      warnCapReached()
      return
    }
    set((state) => ({ selection: toggleSelected(state.selection, scope, id) }))
  },
  setPage: (scope, pageIds, selected) => {
    if (selected) {
      // REFUSE the whole page rather than partial-fill to the cap — a partial
      // select-all is exactly the indeterminate state this file refuses to
      // render (see `AssetsSelectPageCheckbox`). Count only the ids not already
      // held, so re-ticking an already-selected page never trips the guard.
      const current = selectedIds(get().selection, scope)
      const additions = pageIds.filter((id) => !current.has(id)).length
      if (current.size + additions > SELECTION_CAP) {
        warnCapReached()
        return
      }
    }
    set((state) => ({
      selection: setPageSelected(state.selection, scope, pageIds, selected),
    }))
  },
  reset: (scope) => set({ selection: { scope, ids: new Set() } }),
  deselect: (ids) =>
    set((state) => ({ selection: deselectIds(state.selection, ids) })),
}))

interface ItemSelectCheckboxProps {
  id: string
  /** The row's name — the checkbox's accessible name is built from it. */
  name: string
  scope: SelectionScope
}

/** Island 1: one row's checkbox. Rendered by a column `cell` AND by the cards. */
export function AssetSelectCheckbox({
  id,
  name,
  scope,
}: ItemSelectCheckboxProps) {
  // Subscribe to a BOOLEAN, never to the Set. Two reasons, and the second is not
  // cosmetic: a selector returning a fresh object/Set each call gives
  // useSyncExternalStore a new snapshot every time and loops forever. A
  // primitive also means this row re-renders only when ITS OWN state flips.
  const checked = useItemsSelectionStore((state) =>
    selectedIds(state.selection, scope).has(id),
  )
  const toggle = useItemsSelectionStore((state) => state.toggle)

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={() => toggle(scope, id)}
      // The row has no visible label tied to this box, so without a name it
      // announces as an unlabelled checkbox in a column of identical ones.
      aria-label={`Pilih ${name}`}
    />
  )
}

interface ItemsSelectPageCheckboxProps {
  /** The ids of the rows ON SCREEN — the entire reach of this control. */
  pageIds: string[]
  scope: SelectionScope
}

/**
 * Island 2: the header checkbox. Covers THE ACTIVE PAGE ONLY — a reader cannot
 * select rows they cannot see.
 *
 * TRI-STATE, and the third state is the point. Two booleans come off the store:
 * `checked` (every page row picked) and `partial` (some but not all —
 * `isPagePartiallySelected`), the latter handed to the primitive as
 * `indeterminate`. `components/ui/checkbox.tsx` paints a DASH for that state, so
 * a half-selected page reads "some" rather than lying "all" with a check. Both
 * booleans are READS of the store — the scope and cap logic lives there, and
 * nothing in this island duplicates or overrides it.
 */
export function AssetsSelectPageCheckbox({
  pageIds,
  scope,
}: ItemsSelectPageCheckboxProps) {
  const checked = useItemsSelectionStore((state) =>
    isPageSelected(pageIds, selectedIds(state.selection, scope)),
  )
  // A SECOND boolean slice, never the Set (a fresh Set each call would loop
  // useSyncExternalStore). Mutually exclusive with `checked` by construction —
  // `isPagePartiallySelected` is false whenever `isPageSelected` is true — so
  // the box is never told it is both at once.
  const partial = useItemsSelectionStore((state) =>
    isPagePartiallySelected(pageIds, selectedIds(state.selection, scope)),
  )
  const setPage = useItemsSelectionStore((state) => state.setPage)

  return (
    <Checkbox
      checked={checked}
      indeterminate={partial}
      // An empty page has nothing to select, and this header now OUTLIVES its
      // rows: a zero-row table keeps its headers and swaps only the body, so
      // without this the reader gets a checkbox that ticks nothing back. Saying
      // `disabled` is the honest state, not hiding it — the column is still
      // there, it just has no rows to reach. (`isPageSelected` separately
      // refuses to report an empty page as "all selected"; that guard answers a
      // different question and neither one covers for the other.)
      disabled={pageIds.length === 0}
      onCheckedChange={(next) => setPage(scope, pageIds, next)}
      // The SAME words the bulk bar shows visibly — this header has no visible
      // text of its own, so the name is all it has, and it must not be a
      // shorter, vaguer version of the control beside it.
      aria-label={selectAllLabel(pageIds.length)}
    />
  )
}

interface AssetsBulkBarProps {
  /** The ids of the rows ON SCREEN — the entire reach of "Select all". */
  pageIds: string[]
  scope: SelectionScope
}

/**
 * Island 3: the bulk bar. It owns "Select all", and mounts on ROWS, not on
 * SELECTION.
 *
 * Both facts are one decision. Select-all in the bar (not the table header)
 * means the bar always has content, so it never unmounts under the reader's
 * cursor — and since the bar sits outside the view branch, the card grid gets a
 * select-all it has no header row to hang.
 *
 * `min-h-11` (44px) reserves the tallest state so the first tick changes the
 * bar's contents and never its size. The arithmetic is load-bearing: `size="sm"`
 * buttons are `h-7` (28px), so `py-1.5` + the 1px borders lands the selected
 * state at 42px — under the floor. `py-2` would make it 46px and the bar would
 * still grow 2px, which is the bug this floor exists to prevent.
 *
 * NEUTRAL, not red: this is the ENTRY point, and red belongs on the
 * button that COMMITS. Forty red rows teach the eye to ignore red, all the more
 * with the bar always on screen.
 */
export function AssetsBulkBar({ pageIds, scope }: AssetsBulkBarProps) {
  const count = useItemsSelectionStore(
    (state) => selectedIds(state.selection, scope).size,
  )
  const allPageSelected = useItemsSelectionStore((state) =>
    isPageSelected(pageIds, selectedIds(state.selection, scope)),
  )
  const setPage = useItemsSelectionStore((state) => state.setPage)
  const reset = useItemsSelectionStore((state) => state.reset)
  const deselect = useItemsSelectionStore((state) => state.deselect)
  // The ids the confirm actually SENT. `onConfirm` and `onSuccess` are separate
  // callbacks, and success must drop exactly what the server deleted — not
  // "whatever is selected now", which is a different set the moment anything
  // else has changed.
  const sent = useRef<string[]>([])
  // Where focus goes when the bulk confirm closes. A REF, not an id lookup, and
  // both halves of that are load-bearing:
  //
  // - A ref works here where it cannot work for a row action, because this
  //   target is in THIS island's own tree. The bar "mounts on ROWS, not on
  //   SELECTION", so it survives its own confirm — only the actions inside it
  //   unmount (`count > 0 &&`), which is exactly what destroys the trigger.
  // - Not `getElementById('assets-select-all')`: that id lands on Base UI's
  //   HIDDEN `<input aria-hidden>`, not on the visible `<button role="checkbox">`
  //   the keyboard actually lands on (see the label comment below). Focusing an
  //   aria-hidden input is worse than <body> — it is focus with nothing to
  //   announce. The ref goes to the Root, which IS that button.
  const selectAllRef = useRef<HTMLButtonElement>(null)

  // The only condition that unmounts the bar, and it cannot jump: it does not
  // change when a reader ticks a box.
  if (pageIds.length === 0) return null

  const noun = 'aset'
  // Both the words on screen and the accessible name — see `selectAllLabel` for
  // why they are one string and why the page count is in it.
  const selectAll = selectAllLabel(pageIds.length)

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-1.5">
      {/* Reach is THIS PAGE only — a reader cannot select rows they cannot see —
          and the label says so, in words, before the first click.

          ═══ WHY `aria-labelledby` AND NOT `aria-label` ═══

          Base UI's Checkbox renders a visible <button role="checkbox"> plus a
          hidden <input aria-hidden>, and `id` lands on the INPUT — so `htmlFor`
          pairs this <label> with the input nobody reads. The click still
          forwards (driven), but naming is a separate question, and the answer is
          not "no name": Chrome folds the wrapping <label>'s text into the
          BUTTON's name too. With an `aria-label` carrying the same words, the
          control announced them TWICE — "Pilih semua 25 aset di halaman ini
          Pilih semua 25 aset di halaman ini" (read back off the AX tree, not
          theorised). A stutter is what you get for naming one control two ways.

          `aria-labelledby` pointing at the visible text is the one spelling that
          cannot stutter: it is authoritative, so it replaces the folded-in label
          text rather than adding to it, and it resolves to the exact string on
          screen — label-in-name (WCAG 2.5.3) holds by construction because the
          name IS the visible text node, not a copy of it. Do NOT "simplify" this
          back to `aria-label={selectAll}`. */}
      <label
        htmlFor="assets-select-all"
        className="flex items-center gap-2 text-sm font-medium"
      >
        <Checkbox
          ref={selectAllRef}
          id="assets-select-all"
          checked={allPageSelected}
          // Disabled only when ticking it could GROW the selection past the cap.
          // When the page is already fully selected, the box means "deselect this
          // page", which must stay available even at the ceiling — so the guard
          // excludes that case rather than trapping a full selection on screen.
          disabled={count >= SELECTION_CAP && !allPageSelected}
          onCheckedChange={(next) => setPage(scope, pageIds, next)}
          aria-labelledby={SELECT_ALL_LABEL_ID}
        />
        <span id={SELECT_ALL_LABEL_ID}>{selectAll}</span>
      </label>

      {/* <output>, not <p role="status">: its implicit ARIA role IS status.
          Always mounted, empty at zero — a live region must be in the DOM before
          its content changes, so this now announces the first selection too. */}
      <output className="text-sm text-muted-foreground">
        {count > 0 ? `${count} dipilih` : null}
      </output>

      {/* The ceiling, stated when it is reached — the store already refuses to
          grow the set past it, and this tells the reader why "Select all" stopped
          responding. */}
      {count >= SELECTION_CAP && (
        <p className="text-sm text-muted-foreground">
          Hapus massal dibatasi hingga {SELECTION_CAP}.
        </p>
      )}

      {/* The ACTIONS come and go; the bar does not. */}
      {count > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => reset(scope)}>
            Bersihkan
          </Button>

          <ConfirmDialog
            destructive
            trigger={
              <Button variant="destructive" size="sm">
                Hapus
              </Button>
            }
            title={`Hapus ${count} ${noun}?`}
            description={`Ini menghapus permanen ${count} ${noun} yang dipilih. Tindakan ini tidak dapat dibatalkan.`}
            confirmText="Hapus"
            // Read the ids at CLICK time from the store rather than subscribing
            // to them — subscribing to a Set would loop (see the row island),
            // and the count above is all this component needs to render.
            //
            // No router.refresh(): deleteAssetsAction revalidates `/assets` itself.
            onConfirm={() => {
              const ids = [
                ...selectedIds(
                  useItemsSelectionStore.getState().selection,
                  scope,
                ),
              ]
              sent.current = ids
              return deleteAssetsAction(ids)
            }}
            // Success destroys the TRIGGER — the actions unmount the moment the
            // set empties, though the bar itself now stays — so the toast is the
            // only thing left that says it happened, and sonner's live region is
            // what announces it. Failures stay INLINE in the still-open dialog,
            // and leave the selection alone so the reader can retry. Dropping the
            // sent ids here is also what keeps the module-level store from
            // carrying deleted ids across the revalidatePath re-render.
            onSuccess={() => {
              const deleted = sent.current.length
              deselect(sent.current)
              toast.success(`${deleted} aset dihapus`)
            }}
            // Success empties the selection, which unmounts this button — so the
            // default (restore to the trigger) has nothing to restore to. Select
            // all is the nearest thing that outlives the confirm and it is the
            // control this reader was just working in.
            finalFocus={selectAllRef}
          />
        </div>
      )}
    </div>
  )
}
