/** Ordered least- to most-severe. Shared by logger configuration and env parsing. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]
