'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { askAssistantAction } from '@/features/aisa/aisa.action'
import { settleAction } from '@/lib/data/action.contract'

import { getAssistantContextAction } from './assistant-context.action'
import { AssistantDrawer } from './assistant-drawer'
import { AssistantFab } from './assistant-fab'
import { type AssistantContext, type ChatMessage } from './assistant-types'
import { ASK_EVENT, type AskEventDetail } from '@/components/shell/ask-event'

/**
 * The chat survives navigation (this dock lives in the shell) and a reload of
 * the tab (sessionStorage). It is saved with the user's uid and restored only
 * for that same uid, so a different account signing in on this tab never sees
 * it.
 */
const STORAGE_KEY = 'aisa:tanya-aisa'

interface Saved {
  uid: string
  conversationId: string
  messages: ChatMessage[]
}

function newConversationId() {
  return crypto.randomUUID().replaceAll('-', '')
}

function readSaved(uid: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const saved = raw ? (JSON.parse(raw) as Saved) : null
    return saved?.uid === uid && Array.isArray(saved.messages) ? saved : null
  } catch {
    return null
  }
}

function writeSaved(saved: Saved) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {
    // Storage blocked or full: the chat still works, it just won't survive a reload.
  }
}

/**
 * "Tanya AISA": the floating launcher plus its chat panel, mounted once by the
 * app shell. Questions go to the real Asisten through `askAssistantAction`;
 * another page can open the panel and ask by dispatching an `aisa:ask` window
 * event with `detail.prompt`.
 */
export function AssistantDock() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [context, setContext] = useState<AssistantContext | null>(null)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<string | null>(null)
  // The ask whose answer is still awaited; STOP or a new conversation clears
  // it, and an answer arriving for any other ask is dropped.
  const pending = useRef<string | null>(null)
  const conversation = useRef<string | null>(null)
  const restored = useRef(false)

  const refreshContext = useCallback(async () => {
    const result = await settleAction(getAssistantContextAction)
    if (!result.ok) return
    const next = result.data
    setContext(next)
    if (restored.current) return
    restored.current = true
    const saved = readSaved(next.uid)
    if (saved && !conversation.current) {
      conversation.current = saved.conversationId
      setMessages(saved.messages)
    }
  }, [])

  useEffect(() => {
    void refreshContext()
  }, [refreshContext])

  useEffect(() => {
    if (open) void refreshContext()
  }, [open, refreshContext])

  useEffect(() => {
    if (!context || !conversation.current) return
    writeSaved({
      uid: context.uid,
      conversationId: conversation.current,
      messages,
    })
  }, [messages, context])

  const send = useCallback(
    async (text: string) => {
      if (pending.current) return
      const id = crypto.randomUUID()
      const conversationId = (conversation.current ??= newConversationId())
      pending.current = id
      setBusy(true)
      setMessages((list) => [
        ...list,
        { id: `${id}:q`, role: 'user', content: text },
      ])
      const result = await settleAction(() =>
        askAssistantAction(conversationId, text),
      )
      if (pending.current !== id) return
      pending.current = null
      setBusy(false)
      const outcome = result.ok ? result.data : result
      if (!outcome.ok) {
        toast.error(outcome.error)
        setMessages((list) => [
          ...list,
          {
            id: `${id}:e`,
            role: 'error',
            content: outcome.error,
            question: text,
          },
        ])
        return
      }
      const { answer } = outcome.data
      setMessages((list) => [
        ...list,
        { id: `${id}:a`, role: 'assistant', content: answer },
      ])
      // The answer may be the paused reply; let the header catch up.
      void refreshContext()
    },
    [refreshContext],
  )

  const stop = useCallback(() => {
    pending.current = null
    setBusy(false)
  }, [])

  const retry = useCallback(
    (failed: ChatMessage) => {
      if (!failed.question || pending.current) return
      const ask = failed.id.split(':')[0]
      setMessages((list) => list.filter((m) => m.id.split(':')[0] !== ask))
      void send(failed.question)
    },
    [send],
  )

  const clear = useCallback(() => {
    stop()
    conversation.current = newConversationId()
    setMessages([])
  }, [stop])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onAsk = (event: Event) => {
      const prompt = (event as CustomEvent<AskEventDetail>).detail?.prompt
      if (typeof prompt !== 'string' || !prompt.trim()) return
      setOpen(true)
      setQueued(prompt.trim())
    }
    window.addEventListener(ASK_EVENT, onAsk)
    return () => window.removeEventListener(ASK_EVENT, onAsk)
  }, [])

  // A question from another page waits for the answer in flight, then goes.
  useEffect(() => {
    if (!queued || busy) return
    setQueued(null)
    void send(queued)
  }, [queued, busy, send])

  return (
    <>
      {!(open && expanded) && (
        <AssistantFab open={open} onToggle={() => setOpen((o) => !o)} />
      )}
      {open && (
        <AssistantDrawer
          expanded={expanded}
          messages={messages}
          busy={busy}
          context={context}
          onSend={(text) => void send(text)}
          onStop={stop}
          onRetry={retry}
          onClear={clear}
          onClose={close}
          onExpandedChange={setExpanded}
        />
      )}
    </>
  )
}
