'use client'

import {
  AlertCircleIcon,
  ArchiveIcon,
  BanknoteIcon,
  CheckIcon,
  CopyIcon,
  GaugeIcon,
  Maximize2Icon,
  MessageSquareTextIcon,
  Minimize2Icon,
  RotateCcwIcon,
  ScaleIcon,
  SparklesIcon,
  SquarePenIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import { AssistantAnswer } from './assistant-answer'
import { AssistantComposer } from './assistant-composer'
import type { AssistantContext, ChatMessage } from './assistant-types'

/** The Asisten's own examples (overview-project.md, "Asisten"). */
const suggestions: { icon: LucideIcon; title: string; question: string }[] = [
  {
    icon: SparklesIcon,
    title: 'Fintech sangat cocok',
    question: 'Fintech yang sangat cocok',
  },
  {
    icon: ArchiveIcon,
    title: 'Berkualitas, di luar fokus',
    question: 'Yang berkualitas tapi di luar fokus',
  },
  {
    icon: GaugeIcon,
    title: 'Alasan skor',
    question: 'Kenapa skor Panen Kita segitu?',
  },
  {
    icon: ScaleIcon,
    title: 'Bandingkan proposal',
    question: 'Bandingkan Tani Maju dan SawahKu',
  },
  {
    icon: MessageSquareTextIcon,
    title: 'Pertanyaan untuk founder',
    question: 'Buatkan pertanyaan untuk founder Tani Maju',
  },
  {
    icon: BanknoteIcon,
    title: 'Dana di bawah Rp3 M',
    question: 'Berapa yang minta di bawah Rp3 M?',
  },
]

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label="Salin jawaban"
      title="Salin jawaban"
      className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          toast.error('Gagal menyalin')
        }
      }}
    >
      {done ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {done ? 'Disalin' : 'Salin'}
    </button>
  )
}

function AisaAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm',
        className,
      )}
    >
      <SparklesIcon className="size-4" />
    </span>
  )
}

export interface AssistantDrawerProps {
  expanded: boolean
  messages: ChatMessage[]
  busy: boolean
  context: AssistantContext | null
  onSend: (text: string) => void
  onStop: () => void
  onRetry: (message: ChatMessage) => void
  onClear: () => void
  onClose: () => void
  onExpandedChange: (expanded: boolean) => void
}

