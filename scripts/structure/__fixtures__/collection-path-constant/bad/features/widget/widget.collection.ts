// BAD: both paths are spelled inline at the call site. The feature exports no
// path constant, so a seed script or a migration needing `widgets` must retype
// it — and a retyped path reads an empty collection instead of throwing.
import {
  rawCollection,
  typedCollection,
  typedCollectionGroup,
} from '../../lib/firebase/collections.ts'

const WidgetSchema = { parse: (value: unknown) => value }

export const widgetsCollection = () => typedCollection('widgets', WidgetSchema)

export const widgetPartsGroup = () =>
  typedCollectionGroup('parts', WidgetSchema)

// The sanctioned converter bypass addresses the same documents — and spells the
// path a third time.
export const widgetsForRepair = () => rawCollection('widgets')
