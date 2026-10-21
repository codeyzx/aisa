'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { askAssistantAction } from '@/features/aisa/aisa.action'
import { settleAction } from '@/lib/data/action.contract'

import { getAssistantContextAction } from './assistant-context.action'
import { AssistantDrawer } from './assistant-drawer'
import { AssistantFab } from './assistant-fab'
import {
  deriveTitle,
  historyKey,
  loadHistory,
  mergeHistory,
  newConversationId,
  parseHistory,
  prune,
  readActive,
  saveHistory,
  writeActive,
  type Conversation,
} from './assistant-history'
import { type AssistantContext, type ChatMessage } from './assistant-types'
import { ASK_EVENT, type AskEventDetail } from '@/components/shell/ask-event'

/**
 * "Tanya AISA": the floating launcher plus its chat panel, mounted once by the
 * app shell. Questions go to the real Asisten through `askAssistantAction`;
 * another page can open the panel and ask by dispatching an `aisa:ask` window
 * event with `detail.prompt`.
 *
 * Conversations are kept per user in localStorage (see `assistant-history`),
 * so they survive navigation, reloads and new tabs; with storage blocked they
 * live only as long as this page. The open one is remembered per tab.
 */
export function AssistantDock() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [context, setContext] = useState<AssistantContext | null>(null)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<string | null>(null)
  // The ask whose answer is still awaited; STOP or switching conversation
  // clears it, and an answer arriving for any other ask is dropped.
  const pending = useRef<string | null>(null)
  // The id the next question goes to: the open conversation, or a fresh id
  // for a new one that has no messages (and so no history entry) yet.
  const conversation = useRef<string>(newConversationId())
  const uid = context?.uid ?? null
  // The uid whose stored history is in memory. Writes wait for it, so an
  // empty list in memory can never overwrite what is stored.
  const [loadedUid, setLoadedUid] = useState<string | null>(null)
  // Set when the list was just read from storage, so it is not written back.
  const fromStorage = useRef(false)

  const refreshContext = useCallback(async () => {
    const result = await settleAction(getAssistantContextAction)
    if (result.ok) setContext(result.data)
  }, [])

  useEffect(() => {
    void refreshContext()
  }, [refreshContext])

  useEffect(() => {
    if (open) void refreshContext()
  }, [open, refreshContext])

  useEffect(() => {
    if (!uid || uid === loadedUid) return
    const { list, migratedId } = loadHistory(uid)
    // Anything asked before the first uid arrived is kept alongside what was
    // stored; a different account's conversations never are.
    setConversations((held) => (loadedUid ? list : mergeHistory(list, held)))
    setLoadedUid(uid)
    const reopen = migratedId ?? readActive(uid)
    if (reopen && list.some((c) => c.id === reopen) && !pending.current) {
      conversation.current = reopen
      setActiveId(reopen)
    }
  }, [uid, loadedUid])

  useEffect(() => {
    if (!uid || uid !== loadedUid) return
    if (fromStorage.current) {
      fromStorage.current = false
      return
    }
    saveHistory(uid, conversations)
  }, [conversations, uid, loadedUid])

  useEffect(() => {
    if (uid && uid === loadedUid) writeActive(uid, activeId)
  }, [activeId, uid, loadedUid])

  // Another tab of this user changed the history: show what it saved.
  useEffect(() => {
    if (!uid) return
    const onStorage = (event: StorageEvent) => {
      if (event.key !== historyKey(uid)) return
      fromStorage.current = true
      setConversations(parseHistory(event.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [uid])

  const append = useCallback(
    (id: string, message: ChatMessage, now = Date.now()) => {
      setConversations((list) => {
        const held = list.find((c) => c.id === id)
        const next: Conversation = held
          ? { ...held, updatedAt: now, messages: [...held.messages, message] }
          : {
              id,
              title: deriveTitle(message.content),
              createdAt: now,
              updatedAt: now,
              messages: [message],
            }
        return prune([next, ...list.filter((c) => c.id !== id)])
      })
    },
    [],
  )

  const send = useCallback(
    async (text: string) => {
      if (pending.current) return
      const id = crypto.randomUUID()
      const conversationId = conversation.current
      pending.current = id
      setBusy(true)
      setActiveId(conversationId)
      append(conversationId, { id: `${id}:q`, role: 'user', content: text })
      const result = await settleAction(() =>
        askAssistantAction(conversationId, text),
      )
      if (pending.current !== id) return
      pending.current = null
      setBusy(false)
      const outcome = result.ok ? result.data : result
      if (!outcome.ok) {
        toast.error(outcome.error)
        append(conversationId, {
          id: `${id}:e`,
          role: 'error',
          content: outcome.error,
          question: text,
        })
        return
      }
      append(conversationId, {
        id: `${id}:a`,
        role: 'assistant',
        content: outcome.data.answer,
      })
      // The answer may be the paused reply; let the header catch up.
      void refreshContext()
    },
    [append, refreshContext],
  )

  const stop = useCallback(() => {
    pending.current = null
    setBusy(false)
  }, [])

  const retry = useCallback(
    (failed: ChatMessage) => {
      if (!failed.question || pending.current) return
      const ask = failed.id.split(':')[0]
      const id = conversation.current
      setConversations((list) =>
        list.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: c.messages.filter((m) => m.id.split(':')[0] !== ask),
              }
            : c,
        ),
      )
      void send(failed.question)
    },
    [send],
  )

  const startNew = useCallback(() => {
    stop()
    conversation.current = newConversationId()
    setActiveId(null)
  }, [stop])

  const select = useCallback(
    (id: string) => {
      if (id === conversation.current) return
      stop()
      conversation.current = id
      setActiveId(id)
    },
    [stop],
  )

  const rename = useCallback((id: string, title: string) => {
    setConversations((list) =>
      list.map((c) => (c.id === id ? { ...c, title } : c)),
    )
  }, [])

  const remove = useCallback(
    (id: string) => {
      if (id === conversation.current) startNew()
      setConversations((list) => list.filter((c) => c.id !== id))
    },
    [startNew],
  )

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

  const active = conversations.find((c) => c.id === activeId) ?? null

  return (
    <>
      {!(open && expanded) && (
        <AssistantFab open={open} onToggle={() => setOpen((o) => !o)} />
      )}
      {open && (
        <AssistantDrawer
          expanded={expanded}
          conversation={active}
          conversations={conversations}
          busy={busy}
          context={context}
          onSend={(text) => void send(text)}
          onStop={stop}
          onRetry={retry}
          onNew={startNew}
          onSelect={select}
          onRename={rename}
          onDelete={remove}
          onClose={close}
          onExpandedChange={setExpanded}
        />
      )}
    </>
  )
}
