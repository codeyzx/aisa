'use client'

/**
 * The flat presentation shell for a list toolbar — dumb flex/layout wrappers that
 * own NO state and NO policy, only className + children. They mirror the Assets
 * toolbar layout (a wrapping row with a leading slot and a trailing controls
 * group, plus a separate footer slot for page size) so a feature composes the
 * bound controls (scope.tsx `.Search`/`.Select`/`.View`) inside them without
 * re-authoring the same flex classes.
 *
 * Flat named exports, never a dotted compound: a 'use client' object export
 * becomes one client-reference whose `.Root` reads `undefined` from a Server
 * Component (see components/ui/view-toggle.tsx).
 */

import * as React from 'react'

import { cn } from '@/lib/utils'

interface SlotProps {
  className?: string
  children?: React.ReactNode
}

/** The outermost stack: the row(s) above, an optional footer below. */
export function ListToolbarRoot({ className, children }: SlotProps) {
  return <div className={cn('flex flex-col gap-3', className)}>{children}</div>
}

/**
 * One toolbar row: leading area on the left, controls group on the right, wrapping
 * on narrow widths. Not `role="toolbar"` — that would make the whole row one
 * arrow-key stop and fight the roving focus each segmented control owns.
 */
export function ListToolbarRow({ className, children }: SlotProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The leading slot — typically the search field. */
export function ListToolbarLeading({ className, children }: SlotProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {children}
    </div>
  )
}

/** The trailing controls group — the filter, sort, view switch. */
export function ListToolbarControls({ className, children }: SlotProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {children}
    </div>
  )
}

/** A plain slot rendered under the list — page size beside the count/pager. */
export function ListToolbarFooter({ className, children }: SlotProps) {
  return <div className={cn(className)}>{children}</div>
}
