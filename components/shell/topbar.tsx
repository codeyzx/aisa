'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { LogOut, UserRoundCog } from 'lucide-react'

import { can } from '@/lib/auth/rbac'
import { type Session } from '@/lib/auth/session.contract'
import { useSignOut } from '@/lib/auth/use-sign-out'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'

function initialsFromEmail(email: string | null): string {
  if (!email) return '?'
  return email.slice(0, 2).toUpperCase()
}

interface TopbarProps {
  session: Session
  children?: ReactNode
}

export function Topbar({ session, children }: TopbarProps) {
  // Both halves of signing out — cookie AND Firebase refresh token — live in
  // `useSignOut`, shared with the mandatory password-change screen.
  const handleSignOut = useSignOut()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-4">
      <SidebarTrigger />
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Menu pengguna"
            />
          }
        >
          <Avatar size="sm">
            <AvatarFallback>{initialsFromEmail(session.email)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {/* The Group is REQUIRED, not decoration: DropdownMenuLabel renders
              Base UI's Menu.GroupLabel, which reads MenuGroupContext to register
              the group's aria-labelledby — outside a Group it throws and takes
              the whole menu down with it. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-xs font-normal text-muted-foreground">
                Masuk sebagai
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {session.email ?? 'Pengguna tak dikenal'}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          {/* Impersonation entry — shown ONLY to a session that may start an
              impersonation (`impersonation:start`), the authority this item
              exists to exercise. It links to /admin (the picker);
              `prefetch={false}` is REQUIRED so rendering/hovering never
              prefetches that route and runs `listUsers` — the roster loads only
              on an actual click. While impersonating, `session.role` is the
              target's, so `can()` is false and this disappears with no special
              case: an impersonated admin genuinely lacks `impersonation:start`.
              Every navigation mode lands on the same full page — there is no
              intercepted modal variant. */}
          {can(session, 'impersonation:start') ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href="/admin" prefetch={false} />}
                >
                  <UserRoundCog />
                  Impersonate pengguna
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
