import * as React from 'react'

import { cn } from '@/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    // No `flex`/`min-w-0` wrapper, deliberately. One would be needed
    // because a scroll container only gets `automatic minimum size = 0` as a
    // flex/grid item — otherwise min-content width propagates up and scrolls the
    // PAGE. That is already answered ABOVE this component: `sidebar-wrapper`
    // and both of AppShell's `sidebar-inset` wrappers carry `min-w-0`
    // (components/shell/app-shell.tsx). Measured at a 420px
    // viewport with a 3164px table — the container scrolls, the page does not.
    // So a table that ever scrolls the page is a missing `min-w-0` in THAT
    // page's layout, not a missing wrapper here.
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        // `[&>tr]:bg-transparent` because TableRow now carries an explicit
        // `bg-background` (so sticky cells can inherit an opaque colour) — without
        // this, a footer row would paint over the muted footer tint below.
        'border-t bg-muted/50 font-medium [&>tr]:bg-transparent [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // The explicit `bg-background` is LOAD-BEARING, not cosmetic. A sticky
        // cell inside the row (the right-pinned actions column) has to be OPAQUE
        // to cover cells scrolling under it, and it gets that by inheriting THIS
        // background (`bg-inherit`) — which is what keeps it tracking default →
        // hover → selected without restating any of the colors below. Drop this
        // and an inheriting cell falls back to transparent.
        'border-b bg-background transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50',
        // Selection paints itself off the checkbox already in the row, NOT off a
        // `data-state="selected"` the row is handed. shadcn's stock rule is that
        // second thing, and it is unreachable here twice over: this repo's
        // Checkbox is Base UI (`data-checked`, never Radix's
        // `data-state="checked"`), and selection lives in a client store that
        // `DataTable` — a Server Component — cannot read to hand anything down.
        // `:has()` closes both gaps with no state and no prop.
        'has-[[data-slot=checkbox][data-checked]]:bg-muted',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
