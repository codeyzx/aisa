'use client'

/**
 * A controlled search field: a visible label, a decorative magnifier, the input,
 * an optional clear button, and an optional hint — the presentation, and ONLY the
 * presentation. It owns no debounce, no router, no "min length" rule; a caller
 * feeds `value` and reacts to `onValueChange` / `onKeyDown` / `onClear`, so the
 * same field serves a debounced toolbar search and a plain filter box alike.
 *
 * A native `type="search"` renders the browser's own clear "X" — unstyled and
 * inconsistent across browsers — so this stays `type="text"` and supplies its own
 * clear button when `onClear` is given.
 */

import { SearchIcon, XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface SearchInputProps {
  /** Ties the visible `<label>` to the input; also the base for the hint id. */
  id: string
  /** The visible label naming the query dimension (e.g. "Cari kode atau nama"). */
  label: string
  value: string
  onValueChange: (value: string) => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  placeholder?: string
  /** When given, a clear button renders while `value` is non-empty. */
  onClear?: () => void
  /** Accessible name for the clear button. Required whenever `onClear` is set. */
  clearLabel?: string
  /** Shown (and associated via `aria-describedby`) only while it is non-empty. */
  hint?: string
  /** Dim the field while a search it drove is still in flight. */
  pending?: boolean
  className?: string
}

export function SearchInput({
  id,
  label,
  value,
  onValueChange,
  onKeyDown,
  placeholder,
  onClear,
  clearLabel,
  hint,
  pending,
  className,
}: SearchInputProps) {
  const hintId = `${id}-hint`
  const showClear = onClear != null && value !== ''

  return (
    <div className="flex flex-col gap-1">
      {/* A VISIBLE label tied to the input by id — so NO aria-label (it would
          override the words on screen). */}
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          className={cn('pr-8 pl-8', pending && 'opacity-70', className)}
        />
        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
      {hint ? (
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
