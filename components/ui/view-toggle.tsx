'use client'

/**
 * How the same rows are DRAWN — table vs cards. A thin wrapper over
 * `toggle-group`, in the pill look: a muted track the active view floats on.
 *
 * FOR RENDERING CHOICES ONLY. A control that changes WHICH rows come back, or
 * how many — a filter, a page size — is a `<Select>` that names its own
 * dimension (`All statuses`), never this.
 *
 * What the wrapper buys (an invariant, never preset props):
 * - NO STYLING. `toggle-group` already authors the pill look as a first-class
 *   mode (`variant="pill"`); hand-writing that CSS would fork it.
 * - EXACTLY-ONE. Base UI's ToggleGroup emits `[]` when the active item is
 *   pressed again. A view toggle must never have no view, so that event is
 *   dropped here rather than at every call site.
 * - ICON + VISIBLE NAME. `icon` is required and `label` is a plain `string`
 *   this renders itself, so every button is both drawn and named right here — a
 *   call site can neither ship one unnamed nor smuggle in its own markup.
 *
 * Flat named export, not a dotted compound: this is a 'use client' module, and a
 * client module's object export becomes a client-reference whose `.Root` reads
 * undefined from a Server Component (see the note in components/shell/page.tsx).
 */
import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface ViewToggleOption<Value extends string> {
  value: Value
  /** Required — a view toggle leads with an icon. */
  icon: ReactNode
  /**
   * The view's name, in words. Rendered beside the icon as visible text, and it
   * is also the button's accessible name — one string, both jobs. A plain
   * `string`, not a `ReactNode`, so a call site cannot smuggle markup in here.
   */
  label: string
}

interface ViewToggleProps<Value extends string> {
  /** The view the SERVER rendered — i.e. what the URL currently says. */
  value: Value
  /** Never fires with an empty selection — the wrapper owns that invariant. */
  onValueChange: (value: Value) => void
  options: ViewToggleOption<Value>[]
  size?: 'default' | 'sm'
  // No `orientation`: a segmented view toggle is horizontal by definition, so
  // there is nothing here for a caller to orient. (toggle-group does forward
  // orientation to Base UI for the controls that need a vertical variant — this
  // simply is not one of them.)
  /**
   * Names the GROUP for assistive tech (e.g. "View items as"). The buttons name
   * themselves from their own `label`; this names what they choose between.
   */
  'aria-label': string
  className?: string
}

function ViewToggle<Value extends string>({
  value,
  onValueChange,
  options,
  size = 'default',
  className,
  ...props
}: ViewToggleProps<Value>) {
  return (
    <ToggleGroup
      data-slot="view-toggle"
      // The pill look — authored upstream in toggle-group, not here. Note the
      // gap: `spacing={0}` is the OTHER mode (merged borders, shared corners),
      // and its rules would fight the pills for radius.
      spacing={1}
      variant="pill"
      size={size}
      value={[value]}
      onValueChange={(next) => {
        // `next` is `[]` when the active item is pressed again. Ignoring it
        // keeps exactly one view selected at all times.
        const picked = next.at(-1)
        if (picked !== undefined) onValueChange(picked as Value)
      }}
      className={cn(className)}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.icon}
          {/* The name the call site can no longer forget to write. */}
          <span>{option.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export { ViewToggle, type ViewToggleOption }
