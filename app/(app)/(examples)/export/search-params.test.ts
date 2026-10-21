import { describe, expect, it } from 'vitest'

import { AssetStatusSchema } from '@/features/asset/asset.schema'

import {
  datasetHref,
  exportHref,
  EXPORT_STATUS_LABEL,
  EXPORT_STATUS_VALUES,
  loadExportSearchParams,
} from './search-params'

/**
 * The one thing worth testing here is the TRANSLATION, not the parsing.
 *
 * This page says `all`; the export routes answer 400 to `?status=all`, on
 * purpose (`features/asset/asset.dataset.ts` argues why). Driven against a
 * running server, `/api/export/assets/csv?status=all` really does answer 400 —
 * so a `datasetHref` that passed `all` straight through would make every
 * "Semua" download a 400 the reader saves as a spreadsheet. That is the
 * regression this file exists to catch.
 */
describe('datasetHref', () => {
  it('OMITS the parameter for `all`, because the route rejects that word', () => {
    expect(datasetHref('csv', 'all')).toBe('/api/export/assets/csv')
    expect(datasetHref('xlsx', 'all')).toBe('/api/export/assets/xlsx')
  })

  it('passes a real status through, in the route vocabulary', () => {
    for (const status of AssetStatusSchema.options) {
      expect(datasetHref('csv', status)).toBe(
        `/api/export/assets/csv?status=${status}`,
      )
    }
  })

  it('never emits the page-only word to a route', () => {
    // Derived from the page's OWN vocabulary rather than a hand-written list, so
    // adding a filter value that the routes cannot honor fails here.
    for (const value of EXPORT_STATUS_VALUES) {
      expect(datasetHref('csv', value)).not.toContain('status=all')
    }
  })
})

describe('exportHref', () => {
  it('drops the parameter for the default and names the others', () => {
    expect(exportHref('all')).toBe('/export')
    expect(exportHref('active')).toBe('/export?status=active')
    expect(exportHref('retired')).toBe('/export?status=retired')
  })
})

describe('loadExportSearchParams', () => {
  // `createLoader` is synchronous when handed a plain object and returns a
  // Promise only when handed one (which is what the page does with Next 16's
  // `searchParams`). Asserted synchronously here so the test exercises the
  // parsing rather than the await.
  it('defaults to the unfiltered set', () => {
    expect(loadExportSearchParams({})).toEqual({ status: 'all' })
  })

  it('reads a known status', () => {
    expect(loadExportSearchParams({ status: 'retired' })).toEqual({
      status: 'retired',
    })
  })

  it('falls back for an unknown status — this is a VIEW, not the export', () => {
    // Deliberately the opposite of `resolveAssetDataset`, which 400s. A page
    // shows you what it did in the same glance, so a fallback here is visible;
    // the ROUTE hands over a file, where the same fallback would silently ship
    // the whole collection. The divergence is the point, so it is asserted.
    expect(loadExportSearchParams({ status: 'activ' })).toEqual({
      status: 'all',
    })
  })

  it('refuses a repeated key rather than picking the first', () => {
    expect(loadExportSearchParams({ status: ['active', 'retired'] })).toEqual({
      status: 'all',
    })
  })

  it('resolves the Promise shape the page actually passes', async () => {
    await expect(
      loadExportSearchParams(Promise.resolve({ status: 'active' })),
    ).resolves.toEqual({ status: 'active' })
  })
})

describe('EXPORT_STATUS_LABEL', () => {
  it('names every value the filter can hold', () => {
    for (const value of EXPORT_STATUS_VALUES) {
      expect(EXPORT_STATUS_LABEL[value]).toBeTruthy()
    }
  })
})
