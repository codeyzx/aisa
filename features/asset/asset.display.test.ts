import { describe, expect, it } from 'vitest'

import { ASSET_EXPORT_HEADER } from './asset.columns'
import { ASSET_FIELD_LABEL } from './asset.display'

describe('ASSET_FIELD_LABEL', () => {
  it('provides the exact asset labels used by dataset exports', () => {
    expect(ASSET_EXPORT_HEADER).toEqual([
      ASSET_FIELD_LABEL.code,
      ASSET_FIELD_LABEL.name,
      ASSET_FIELD_LABEL.description,
      ASSET_FIELD_LABEL.value,
      ASSET_FIELD_LABEL.status,
      ASSET_FIELD_LABEL.createdAt,
    ])
  })
})
