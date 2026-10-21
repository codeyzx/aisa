import { describe, expect, it } from 'vitest'

import type { Asset } from './asset.schema'

import { assetFormValues } from './asset.form-opts'

const createdAt = new Date('2026-07-20T00:00:00.000Z')

describe('assetFormValues', () => {
  it('projects stored assets into the complete controlled form shape', () => {
    const asset: Asset = {
      id: 'asset-1',
      code: 'AST-0001',
      name: 'Laptop',
      value: 0,
      status: 'active',
      searchPrefixes: ['lap'],
      createdAt,
      updatedAt: createdAt,
    }

    expect(assetFormValues(asset)).toEqual({
      name: 'Laptop',
      description: '',
      value: 0,
      status: 'active',
      attachmentKey: '',
    })
  })
})
