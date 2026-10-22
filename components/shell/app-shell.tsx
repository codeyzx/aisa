import { type ReactNode } from 'react'

import { type Session } from '@/lib/auth/session'

import { filterNavByRole, type NavSection } from './nav-config'
import { type ShellData } from './shell-data'
import { ShellFrame } from './shell-frame'
import { type NextDigest } from './shell-routes'

/**
 * The `<main>` landmark's stable id — the skip link's target. Spelled once: an
 * `href` pointing at an id that no longer exists is a skip link that silently
 * does nothing.
 */
export const MAIN_CONTENT_ID = 'main-content'

interface AppShellProps {
  session: Session
  sections: NavSection[]
  data: ShellData
  /** The sidebar's persisted state, read from the cookie by the server layout. */
  sidebarOpen: boolean
  initialNext: NextDigest
  /** Floating panel mounted beside the work area (the assistant). */
  dock?: ReactNode
  children: ReactNode
}

/**
 * Composes the authenticated shell. A Server Component so it can render the
 * role-filtered nav's icons here — a component reference cannot cross into the
 * client frame as a prop, a rendered element can.
 */
export function AppShell({
  session,
  sections,
  data,
  sidebarOpen,
  initialNext,
  dock,
  children,
}: AppShellProps) {
  const visible = filterNavByRole(sections, session.role)
  const nav = visible.map((section) => ({
    label: section.title ?? null,
    items: section.items.map((item) => ({
      href: item.href,
      title: item.title,
      icon: <item.icon className="a-ic" />,
    })),
  }))
  const pages = visible.flatMap((section) =>
    section.items.map((item) => ({
      href: item.href,
      title: item.title,
      icon: <item.icon />,
    })),
  )

  return (
    <>
      {/* FIRST focusable thing in the document, deliberately: without it,
          reaching the content by keyboard costs a tab per nav link on every
          navigation. `focus:` rather than `focus-visible:`, so it never moves
          focus somewhere invisible. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Lewati ke konten utama
      </a>
      <ShellFrame
        session={session}
        nav={nav}
        pages={pages}
        data={data}
        sidebarOpen={sidebarOpen}
        initialNext={initialNext}
        mainId={MAIN_CONTENT_ID}
        dock={dock}
      >
        {children}
      </ShellFrame>
    </>
  )
}
