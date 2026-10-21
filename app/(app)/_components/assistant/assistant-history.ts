import { LOCALE, TIME_ZONE } from '@/lib/format/locale'
import { USER_DATA_PREFIX } from '@/lib/user-browser-data'

import type { ChatMessage } from './assistant-types'

/**
 * One saved "Tanya AISA" conversation. `id` is the conversationId the server
 * builds the Asisten session from, so reopening it continues the same session
 * key.
 */
export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

/**
 * The history is kept in localStorage under the user's uid, so a different
 * account signing in on this browser never sees it, and it is shared by the
 * user's tabs. It sits under USER_DATA_PREFIX, so signing out removes it.
 */
const HISTORY_PREFIX = `${USER_DATA_PREFIX}tanya-aisa:riwayat:`
/** The conversation open in THIS tab, so a reload reopens it. */
const ACTIVE_KEY = `${USER_DATA_PREFIX}tanya-aisa:aktif`
/** Where the single conversation lived before there was a history. */
const LEGACY_KEY = 'aisa:tanya-aisa'

/**
 * localStorage is about 5 MB for the whole app, and an answer can run to a few
 * kilobytes, so an unbounded history would eventually make every save fail on
 * quota. Fifty is far more than a manager scrolls back through; the least
 * recently updated ones go first.
 */
export const MAX_CONVERSATIONS = 50
export const TITLE_MAX = 48
export const RENAME_MAX = 80

export function historyKey(uid: string) {
  return HISTORY_PREFIX + uid
}

export function newConversationId() {
  return crypto.randomUUID().replaceAll('-', '')
}

/** The first question on one line, cut at a word near `TITLE_MAX`. */
export function deriveTitle(question: string): string {
  const line = question.replace(/\s+/g, ' ').trim()
  if (line.length <= TITLE_MAX) return line || 'Percakapan'
  const cut = line.slice(0, TITLE_MAX - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** A rename as stored, or null when it would leave no title. */
export function cleanTitle(input: string): string | null {
  const line = input.replace(/\s+/g, ' ').trim().slice(0, RENAME_MAX)
  return line || null
}

function isMessage(value: unknown): value is ChatMessage {
  const m = value as ChatMessage
  return (
    typeof m?.id === 'string' &&
    typeof m.content === 'string' &&
    (m.role === 'user' || m.role === 'assistant' || m.role === 'error')
  )
}

function isConversation(value: unknown): value is Conversation {
  const c = value as Conversation
  return (
    typeof c?.id === 'string' &&
    typeof c.title === 'string' &&
    Number.isFinite(c.createdAt) &&
    Number.isFinite(c.updatedAt) &&
    Array.isArray(c.messages) &&
    c.messages.length > 0 &&
    c.messages.every(isMessage)
  )
}

/** Newest first, capped at `MAX_CONVERSATIONS`; empty conversations are not history. */
export function prune(list: Conversation[]): Conversation[] {
  return list
    .filter((c) => c.messages.length > 0)
    .toSorted((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
}

/** Parses a stored history, dropping any entry that is not a whole conversation. */
export function parseHistory(raw: string | null): Conversation[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? prune(parsed.filter(isConversation)) : []
  } catch {
    return []
  }
}

/**
 * The conversation from the old one-conversation sessionStorage format, if it
 * belongs to `uid`. Its real start time was never saved, so it is dated `now`:
 * it can only be from this tab's lifetime, which is the best bound there is.
 */
export function parseLegacy(
  raw: string | null,
  uid: string,
  now: number,
): Conversation | null {
  if (!raw) return null
  try {
    const saved = JSON.parse(raw) as {
      uid?: unknown
      conversationId?: unknown
      messages?: unknown
    }
    if (saved.uid !== uid || typeof saved.conversationId !== 'string')
      return null
    const messages = Array.isArray(saved.messages)
      ? saved.messages.filter(isMessage)
      : []
    const first = messages.find((m) => m.role === 'user')
    if (!first) return null
    return {
      id: saved.conversationId,
      title: deriveTitle(first.content),
      createdAt: now,
      updatedAt: now,
      messages,
    }
  } catch {
    return null
  }
}

/** Puts `incoming` into `list`, keeping whichever copy of an id was updated last. */
export function mergeHistory(
  list: Conversation[],
  incoming: Conversation[],
): Conversation[] {
  const byId = new Map(list.map((c) => [c.id, c]))
  for (const c of incoming) {
    const held = byId.get(c.id)
    if (!held || c.updatedAt >= held.updatedAt) byId.set(c.id, c)
  }
  return prune([...byId.values()])
}

// ---------- storage: every access may throw (blocked, private mode, quota) ----------

/**
 * The user's history, with the old sessionStorage conversation folded in once
 * and its key removed. Returns the migrated conversation's id so the panel can
 * reopen it.
 */
export function loadHistory(
  uid: string,
  now = Date.now(),
): { list: Conversation[]; migratedId: string | null } {
  let list: Conversation[] = []
  try {
    list = parseHistory(localStorage.getItem(historyKey(uid)))
  } catch {
    return { list, migratedId: null }
  }
  let legacy: Conversation | null = null
  try {
    legacy = parseLegacy(sessionStorage.getItem(LEGACY_KEY), uid, now)
  } catch {
    // No sessionStorage: nothing to migrate.
  }
  if (!legacy) return { list, migratedId: null }
  const merged = list.some((c) => c.id === legacy.id)
    ? list
    : mergeHistory(list, [legacy])
  // Remove the old key only once the history holding it is saved, so a failed
  // save leaves it to be migrated next time instead of losing it.
  if (saveHistory(uid, merged)) {
    try {
      sessionStorage.removeItem(LEGACY_KEY)
    } catch {
      // Left in place; the id check above keeps a second migration a no-op.
    }
  }
  return { list: merged, migratedId: legacy.id }
}

/** Saves the history; on a quota error retries with the newest ten only. */
export function saveHistory(uid: string, list: Conversation[]): boolean {
  const pruned = prune(list)
  for (const attempt of [pruned, pruned.slice(0, 10)]) {
    try {
      localStorage.setItem(historyKey(uid), JSON.stringify(attempt))
      return true
    } catch {
      // Try the smaller set, then give up: the chat keeps working in memory.
    }
  }
  return false
}

export function readActive(uid: string): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) ?? 'null') as {
      uid?: unknown
      id?: unknown
    } | null
    return saved?.uid === uid && typeof saved.id === 'string' ? saved.id : null
  } catch {
    return null
  }
}

