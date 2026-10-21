'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'

import { cn } from '@/lib/utils'
import { CheckIcon, MinusIcon } from 'lucide-react'

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // `data-indeterminate:` mirrors `data-checked:` so a MIXED box wears the
        // same filled primary chrome as a checked one — the dash then reads on
        // primary-foreground, and "some selected" looks as deliberate as "all".
        // Base UI sets `data-checked` and `data-indeterminate` as MUTUALLY
        // EXCLUSIVE presence attrs (checked yields neither when indeterminate),
        // so these two groups never fight.
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-indeterminate:bg-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      {/* TWO glyphs, one slot. The Indicator mounts on `checked || indeterminate`
          and carries the same `data-checked` / `data-indeterminate` state as the
          Root, so CSS shows exactly one: a CHECK when checked, a DASH when
          indeterminate. A mixed state must read as a DASH, not a check —
          a check there lies "all selected". */}
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          'grid place-content-center text-current transition-none [&>svg]:size-3.5',
          // Dash off unless indeterminate; check off when it is. Single
          // arbitrary selectors (not stacked variants) so `&` binds to the
          // Indicator and the child match is unambiguous.
          '[&>[data-slot=checkbox-dash]]:hidden',
          '[&[data-indeterminate]>[data-slot=checkbox-check]]:hidden',
          '[&[data-indeterminate]>[data-slot=checkbox-dash]]:block',
        )}
      >
        <CheckIcon data-slot="checkbox-check" />
        <MinusIcon data-slot="checkbox-dash" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
