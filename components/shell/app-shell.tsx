import { type ReactNode } from 'react'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { type Session } from '@/lib/auth/session'

import { AppSidebar } from './app-sidebar'
import { type NavSection } from './nav-config'
import { Topbar } from './topbar'

/**
 * The `<main>` landmark's stable id — the skip link's target, and the only
 * fragment in the app any deep link may assume. Exported rather than spelled
 * twice: an `href` pointing at an id that no longer exists is a skip link that
 * silently does nothing, and nothing in the build would notice.
 */
export const MAIN_CONTENT_ID = 'main-content'

/**
 * Composes the authenticated shell: a role-filtered sidebar beside a topbar +
 * scrollable content area. A Server Component so it can accept Server-rendered
 * `children`; the client boundary lives inside SidebarProvider / AppSidebar /
 * Topbar. `SidebarInset` is the layout column (a plain `div`); the `<main>`
 * landmark is rendered here, below the topbar, so it holds the page and nothing
 * repeated.
 */
interface AppShellProps {
  session: Session
  sections: NavSection[]
  /**
   * The sidebar's persisted open state, read from the cookie by the server
   * layout. It arrives as a PROP rather than being read here so this component
   * stays synchronous and `next/headers`-free — and so the value is present in
   * the first HTML, which is the whole point: restoring it client-side would
   * paint the sidebar open and then snap it shut. `undefined` (or a caller
   * that omits it) falls back to `SidebarProvider`'s own default.
   */
  sidebarDefaultOpen?: boolean
  children: ReactNode
}

export function AppShell({
  session,
  sections,
  sidebarDefaultOpen,
  children,
}: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen}>
      {/* FIRST focusable thing in the document, deliberately. Every page in
          this group opens with the same ~15 nav links; without this, reaching
          the actual content by keyboard costs a tab per link on every single
          navigation. `sr-only` until focused so it costs sighted readers
          nothing — `focus:` and not `focus-visible:`, because a skip link that
          only appears for "keyboard-looking" focus is a skip link that
          sometimes moves focus to somewhere invisible. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Lewati ke konten utama
      </a>
      <AppSidebar role={session.role} sections={sections} />
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-30">
          <Topbar session={session} />
        </div>
        {/* The `<main>` landmark starts HERE, below the topbar — so it holds the
            page and nothing repeated, and the `<header>` above it keeps its
            `banner` role (a `header` nested inside `main` maps to nothing).
            `tabIndex={-1}` is what makes the skip link actually MOVE focus:
            browsers only focus a fragment target that is focusable, and without
            it the URL changes, the viewport scrolls, and the next Tab resumes
            from the nav — the exact failure the link exists to prevent. */}
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
