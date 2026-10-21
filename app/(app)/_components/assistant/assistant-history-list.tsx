'use client'

import {
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import {
  RENAME_MAX,
  cleanTitle,
  describeTime,
  groupByDate,
  matchesQuery,
  type Conversation,
} from './assistant-history'

export interface AssistantHistoryListProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  /** The open conversation has no messages yet, so "new" would change nothing. */
  newDisabled?: boolean
  autoFocusSearch?: boolean
  className?: string
}

/**
 * The saved conversations, ChatGPT-style: a new-conversation button, a search
 * over titles and messages, then date sections (WIB) with sticky headers. Each
 * row opens on click or Enter; its ⋯ menu renames in place or deletes after a
 * confirm. Up/Down move between rows.
 */
export function AssistantHistoryList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  newDisabled,
  autoFocusSearch,
  className,
}: AssistantHistoryListProps) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Conversation | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const now = Date.now()

  const groups = groupByDate(
    conversations.filter((c) => matchesQuery(c, query)),
    now,
  )

  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const rows = [
      ...(list.current?.querySelectorAll<HTMLElement>('[data-history-row]') ??
        []),
    ]
    const at = rows.indexOf(document.activeElement as HTMLElement)
    if (at === -1) return
    event.preventDefault()
    rows[
      (at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
    ]?.focus()
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-2 px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          disabled={newDisabled}
          className="flex h-10 w-full items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted disabled:opacity-50"
        >
          <SquarePenIcon className="size-4" />
          Percakapan baru
        </button>
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation()
                setQuery('')
              }
            }}
            // A drawer opened on purpose: the search is where the hand goes next.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocusSearch}
            placeholder="Cari percakapan"
            aria-label="Cari percakapan"
            className="h-9 w-full rounded-lg border bg-background pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-4 focus:ring-primary/15"
          />
          {query && (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav
        ref={list}
        aria-label="Riwayat percakapan"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        {conversations.length === 0 ? (
          <div className="mx-1 mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center">
            <MessageSquareTextIcon className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">Belum ada percakapan</p>
            <p className="text-xs text-muted-foreground">
              Pertanyaan yang Anda kirim tersimpan di sini, di browser ini.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-3 pt-4 text-sm text-muted-foreground">
            Tidak ada percakapan yang cocok dengan “{query.trim()}”.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="sticky top-0 z-10 bg-sidebar px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </h3>
              <ul className="space-y-px">
                {group.conversations.map((c) => (
                  <li key={c.id}>
                    {editing === c.id ? (
                      <RenameField
                        initial={c.title}
                        onDone={(title) => {
                          setEditing(null)
                          if (title) onRename(c.id, title)
                        }}
                      />
                    ) : (
                      <HistoryRow
                        conversation={c}
                        active={c.id === activeId}
                        when={describeTime(c.updatedAt, now)}
                        onSelect={() => onSelect(c.id)}
                        onRename={() => setEditing(c.id)}
                        onDelete={() => setDeleting(c)}
                        onKeyDown={moveFocus}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus percakapan?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” akan dihapus dari riwayat di browser ini.
              Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) onDelete(deleting.id)
                setDeleting(null)
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function HistoryRow({
  conversation,
  active,
  when,
  onSelect,
  onRename,
  onDelete,
  onKeyDown,
}: {
  conversation: Conversation
  active: boolean
  when: string
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
  onKeyDown: React.KeyboardEventHandler
}) {
  return (
    <div
      className={cn(
        'group/row relative flex items-center rounded-lg transition-colors',
        active
          ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <button
        type="button"
        data-history-row
        onClick={onSelect}
        onKeyDown={onKeyDown}
        aria-current={active ? 'page' : undefined}
        title={`${conversation.title}\nDiperbarui ${when}`}
        className="min-w-0 flex-1 truncate rounded-lg py-2 pr-9 pl-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {conversation.title}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Pilihan untuk ${conversation.title}`}
          className="absolute right-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-popup-open:bg-muted data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onRename}>
            <PencilIcon />
            Ganti nama
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon />
            Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Enter or leaving the field saves; Escape cancels. An empty name is not saved. */
function RenameField({
  initial,
  onDone,
}: {
  initial: string
  onDone: (title: string | null) => void
}) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (title: string | null) => {
    if (done.current) return
    done.current = true
    onDone(title)
  }
  return (
    <input
      // Opened from "Ganti nama": typing is the only thing to do next.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      value={value}
      maxLength={RENAME_MAX}
      aria-label="Nama percakapan"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(cleanTitle(value))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(cleanTitle(value))
        } else if (event.key === 'Escape') {
          event.stopPropagation()
          finish(null)
        }
      }}
      className="h-9 w-full rounded-lg border border-primary/60 bg-card px-3 text-sm ring-4 ring-primary/15 outline-none"
    />
  )
}
