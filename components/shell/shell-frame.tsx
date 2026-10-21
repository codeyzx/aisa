'use client'

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SunIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
} from '@/components/ui/sidebar-cookie'
import { type Session } from '@/lib/auth/session.contract'

import { CommandMenu, type CommandPage } from './command-menu'
import { NotificationsMenu } from './notifications-menu'
import { type ShellData } from './shell-data'
import {
  greeting,
  isRouteActive,
  nextDigestSlot,
  routeHeading,
  type DigestSlot,
} from './shell-routes'
import { UserMenu } from './user-menu'

export interface ShellNavItem {
  href: string
  title: string
  icon: ReactNode
}

export interface ShellNavGroup {
  label: string | null
  items: ShellNavItem[]
}

interface ShellFrameProps {
  session: Session
  nav: ShellNavGroup[]
  pages: CommandPage[]
  data: ShellData
  /** Server-read cookie, so the first HTML already has the right layout. */
  sidebarOpen: boolean
  /** Server's view of the next slot; the browser re-reads its clock on mount. */
  initialSlot: DigestSlot
  mainId: string
  dock: ReactNode
  children: ReactNode
}

const PROPOSAL_HREF = '/proposal'

const subscribeNever = () => () => {}

export function ShellFrame({
  session,
  nav,
  pages,
  data,
  sidebarOpen: initialOpen,
  initialSlot,
  mainId,
  dock,
  children,
}: ShellFrameProps) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  // The theme is only known in the browser; the first icon follows the server HTML.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  const dark = mounted && resolvedTheme === 'dark'
  const [now, setNow] = useState<Date | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(initialOpen)

  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), 0)
    return () => clearTimeout(timer)
  }, [])

  const toggleSidebar = () => {
    const next = !sidebarOpen
    setSidebarOpen(next)
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }

  const heading = routeHeading(pathname, data.pending)
  const subtitle = heading.greets && now ? greeting(now) : heading.subtitle
  const slot = now ? nextDigestSlot(now) : initialSlot

  return (
    <div className="a-app">
      <div className="a-shell" data-side={sidebarOpen ? 'on' : 'off'}>
        <aside className="a-side" aria-label="Navigasi">
          <div className="a-side-head">
            <Link href="/dashboard" className="a-logo">
              <Image
                className="a-mark"
                src="/aisa-logo-v2.svg"
                alt="Logo AISA"
                width={30}
                height={30}
              />
              <span>
                <b>AISA</b>
                <span>by Aixel</span>
              </span>
            </Link>
            <button
              className="a-icon-btn"
              type="button"
              onClick={toggleSidebar}
              aria-label="Sembunyikan sidebar"
              title="Sembunyikan sidebar"
            >
              <PanelLeftCloseIcon className="a-ic" />
            </button>
          </div>

          <nav className="a-nav">
            {nav.map((group, index) => (
              <div key={group.label ?? index} className="a-navgroup">
                {group.label ? (
                  <p className="a-navlabel">{group.label}</p>
                ) : null}
                {group.items.map((item) => {
                  const active = isRouteActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-active={active}
                      // The highlight is CSS-only; this carries "you are here"
                      // to assistive tech from the same computation.
                      aria-current={active ? 'page' : undefined}
                      title={item.title}
                    >
                      {item.icon}
                      <span className="a-label">{item.title}</span>
                      {item.href === PROPOSAL_HREF && data.pending > 0 ? (
                        <span className="a-badge">{data.pending}</span>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="a-sidefoot">
            <div className="a-next">
              <p className="a-next-label">Ringkasan WhatsApp</p>
              <p>
                Berikutnya <b className="a-num">{slot}</b>
              </p>
              <p>{data.pending} proposal menunggu keputusan</p>
            </div>
          </div>
        </aside>

        <div className="a-work">
          <header className="a-top">
            {!sidebarOpen ? (
              <button
                className="a-icon-btn a-icon-btn-lg"
                type="button"
                onClick={toggleSidebar}
                aria-label="Tampilkan sidebar"
                title="Tampilkan sidebar"
              >
                <PanelLeftOpenIcon className="a-ic" />
              </button>
            ) : null}
            <div className="a-pt">
              <h1>{heading.title}</h1>
              {subtitle ? <span>{subtitle}</span> : null}
            </div>
            <CommandMenu pages={pages} proposals={data.proposals} />
            <NotificationsMenu
              notifications={data.notifications}
              latestDigestAt={data.latestDigestAt}
            />
            <button
              className="a-icon-btn a-icon-btn-lg"
              type="button"
              onClick={() => setTheme(dark ? 'light' : 'dark')}
              aria-label={dark ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              title={dark ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
            >
              {dark ? (
                <SunIcon className="a-ic" />
              ) : (
                <MoonIcon className="a-ic" />
              )}
            </button>
            <UserMenu session={session} />
          </header>
          {/* The `<main>` landmark holds the page and nothing repeated.
              `tabIndex={-1}` is what lets the skip link actually MOVE focus:
              browsers only focus a fragment target that is focusable. */}
          <main id={mainId} tabIndex={-1} className="a-content outline-none">
            {children}
          </main>
        </div>

        {dock}
      </div>
    </div>
  )
}
