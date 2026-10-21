import { BrandMark } from '@/components/brand-mark'
import { APP_NAME, ORG_NAME } from '@/lib/app-config'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
} from '@/components/ui/sidebar'
import { type Role } from '@/lib/auth/rbac'

import { AppSidebarItem } from './app-sidebar-item'
import { filterNavByRole, type NavSection } from './nav-config'

interface AppSidebarProps {
  role: Role
  sections: NavSection[]
}

export function AppSidebar({ role, sections }: AppSidebarProps) {
  const visibleSections = filterNavByRole(sections, role)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1.5 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <BrandMark className="size-8 shrink-0" />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">{ORG_NAME}</span>
            <span className="text-[11px] text-muted-foreground">
              {APP_NAME}
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {visibleSections.map((section, index) => (
          // `py-0` when collapsed. The group's vertical padding exists to give
          // its LABEL room; collapsed, the label is hidden and the padding
          // outlives its reason — two groups then meet with 16px of unexplained
          // air while the buttons inside each touch, so the rail reads as
          // randomly spaced rather than grouped. Grouping is simply not
          // expressed at this width; it returns with the labels on expand.
          <SidebarGroup
            key={section.title ?? index}
            className="group-data-[collapsible=icon]:py-0"
          >
            {section.title ? (
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            ) : null}
            <SidebarMenu>
              {section.items.map((item) => (
                <AppSidebarItem
                  key={item.href}
                  href={item.href}
                  title={item.title}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </AppSidebarItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
