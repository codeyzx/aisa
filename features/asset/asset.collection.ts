import 'server-only'

import { typedCollection } from '@/lib/firebase/collections'

import { ASSETS_COLLECTION } from './asset.path'
import { AssetSchema } from './asset.schema'

/**
 * The typed `assets` collection accessor. Its path and schema both belong to this
 * feature; shared Firebase only supplies the generic converter accessor.
 */
export const assetsCollection = () =>
  typedCollection(ASSETS_COLLECTION, AssetSchema)
