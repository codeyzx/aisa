// TEMPLATE — feature-owned Firestore collection path. See `_template.schema.ts`
// for the token legend. Copy to `features/<entity>/<entity>.path.ts`.
//
// Keep this dependency-free: scripts, Firestore Rules tests, and feature code can
// use the same path without pulling in the Admin SDK or a schema converter.
//
// EXCLUDED from typecheck by the `_template.*` name.

export const __ENTITIES___COLLECTION = '__entities__'
