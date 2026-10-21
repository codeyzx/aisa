export const CAPABILITIES = ['example:read'] as const
export type Capability = (typeof CAPABILITIES)[number]
