'use client'

/**
 * React Context as the backbone of a compound component (see
 * docs/reference/contracts/ui.md) — the fourth state
 * mechanism, and the one that is NOT a state container at all. Context does not
 * store state; it TRANSPORTS it down a subtree so siblings can share what a
 * parent owns without prop-drilling through whatever sits between them.
 *
 *   <NotesRoot>            owns `open` (plain useState) + mints the panel id
 *     <NotesTrigger>       reads both — label flips, aria-controls/-expanded wire up
 *     <NotesPanel>         reads both — renders when open, carries the id
 *   </NotesRoot>
 *
 * Why Context and not props: the two parts must agree on a value neither of them
 * owns (`panelId`, from `useId`), and the caller composes them in any order,
 * with any markup in between. Passing `panelId` down by hand means every call
 * site can get the a11y wiring wrong; here it cannot.
 *
 * Why this is NOT a zustand candidate: the state is scoped to one subtree, has a
 * natural owner (Root), and updates on a click. Context's re-render cost — the
 * whole consuming subtree on every change — is the reason the state rule bars it
 * from high-frequency state, and the reason it is perfect here.
 *
 * FLAT NAMED EXPORTS, not `export const Notes = { Root, Trigger, Panel }`. This
 * module is 'use client', and a client module's object export becomes a single
 * client-reference whose `.Root` reads `undefined` from a Server Component.
 * `components/shell/page.tsx` gets to be `Page.Root` only because it has no
 * 'use client' — the moment a compound needs a hook, it loses the dot.
 *
 * Local to this example on purpose: it is teaching material, not kit. A real
 * disclosure belongs in `components/ui` on top of Base UI's Collapsible — do not
 * promote this one.
 */
import {
  createContext,
  use,
  useCallback,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

interface NotesContextValue {
  open: boolean
  toggle: () => void
  /** Shared so the trigger can point `aria-controls` at the panel. */
  panelId: string
}

const NotesContext = createContext<NotesContextValue | null>(null)

/**
 * Throwing (rather than defaulting) is the point of the null default: a part
 * rendered outside its Root is a composition bug, and it should fail loudly at
 * the boundary instead of silently rendering a dead button.
 */
function useNotes(part: string): NotesContextValue {
  const context = use(NotesContext)
  if (!context) throw new Error(`<${part}> must be rendered inside <NotesRoot>`)
  return context
}

interface NotesRootProps {
  children: ReactNode
  className?: string
}

export function NotesRoot({ children, className }: NotesRootProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  // Memoized because a Context value is compared by IDENTITY: an object literal
  // in the render body is a new reference every render, so every consumer in the
  // subtree re-renders even when nothing it reads changed. This is Context's
  // headline cost, and the reason the state rule keeps high-frequency state out of it — at
  // that point the memo stops helping, because the value really does change.
  const toggle = useCallback(() => setOpen((current) => !current), [])
  const value = useMemo(
    () => ({ open, toggle, panelId }),
    [open, toggle, panelId],
  )

  return (
    <NotesContext value={value}>
      <div className={cn('space-y-2', className)}>{children}</div>
    </NotesContext>
  )
}

interface NotesTriggerProps {
  children: ReactNode
}

export function NotesTrigger({ children }: NotesTriggerProps) {
  const { open, toggle, panelId } = useNotes('NotesTrigger')

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={panelId}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronRight
        className={cn('size-3.5 transition-transform', open && 'rotate-90')}
      />
      {children}
    </button>
  )
}

interface NotesPanelProps {
  children: ReactNode
}

export function NotesPanel({ children }: NotesPanelProps) {
  const { open, panelId } = useNotes('NotesPanel')
  if (!open) return null

  return (
    <div
      id={panelId}
      className="border-l-2 border-border pl-3 text-xs text-muted-foreground"
    >
      {children}
    </div>
  )
}
