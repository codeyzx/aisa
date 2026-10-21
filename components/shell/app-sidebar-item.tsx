'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

interface AppSidebarItemProps {
  href: string
  title: string
  children: ReactNode
}

export function AppSidebarItem({ href, title, children }: AppSidebarItemProps) {
  const pathname = usePathname()
  // On mobile the sidebar is a Sheet; a nav click navigates but leaves the
  // sheet open over the destination. Close it on click — a no-op on desktop,
  // where `openMobile` is unused.
  const { setOpenMobile } = useSidebar()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        // The SAME `active` that paints the highlight, exposed as state. `isActive`
        // only reaches CSS (`data-active`), so without this the "you are here" fact
        // is carried by colour alone and a screen-reader user hears three identical
        // links. One computation, two consumers — never a second `pathname` compare
        // here, which is how the ring and the announcement drift apart.
        aria-current={active ? 'page' : undefined}
        tooltip={title}
        // The vendored button hardcodes `[&_svg]:size-4`, which leaves a 16px
        // icon adrift in the 32px collapsed button. This override is shell taste,
        // not a defect in the shared UI primitive.
        className="[&_svg]:size-5"
        render={<Link href={href} onClick={() => setOpenMobile(false)} />}
      >
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
