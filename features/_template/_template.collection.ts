// TEMPLATE — copy-me starter for a new entity's typed collection accessor. See
// `_template.schema.ts` for the token legend. Copy to
// `features/<entity>/<entity>.collection.ts`.
//
// This is the seam that keeps `lib/` domain-agnostic: generic `typedCollection`
// machinery lives in `lib/firebase/collections.ts`; this feature owns its path
// (`<entity>.path.ts`) and binds that path to its schema here.
//
// EXCLUDED from typecheck by the `_template.*` name.

import 'server-only'

import { typedCollection } from '@/lib/firebase/collections'

import { __ENTITIES___COLLECTION } from './__entity__.path'
import { __Entity__Schema } from './__entity__.schema'

export const __entities__Collection = () =>
  typedCollection(__ENTITIES___COLLECTION, __Entity__Schema)