export function AssistantDrawer({
  expanded,
  messages,
  busy,
  context,
  onSend,
  onStop,
  onRetry,
  onClear,
  onClose,
  onExpandedChange,
}: AssistantDrawerProps) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, expanded])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (expanded) onExpandedChange(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, onExpandedChange, onClose])

  return (
    <aside
      id="aisa-assistant"
      aria-label="Asisten AISA"
      data-expanded={expanded}
      className={cn(
        'fixed z-50 flex animate-in overflow-hidden bg-card text-card-foreground duration-200 fade-in',
        expanded
          ? 'inset-0'
          : 'inset-x-3 bottom-[4.75rem] h-[min(calc(100svh-6rem),680px)] origin-bottom-right rounded-2xl border shadow-2xl zoom-in-95 slide-in-from-bottom-4 sm:inset-x-auto sm:right-5 sm:bottom-[5.25rem] sm:w-[420px]',
      )}
    >
      {expanded && (
        <div className="hidden w-72 shrink-0 flex-col gap-6 border-r bg-muted/40 p-4 lg:flex">
          <button
            type="button"
            onClick={onClear}
            disabled={!messages.length}
            className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <SquarePenIcon className="size-4" />
            Percakapan baru
          </button>
          <div className="space-y-1">
            <p className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Coba tanyakan
            </p>
            {suggestions.map((item) => (
              <button
                key={item.question}
                type="button"
                disabled={busy}
                onClick={() => onSend(item.question)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </button>
            ))}
          </div>
          {context && (
            <div className="mt-auto space-y-3 rounded-xl border bg-card p-3">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Data saat ini
              </p>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Total proposal</dt>
                <dd className="font-semibold tabular-nums">{context.total}</dd>
                <dt className="text-muted-foreground">Belum ditanggapi</dt>
                <dd className="font-semibold tabular-nums">
                  {context.unresponded}
                </dd>
                <dt className="text-muted-foreground">
                  Sangat cocok, menunggu
                </dt>
                <dd className="font-semibold tabular-nums">
                  {context.topUnresponded}
                </dd>
              </dl>
            </div>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
          <AisaAvatar />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-tight font-semibold">
              Tanya AISA
            </p>
            <p className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  !context
                    ? 'bg-muted-foreground/50'
                    : context.paused
                      ? 'bg-warning'
                      : 'bg-success',
                )}
              />
              <span className="truncate">
                {context?.paused
                  ? 'Dijeda (STOP) · pertanyaan belum dijawab'
                  : 'Asisten yang sama di WhatsApp'}
              </span>
            </p>
          </div>
          <IconButton
            label="Percakapan baru"
            onClick={onClear}
            disabled={!messages.length}
          >
            <SquarePenIcon className="size-4" />
          </IconButton>
          <IconButton
            label={expanded ? 'Kecilkan jendela' : 'Layar penuh'}
            onClick={() => onExpandedChange(!expanded)}
          >
            {expanded ? (
              <Minimize2Icon className="size-4" />
            ) : (
              <Maximize2Icon className="size-4" />
            )}
          </IconButton>
          <IconButton label="Tutup asisten" onClick={onClose}>
            <XIcon className="size-4" />
          </IconButton>
        </header>

        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto"
          aria-live="polite"
        >
          <div
            className={cn(
              'mx-auto flex w-full flex-col gap-5 px-4 py-5',
              expanded && 'max-w-3xl py-8',
            )}
          >
            {messages.length === 0 ? (
              <div
                className={cn(
                  'flex flex-col gap-6 pt-4',
                  expanded && 'items-center pt-[8vh] text-center',
                )}
              >
                <div
                  className={cn(
                    'space-y-3',
                    expanded && 'flex flex-col items-center',
                  )}
                >
                  <AisaAvatar
                    className={cn('size-11', expanded && 'size-14')}
                  />
                  <div className="space-y-1">
                    <h2
                      className={cn(
                        'text-xl font-semibold tracking-tight',
                        expanded && 'text-3xl',
                      )}
                    >
                      Halo
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Ada yang mau ditanyakan soal{' '}
                      {context ? `${context.total} proposal` : 'proposal'}?
                      Jawaban diambil langsung dari data AISA.
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    'grid w-full gap-2',
                    expanded ? 'max-w-2xl sm:grid-cols-2' : 'grid-cols-1',
                  )}
                >
                  {suggestions.slice(0, expanded ? 4 : 3).map((item) => (
                    <button
                      key={item.question}
                      type="button"
                      aria-label={item.question}
                      onClick={() => onSend(item.question)}
                      className="group flex items-start gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          “{item.question}”
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
                      {message.content}
                    </p>
                  </div>
                ) : message.role === 'error' ? (
                  <div key={message.id} className="flex gap-3" role="alert">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                      <AlertCircleIcon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm leading-relaxed break-words text-danger">
                        {message.content}
                      </p>
                      {message.question && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRetry(message)}
                          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <RotateCcwIcon className="size-3.5" />
                          Coba lagi
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex gap-3">
                    <AisaAvatar className="mt-0.5 size-7 [&_svg]:size-3.5" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <AssistantAnswer text={message.content} />
                      <CopyButton text={message.content} />
                    </div>
                  </div>
                ),
              )
            )}
            {busy && (
              <output className="flex items-center gap-3">
                <AisaAvatar className="size-7 [&_svg]:size-3.5" />
                <span className="inline-flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-3">
                  <span className="sr-only">AISA sedang menganalisis</span>
                  {[0, 150, 300].map((ms) => (
                    <span
                      key={ms}
                      className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                      style={{ animationDelay: `${ms}ms` }}
                    />
                  ))}
                </span>
              </output>
            )}
          </div>
        </div>

        <div className={cn('shrink-0 px-3 pb-3', expanded && 'px-4 pb-5')}>
          <div
            className={cn('mx-auto w-full space-y-2', expanded && 'max-w-3xl')}
          >
            {messages.length > 0 && !expanded && (
              <div className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-0.5">
                {suggestions.map((item) => (
                  <button
                    key={item.question}
                    type="button"
                    disabled={busy}
                    onClick={() => onSend(item.question)}
                    className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
            <AssistantComposer
              busy={busy}
              onSend={onSend}
              onStop={onStop}
              focusOnMount
            />
            <p className="text-center text-[11px] text-muted-foreground">
              Jawaban diambil dari data proposal. Keputusan tetap di tangan
              Anda.
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
