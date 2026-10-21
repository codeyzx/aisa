'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Theme transport for the whole app. Deliberately thin: it configures
 * next-themes and nothing else.
 *
 * There is NO global keyboard shortcut here, on purpose. A single UNMODIFIED
 * letter bound at `window` level is a trap rather than a feature: voice-control
 * users dictate bare letters, switch and on-screen-keyboard users emit them, and
 * every surface the handler's "is the user typing?" guard fails to recognise —
 * a canvas editor, a custom combobox, an input inside a shadow root, a
 * same-origin iframe — silently loses the keystroke to a theme flip instead.
 * It is also undiscoverable: nothing on screen ever announces it, so the people
 * who trip it are exactly the people who cannot find out why. The VISIBLE
 * controls — the shell's theme button, the command menu entry and the
 * Pengaturan appearance tab — are the whole affordance.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
