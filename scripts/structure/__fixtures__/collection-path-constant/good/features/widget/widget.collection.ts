// GOOD: both accessors receive the path as an identifier, so anything else that
// needs the path imports the same constant instead of retyping the string.
import {
  rawCollection,
  typedCollection,
  typedCollectionGroup,
} from '../../lib/firebase/collections.ts'

import { WIDGETS_COLLECTION, WIDGET_PARTS_COLLECTION } from './widget.path.ts'

const WidgetSchema = { parse: (value: unknown) => value }

export const widgetsCollection = () =>
  typedCollection(WIDGETS_COLLECTION, WidgetSchema)

export const widgetPartsGroup = () =>
  typedCollectionGroup(WIDGET_PARTS_COLLECTION, WidgetSchema)

export const widgetsForRepair = () => rawCollection(WIDGETS_COLLECTION)
