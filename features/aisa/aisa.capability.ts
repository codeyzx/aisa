import { type Capability } from '@/lib/auth/rbac'

/** Read every AISA surface: proposals, trends, AI activity, history, settings. */
export const AISA_READ: Capability = 'aisa:read'

/**
 * Act on proposals through `aisa-api`: respond (undang/pantau/arsipkan), bulk
 * respond, correct a category, upload a pitch deck.
 */
export const AISA_RESPOND: Capability = 'aisa:respond'

/** Change the scoring rules and STOP/LANJUT the AI runtime. */
export const AISA_CONFIGURE: Capability = 'aisa:configure'
