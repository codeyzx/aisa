'use client'

/**
 * zustand — LAST resort (see docs/reference/contracts/ui.md), and this file is the
 * honest argument for why it is last.
 *
 * The state: whether the asset list renders compact. It is client-only, ephemeral,
 * and personal — not data (so not Firestore), and not something you would want to
 * survive a shared link (so not the URL). By the state rule's list, that is
 * exactly the shape zustand is for: "client UI prefs".
 *
 * The structural argument FOR a store here: the toggle and the thing it restyles
 * are two separate islands in two different cards, and their nearest common
 * ancestor is `page.tsx` — a SERVER Component, which cannot hold `useState`.
 * There is no client parent to lift into.
 *
 * The honest counter-argument, which is the state rule's own point: Context could still do
 * this. The RSC could render `<DensityProvider>` around both cards and pass the
 * server-rendered children straight through, exactly the way `DensityScope`
 * below already does. zustand's edge over that is narrow — no provider to thread
 * through the tree, and a selector-subscribed component re-renders only when its
 * slice changes rather than the whole provider subtree.
 *
 * So: on THIS page zustand is a demonstration, not a necessity. That is the
 * finding, not a gap. Reach for it when the provider would have to span
 * genuinely distant subtrees, or when updates are frequent enough that Context's
 * re-render-the-subtree cost bites (a drag position, a live cursor, an
 * optimistic queue). Until one of those is true, the ladder above it — URL,
 * server, Context — has not run out.
 *
 * Module-level store = ONE instance per browser tab, created on first import.
 * That is correct for client-only prefs and WRONG for anything per-request: on
 * the server a module-level store is shared across every user's render. If state
 * ever needs server-initial values, it needs a per-request store in a provider —
 * at which point Context is back in the picture anyway.
 */
import { type ReactNode } from 'react'
import { create } from 'zustand'

import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

interface DensityState {
  compact: boolean
  setCompact: (compact: boolean) => void
}

const useDensityStore = create<DensityState>((set) => ({
  compact: false,
  setCompact: (compact) => set({ compact }),
}))

/** Island 1: writes. Lives in the zustand card. */
export function DensityToggle() {
  // Subscribe to slices, never `useDensityStore()` bare — the bare call
  // re-renders on every store change, including slices you do not read.
  const compact = useDensityStore((state) => state.compact)
  const setCompact = useDensityStore((state) => state.setCompact)

  return (
    <div className="flex items-center gap-2">
      {/* aria-label, not a <Label htmlFor>: Base UI's Switch renders a
          role="switch" BUTTON, and `for` may only target a labelable element. */}
      <Switch
        aria-label="Baris ringkas"
        checked={compact}
        onCheckedChange={setCompact}
      />
      <span className="text-sm font-medium">Baris ringkas</span>
    </div>
  )
}

interface DensityScopeProps {
  children: ReactNode
}

/**
 * Island 2: reads. Lives in the server-state card, wrapping SERVER-rendered
 * rows. `children` arrives as an already-rendered RSC payload passed through a
 * client component — the list stays a Server Component, and only this thin
 * wrapper ships to the browser.
 */
export function DensityScope({ children }: DensityScopeProps) {
  const compact = useDensityStore((state) => state.compact)

  return (
    <ul
      data-density={compact ? 'compact' : 'comfortable'}
      className={cn(
        'divide-y divide-border rounded-lg border',
        compact ? 'text-xs [&>li]:py-1' : 'text-sm [&>li]:py-2',
      )}
    >
      {children}
    </ul>
  )
}
