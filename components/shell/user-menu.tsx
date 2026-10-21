'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { ChevronDownIcon, LogOutIcon, UserIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROLE_LABEL } from '@/lib/auth/rbac'
import { type Session } from '@/lib/auth/session.contract'
import { useSignOut } from '@/lib/auth/use-sign-out'
import { firebaseAuth } from '@/lib/firebase/client-auth'

function initials(text: string): string {
  const words = text.split(/[\s._@-]+/).filter(Boolean)
  const letters =
    words.length >= 2 ? words[0][0] + words[1][0] : text.slice(0, 2)
  return letters.toUpperCase() || '?'
}

/**
 * The Firebase profile name, once the browser SDK has restored the user. The
 * session cookie carries no name, so until then (or for an account without
 * one) the menu names the account by its email.
 */
function useDisplayName(): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth(), (user) =>
        setName(user?.displayName?.trim() || null),
      ),
    [],
  )
  return name
}

/** Account menu at the right of the header: view profile, sign out. */
export function UserMenu({ session }: { session: Session }) {
  const handleSignOut = useSignOut()
  const displayName = useDisplayName()
  const email = session.email ?? 'Pengguna tak dikenal'
  const name = displayName ?? email
  const mark = initials(displayName ?? session.email?.split('@')[0] ?? '?')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Menu pengguna"
            className="flex h-9 items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-muted data-popup-open:bg-muted"
          />
        }
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {mark}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-40 truncate text-[13px] font-medium">
            {name}
          </span>
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        {/* The Group is required: DropdownMenuLabel is Base UI's GroupLabel,
            which throws outside a Group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {mark}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {displayName ? `${email} · ` : ''}
                {ROLE_LABEL[session.role]}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/pengaturan?tab=profil" />}>
          <UserIcon />
          Lihat profil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOutIcon />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
