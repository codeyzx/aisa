/** One line of the "Tanya AISA" chat. `error` is a failed ask, kept with its question so it can be retried. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  question?: string
}

/** Live figures shown beside the chat; see `getAssistantContextAction`. */
export interface AssistantContext {
  uid: string
  total: number
  unresponded: number
  topUnresponded: number
  paused: boolean
}
