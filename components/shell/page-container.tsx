// Compound page container (Base UI style): `<Page.Root>` / `<Page.Header>` /
// `<Page.ActionBar>`.
//
//   import { Page } from '@/components/shell/page-container'
//   <Page.Root>
//     <Page.Header title="…" description="…">{actions}</Page.Header>
//     …content…
//     <Page.ActionBar>{buttons}</Page.ActionBar>
//   </Page.Root>
//
// NOTE: no 'use client' — the parts are presentational (no hooks/state), so the
// `Page` object stays a plain value across imports and its dotted parts render
// inside Server Components. Adding 'use client' would turn `Page` into a
// client-reference whose `.Root` reads as undefined in a Server Component.

import { type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface RootProps {
  children: ReactNode
  /**
   * Tunes width — list pages stay full-bleed; forms pass e.g.
   * `mx-auto w-full max-w-2xl`.
   *
   * `w-full` is NOT optional there. This lands as a child of the shell's
   * `flex-col` content area, and auto margins on a flex item's cross axis
   * suppress the default `align-items: stretch` — so `mx-auto max-w-2xl` alone
   * makes the box shrink to FIT-CONTENT and centre that, and `max-w-2xl` never
   * comes into play because the width never reaches it. It reads as a correct
   * block-layout idiom, which is why it survives review; both example form
   * pages shipped ~80px-wide inputs on it.
   */
  className?: string
}

function Root({ children, className }: RootProps) {
  return <div className={cn('space-y-6', className)}>{children}</div>
}

interface HeaderProps {
  /** Small primary-tinted kicker above the title (e.g. section name). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-aligned actions (buttons). */
  children?: ReactNode
  className?: string
}

function Header({
  eyebrow,
  title,
  description,
  children,
  className,
}: HeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}

/**
 * Sticky footer actions — a right-aligned blurred bar that keeps the primary
 * action reachable on tall pages.
 */
type ActionBarProps = ComponentProps<'div'>

function ActionBar({ className, children, ...props }: ActionBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 mt-2 flex items-center justify-end gap-2 rounded-xl p-2 ring-1 ring-border/60 backdrop-blur-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export const Page = { Root, Header, ActionBar }