export function writeActive(uid: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ uid, id }))
    else sessionStorage.removeItem(ACTIVE_KEY)
  } catch {
    // A reload then opens a new conversation instead; nothing is lost.
  }
}

// ---------- dates, all in WIB ----------

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Days since the epoch of the WIB calendar date `ms` falls on. */
export function wibDay(ms: number): number {
  const [y, m, d] = dayFormat.format(ms).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

const monthFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: 'long',
  year: 'numeric',
})

export interface HistoryGroup {
  label: string
  conversations: Conversation[]
}

/** The date section a conversation updated at `ms` is listed under. */
export function groupLabel(ms: number, now: number): string {
  const age = wibDay(now) - wibDay(ms)
  if (age <= 0) return 'Hari ini'
  if (age === 1) return 'Kemarin'
  if (age <= 7) return '7 hari terakhir'
  if (age <= 30) return '30 hari terakhir'
  return monthFormat.format(ms)
}

/** Sections in list order, newest first, by `updatedAt`. */
export function groupByDate(list: Conversation[], now: number): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  for (const c of list.toSorted((a, b) => b.updatedAt - a.updatedAt)) {
    const label = groupLabel(c.updatedAt, now)
    const last = groups.at(-1)
    if (last?.label === label) last.conversations.push(c)
    else groups.push({ label, conversations: [c] })
  }
  return groups
}

/** True when the conversation began before today (WIB). */
export function startedBeforeToday(c: Conversation, now: number): boolean {
  return wibDay(c.createdAt) < wibDay(now)
}

export function matchesQuery(c: Conversation, query: string): boolean {
  const q = query.trim().toLocaleLowerCase(LOCALE)
  if (!q) return true
  return (
    c.title.toLocaleLowerCase(LOCALE).includes(q) ||
    c.messages.some((m) => m.content.toLocaleLowerCase(LOCALE).includes(q))
  )
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
const stamp = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** e.g. `3 jam yang lalu · 22 Okt 2026 14.05`, for a hover title. */
export function describeTime(ms: number, now: number): string {
  const minutes = Math.round((ms - now) / 60_000)
  const rel =
    Math.abs(minutes) < 1
      ? 'baru saja'
      : Math.abs(minutes) < 60
        ? relative.format(minutes, 'minute')
        : Math.abs(minutes) < 60 * 24
          ? relative.format(Math.round(minutes / 60), 'hour')
          : relative.format(wibDay(ms) - wibDay(now), 'day')
  return `${rel} · ${stamp.format(ms)}`
}
