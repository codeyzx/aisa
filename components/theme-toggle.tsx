'use client'

import * as React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The app's ONLY theme switch — there is no keyboard shortcut counterpart (see
 * `components/theme-provider.tsx` for why a bare-letter global hotkey was
 * removed). Offers Terang / Gelap / Sistem via next-themes. Renders a
 * placeholder until mounted so the icon never mismatches on hydration.
 *
 * A RADIO GROUP, not plain items: the menu has to answer "which mode am I on?"
 * to someone who cannot see the tick. Base UI's `RadioItem` renders
 * `role="menuitemradio"` + `aria-checked`, so the selected mode is in the
 * accessibility tree as STATE rather than only as a check glyph. Bound to
 * `theme` (the stored preference: may be `'system'`), never `resolvedTheme` —
 * resolving would tick "Gelap" for a reader who actually chose "Sistem" and
 * make the menu lie about what is saved.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Alihkan tema" disabled>
        <Sun />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Alihkan tema" />
        }
      >
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* `closeOnClick` is opt-IN on Base UI's radio item (it defaults to
            false so a multi-choice menu can stay open). A theme pick is a
            one-shot decision, so restore the plain-item behaviour explicitly. */}
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value: string) => setTheme(value)}
        >
          <DropdownMenuRadioItem value="light" closeOnClick>
            <Sun />
            Terang
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick>
            <Moon />
            Gelap
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick>
            <Monitor />
            Sistem
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
