import { describe, expect, it } from 'vitest'

import {
  assertMigrationFilenameId,
  forEachRawCollectionPage,
  migrationIdFromFilename,
} from './infrastructure'

describe('migration ids', () => {
  it('derives the durable id from a valid filename', () => {
    expect(
      migrationIdFromFilename('0002-backfill-asset-search-prefixes.ts'),
    ).toBe('0002-backfill-asset-search-prefixes')
  })

  it('rejects malformed filenames and declared ids', () => {
    expect(() => migrationIdFromFilename('backfill-assets.ts')).toThrow(
      'NNNN-kebab-case.ts',
    )
    expect(() =>
      assertMigrationFilenameId('0002-backfill-assets.ts', 'not-a-number'),
    ).toThrow('kebab-case numeric id')
  })

  it('rejects a filename drift before migration work can begin', () => {
    expect(() =>
      assertMigrationFilenameId(
        '0002-backfill-assets.ts',
        '0003-backfill-assets',
      ),
    ).toThrow('Migration id mismatch')
  })
})

describe('forEachRawCollectionPage', () => {
  it('rejects an unbounded or invalid page size before querying', async () => {
    await expect(
      forEachRawCollectionPage({} as never, 0, () => undefined),
    ).rejects.toThrow('positive safe integer')
  })
})
