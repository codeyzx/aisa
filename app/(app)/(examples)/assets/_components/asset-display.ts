/**
 * Presentation constants for the asset list. Field labels live in the Asset
 * feature contract because exports and the PDF use the same terms.
 *
 * A neutral `.ts` module with TYPE-ONLY imports: it carries no `'use client'`
 * directive and pulls in nothing at runtime, so a Server Component and a client
 * island may both import it with no boundary to cross and no `Badge` component
 * dragged into either bundle. That is the whole reason the extract is safe — a
 * shared VALUE both sides own, not a component that would pick a side.
 */
import { type ComponentProps } from 'react'

import { type Badge } from '@/components/ui/badge'
import { type AssetStatus } from '@/features/asset/asset.schema'

/**
 * How the asset list paints each status. A `Record<AssetStatus, ...>` for the
 * same reason `ASSET_STATUS_LABEL` is one: a `status === 'active' ? … : …`
 * ternary is a special-case branch on one member, so a third status would
 * silently inherit the else-arm. Here, widening the enum stops the build until
 * the list says how to paint it.
 *
 * It lives HERE, not beside the label map in the schema: a variant is a
 * SURFACE's choice, not the entity's. `/state` badges the same statuses
 * uniformly and is right to — pushing the variant into the schema would make one
 * list's taste every reader's rule, and would point the data layer at the UI
 * kit. This module IS that surface layer, shared by both views of this one list.
 */
export const STATUS_VARIANT: Record<
  AssetStatus,
  ComponentProps<typeof Badge>['variant']
> = {
  active: 'secondary',
  retired: 'outline',
}
