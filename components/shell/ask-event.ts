/**
 * The one channel into the "Tanya AISA" dock: a `window` event carrying the
 * question. It lives with the shell because the shell mounts the dock, and any
 * page (or the shell's own ⌘K) may ask — shared code cannot import the dock.
 */
export const ASK_EVENT = 'aisa:ask'

export interface AskEventDetail {
  prompt: string
}

/** Open the dock and send `prompt` as the reader's question. */
export function askAssistant(prompt: string): void {
  window.dispatchEvent(
    new CustomEvent<AskEventDetail>(ASK_EVENT, { detail: { prompt } }),
  )
}
