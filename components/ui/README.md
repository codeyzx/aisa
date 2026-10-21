# `components/ui`

shadcn primitives — style **`base-nova`** on **Base UI** (`@base-ui/react`, not
Radix). Config in `components.json`; add more with
`pnpm dlx shadcn@latest add <name>`. Tokens: `app/globals.css` (neutral).
Vendored primitives relax a few extra-strict a11y lint rules (`.oxlintrc.json`
override); app/shell code keeps them on. Non-shadcn shared components may live
here too — list them under "Custom".

Forms: use **`field`** + **TanStack Form**, not shadcn `form` (react-hook-form).

**shadcn base-nova** — alert · alert-dialog · avatar · badge · breadcrumb ·
button · card · checkbox · combobox · command · dialog · dropdown-menu · empty ·
field · input · input-group · label · pagination · popover · progress ·
radio-group · scroll-area · select · separator · sheet · sidebar · skeleton ·
sonner · spinner · switch · table · tabs · textarea · toggle · toggle-group ·
tooltip

`checkbox` is vendored base-nova, locally extended with an `indeterminate` (dash)
indicator — the middle state the tri-state select-all header needs.

**Custom (non-shadcn, shared)** — built to the Aixel standard on the primitives
above; see `docs/reference/contracts/ui.md`.

The URL-backed list toolbar is not listed here — its model, controller, Context
transport, and layout slots live in `lib/list-toolbar/` (architecture owned by
`docs/reference/contracts/ui.md`); only its leaf controls below are reusable UI.

- **data-table** — typed columns over `table`. Server-renderable (no
  `'use client'`); ships the bidirectional `DataTableCursorNav` (Previous + Next) for
  `Page<T>` cursor paging, plus `countLabel` / `nextSort` / `ariaSort`. Its
  sortable-link and empty-row fragments also keep those mechanics identical in
  the interactive Assets table without merging their implementations. The
  interactive column/row variant (sticky pinned actions, tri-state select-all) is
  a page-level `@tanstack/react-table` island, not here — see
  `docs/reference/contracts/ui.md`.
- **data-table-selection** — pure, dependency-free set logic for a scoped bulk
  selection (`selectedIds`, `toggleSelected`, `setPageSelected`, `isPageSelected`,
  `isPagePartiallySelected`, `deselectIds`). No React — a `.ts` sibling so the client
  selection island and its unit test read one source; its `scope` field mirrors the
  cursor's, so a selection is meaningless against another query.
- **choice-select** — a controlled single-choice `select` over a CLOSED set, the
  presentation every "pick exactly one" control shares (Assets status/page-size/
  card-sort, the asset form's status, the `/state` filter). Owns the closed-value
  label (`items` map so the trigger and options agree), explicitly ORDERED options
  (never `Object.keys`), and the null-clear guard — but no navigation, optimistic
  state, or URL. A caller wires policy around it.
- **search-input** — a controlled search field: visible label, decorative
  magnifier, optional clear button (accessible name), optional `aria-describedby`
  hint, and pending styling. Pure presentation — no debounce, router, or
  min-length rule — so one field serves a debounced toolbar search and a plain
  filter box alike. `type="text"` (not `search`) so it can supply its own clear
  button instead of the browser's inconsistent native one.
- **numeric-input** — `react-number-format` with grouping/decimal separators
  DERIVED from `lib/format/locale.ts` (not hardcoded). Stores a plain `number`,
  displays the grouped/prefixed string, and — when given `name` — renders a
  hidden raw-value input so a native POST submits the number, not the "Rp …"
  display. A cleared field is BLANK, never `0`: it renders empty and posts
  nothing (both read `isNumericBlank`), so the schema rejects it rather than the
  input inventing a value, and the hidden FormData can never disagree with the
  visible field. Parse / clamp / blank rules and the separators are pure in
  `lib/format/numeric.ts`.
- **view-toggle** — `toggle-group` (`spacing={0}`) + the exactly-one invariant +
  a required icon and an `sr-only` name. For RENDERING choices (table vs cards)
  only; a filter or page size is a labelled `select`.
- **confirm-dialog** — `alert-dialog` + open/pending/`ActionResult` handling.
  Takes the primitive's own `finalFocus` for the case it cannot default:
  a confirm that destroys its own trigger. Note what you pass is a target,
  not the landing spot — Base UI focuses its first tabbable element.
- **file-picker** — client-side hidden file-input activation, same-file reset,
  availability, accessible naming, and optional `accept`. Callers retain all
  upload, file-type, and persistence policy.
