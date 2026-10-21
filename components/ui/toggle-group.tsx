'use client'

import * as React from 'react'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { toggleVariants } from '@/components/ui/toggle'

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: 'horizontal' | 'vertical'
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 2,
  orientation: 'horizontal',
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = 'horizontal',
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: 'horizontal' | 'vertical'
  }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      // Forwarded, not just painted as a data attribute: Base UI reads
      // `orientation` to rove arrow-key focus, and emits `data-orientation`
      // itself from it — so a vertical group navigates vertically instead of
      // styling vertical while the keyboard still moves horizontally.
      orientation={orientation}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        // `--tg-radius` is declared HERE and read by both this rounding and the
        // outer corners of the first/last item (`spacing={0}` merges them into
        // one control, so the two must agree). Keep the radius in this single
        // declaration: if the items hardcode `rounded-*-lg` while this root
        // goes size-aware, then at `size="sm"` the root is 8px and the item
        // corners are 10px — the item's larger radius wins on screen and the
        // segmented control sits visibly rounder than the `select` beside it.
        // `data-[variant=pill]` makes the ROOT the visible surface — a muted
        // track the items float on. That look is the one alternative to the
        // `spacing={0}` segmented mode, and it deliberately does NOT use
        // `spacing={0}`: every segmented rule below (rounded-none, the merged
        // outer corners, the collapsed borders) is gated on
        // `group-data-[spacing=0]`, so a pill group simply keeps a gap and lets
        // each item carry its own radius and padding.
        'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-[var(--tg-radius)] [--tg-radius:var(--radius-lg)] data-[size=sm]:[--tg-radius:min(var(--radius-md),10px)] data-[variant=pill]:bg-muted data-[variant=pill]:p-1 data-vertical:flex-col data-vertical:items-stretch',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, spacing, orientation }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        'shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-[var(--tg-radius)] group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-[var(--tg-radius)] group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-[var(--tg-radius)] group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-[var(--tg-radius)] group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
