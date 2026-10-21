'use client'

import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Chat-app style composer: the textarea grows with its text, Enter sends,
 * Shift+Enter breaks the line. While an answer is pending the send button
 * becomes "stop waiting": the Asisten still finishes on the server (the job
 * shows in Aktivitas AI), the panel just stops waiting for it.
 */
export function AssistantComposer({
  busy,
  onSend,
  onStop,
  focusOnMount,
  className,
}: {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  focusOnMount?: boolean
  className?: string
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    if (focusOnMount) ref.current?.focus()
  }, [focusOnMount])

  const submit = () => {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
    setValue('')
  }

  return (
    <form
      className={cn(
        'flex items-end gap-2 rounded-2xl border bg-background p-2 pl-4 shadow-xs transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/15',
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={4000}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder="Tanya AISA tentang proposal Anda…"
        aria-label="Pesan untuk AISA"
        className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground"
      />
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Berhenti menunggu jawaban"
          title="Berhenti menunggu jawaban"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85"
        >
          <SquareIcon className="size-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Kirim"
          title="Kirim (Enter)"
          disabled={!value.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors disabled:bg-muted disabled:text-muted-foreground"
        >
          <ArrowUpIcon className="size-4" />
        </button>
      )}
    </form>
  )
}
