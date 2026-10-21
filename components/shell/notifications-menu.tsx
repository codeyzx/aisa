'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellIcon, BellOffIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { cn } from '@/lib/utils'

import { type ShellNotification } from './shell-data'

/**
 * Read state is this browser's own: the audit rows are shared, but "have I seen
 * it" belongs to the viewer, and the data model has no per-user read field. So
 * it lives in localStorage — a cleared store only makes rows read as new again.
 */
const STORAGE_KEY = 'aisa-notifications'

interface ReadState {
  /** ISO instant; rows at or before it are read. */
  seenAt: string | null
  /** Rows opened individually after `seenAt`. */
  readIds: string[]
}

function loadReadState(): ReadState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ReadState>
    return {
      seenAt: typeof parsed.seenAt === 'string' ? parsed.seenAt : null,
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
    }
  } catch {
    return null
  }
}

function saveReadState(state: ReadState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage blocked: read state simply does not persist.
  }
}

const stampFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

interface NotificationsMenuProps {
  notifications: ShellNotification[]
  /** Baseline for a viewer who has never opened the bell: rows after the latest ringkasan are new. */
  latestDigestAt: string | null
}

export function NotificationsMenu({
  notifications,
  latestDigestAt,
}: NotificationsMenuProps) {
  const [open, setOpen] = useState(false)
  // null until mounted: the server cannot know this browser's read state, and
  // a guessed dot would flicker away on hydration.
  const [readState, setReadState] = useState<ReadState | null>(null)

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setReadState(
          loadReadState() ?? { seenAt: latestDigestAt, readIds: [] },
        ),
      0,
    )
    return () => clearTimeout(timer)
  }, [latestDigestAt])

  const isUnread = (n: ShellNotification) =>
    readState !== null &&
    !readState.readIds.includes(n.id) &&
    (readState.seenAt === null || n.at > readState.seenAt)
  const unread = notifications.filter(isUnread).length

  const update = (next: ReadState) => {
    // Keep only ids still on screen, so the stored list cannot grow unbounded.
    const visible = new Set(notifications.map((n) => n.id))
    const trimmed = {
      ...next,
      readIds: next.readIds.filter((id) => visible.has(id)),
    }
    setReadState(trimmed)
    saveReadState(trimmed)
  }

  const markAllRead = () => {
    const newest = notifications.reduce<string | null>(
      (max, n) => (max === null || n.at > max ? n.at : max),
      readState?.seenAt ?? null,
    )
    update({ seenAt: newest, readIds: [] })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-9"
            aria-label={
              unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'
            }
          />
        }
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] gap-0 p-0 sm:w-80"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-medium">Notifikasi</p>
          {unread > 0 ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={markAllRead}
            >
              Tandai semua dibaca
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOffIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Belum ada notifikasi</p>
            </div>
          ) : (
            notifications.map((n) => {
              const fresh = isUnread(n)
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => {
                    setOpen(false)
                    if (fresh && readState)
                      update({
                        ...readState,
                        readIds: [...readState.readIds, n.id],
                      })
                  }}
                  className="flex gap-3 rounded-md px-3 py-2.5 hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      fresh ? 'bg-primary' : 'bg-transparent',
                    )}
                  />
                  <div className="min-w-0 space-y-0.5">
                    <p className={cn('text-sm', fresh && 'font-medium')}>
                      {n.title}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {n.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stampFormatter.format(new Date(n.at))}
                    </p>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
