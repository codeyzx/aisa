/**
 * The URL-state contract for /export — and, more importantly, the ONE place the
 * page's filter vocabulary is TRANSLATED into the export routes'.
 *
 * Two vocabularies meet here, and they genuinely differ:
 *
 *  - THE PAGE speaks `all | active | retired`. A filter control needs a name for
 *    "not filtered", exactly as `/assets` does — a control with no word for the
 *    unfiltered case has to express it as absence, which no radio group can show.
 *  - THE ROUTES (`features/asset/asset.dataset.ts`) speak `active | retired`, and
 *    an absent `?status=` means unfiltered. `?status=all` is a 400 there, ON
 *    PURPOSE and argued in that file: an export hands over a FILE, so an
 *    unrecognized filter must never fall back to "everything" and quietly ship
 *    more rows than were asked for.
 *
 * So the translation is not a convenience — emitting `?status=all` at a download
 * link would turn every "Semua" download into a 400 the reader saves as a
 * spreadsheet. `datasetHref` below is the only thing allowed to build those URLs.
 *
 * Deliberately NOT importing `app/(app)/(examples)/assets/search-params.ts`,
 * which already has an `ASSET_STATUS_FILTER_VALUES` of the same shape. The two
 * examples must stay independently deletable — `trash`ing the assets example
 * must not break this page — and the vocabulary this page actually has to honor
 * is the DATASET's, not the assets list's. Sharing the constant would couple two
 * examples to make one word look shared.
 */
import {
  createLoader,
  createSerializer,
  parseAsStringLiteral,
} from 'nuqs/server'

import {
  ASSET_STATUS_LABEL,
  AssetStatusSchema,
  type Asset,
} from '@/features/asset/asset.schema'
import { parseAsStrictSingle } from '@/lib/search-param'

/** The page's filter widens the entity's status set with an unfiltered option. */
export const EXPORT_STATUS_VALUES = [
  'all',
  ...AssetStatusSchema.options,
] as const

export type ExportStatusValue = (typeof EXPORT_STATUS_VALUES)[number]

/**
 * Human labels, in the product language. `all` gets its own word; the real
 * statuses read from `ASSET_STATUS_LABEL` so this page can never disagree with
 * the list about what `retired` is called.
 *
 * `Record<ExportStatusValue, string>` so adding a status to `AssetStatusSchema`
 * is a COMPILE ERROR here until it has a label — the same trick `ROLE_LABEL` and
 * `ASSET_STATUS_LABEL` use.
 */
export const EXPORT_STATUS_LABEL: Record<ExportStatusValue, string> = {
  all: 'Semua',
  ...ASSET_STATUS_LABEL,
}

const exportSearchParams = {
  /**
   * `parseAsStrictSingle`, so `?status=active&status=retired` is INVALID rather
   * than silently resolving to the first one. A repeated key on a page whose
   * whole output is a download link is a reader who thinks they filtered.
   */
  status: parseAsStrictSingle(
    parseAsStringLiteral(EXPORT_STATUS_VALUES),
  ).withDefault('all'),
}

export const loadExportSearchParams = createLoader(exportSearchParams)

const serialize = createSerializer(exportSearchParams)

/** A link to this page under a different filter. */
export function exportHref(status: ExportStatusValue): string {
  return serialize('/export', { status })
}

/**
 * A link to one of the dataset export ROUTES under the current filter.
 *
 * This is the translation described at the top of the file: `all` becomes NO
 * parameter, because the route's vocabulary has no word for it and answers 400
 * to the one this page uses. Everything else passes straight through, since the
 * two vocabularies agree on the real statuses by construction — both are
 * `AssetStatusSchema.options`.
 */
export function datasetHref(
  format: 'csv' | 'xlsx',
  status: ExportStatusValue,
): string {
  const path = `/api/export/assets/${format}`
  if (status === 'all') return path
  // Narrowed by the check above: the remaining values ARE the entity's statuses.
  const known: Asset['status'] = status
  return `${path}?status=${encodeURIComponent(known)}`
}
