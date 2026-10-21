// TEMPLATE — the authority this entity's surfaces gate on. See
// `_template.schema.ts` for the token legend. Copy to
// `features/<entity>/<entity>.capability.ts`.
//
// THIS FILE IS A TYPE ERROR UNTIL YOU DECLARE THESE CAPABILITIES, on purpose.
// `Capability` is a closed union built from `CAPABILITIES` in `lib/auth/rbac.ts`,
// so a name that is not in that list cannot satisfy it. Add yours there and the
// error clears:
//
//   export const CAPABILITIES = [
//     '<entity>:read',
//     '<entity>:write',
//     …
//   ] as const
//
// then grant them per role in `ROLE_CAPABILITIES`. Refusing to compile is the
// point: the alternative is a copied entity that silently keeps the REFERENCE
// feature's authority, so everyone who may read that feature can read your rows,
// and a role that should reach yours cannot. That failure is invisible — every
// gate passes, and it grants the wrong people.
//
// Every surface reads these consts rather than spelling a capability inline, so
// the entity's authority is named ONCE — and so the error above lands HERE, in
// one place, instead of at each of the nine gates. The `: Capability`
// annotation is what buys that (`satisfies` would keep the literal type and
// push the same error out to every call site); `RETAINED_ADMIN_CAPABILITY` in
// `lib/auth/rbac.ts` is the same pattern for the same reason.
//
// EXCLUDED from typecheck by the `_template.*` name.

import { type Capability } from '@/lib/auth/rbac'

/** Read the list and one row. Gates the list and detail pages. */
export const __ENTITY___READ: Capability = '__entity__:read'

/** Create, update and delete. Gates the form pages and every mutation entry. */
export const __ENTITY___WRITE: Capability = '__entity__:write'
