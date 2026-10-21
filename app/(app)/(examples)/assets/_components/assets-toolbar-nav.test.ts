import { describe, expect, it, vi } from 'vitest'

import type { ToolbarNavigationEffect } from '@/lib/list-toolbar'

import type { AssetsQuery } from '../search-params'
import { createAssetsToolbarAdapter } from './assets-toolbar-nav'
import type { AssetsToolbarValues } from './assets-toolbar-scope'

const initial: AssetsQuery = {
  q: '',
  status: 'all',
  sort: { field: 'createdAt', direction: 'desc' },
  pageSize: '25',
  view: 'table',
  cursor: 'CURSOR',
}

function effect(
  values: AssetsToolbarValues,
  controls: Array<keyof AssetsToolbarValues>,
): ToolbarNavigationEffect<AssetsToolbarValues> {
  return { navigationId: 1, values, controls }
}

describe('createAssetsToolbarAdapter', () => {
  it('keeps the cursor for a rendering-only view change', () => {
    const push = vi.fn()
    const adapter = createAssetsToolbarAdapter({ push } as never, {
      current: initial,
    })

    adapter.navigate(effect({ ...initial, view: 'card' }, ['view']))

    expect(push).toHaveBeenCalledWith('/assets?view=card&cursor=CURSOR')
  })

  it('drops the cursor when a pending query change is followed by view', () => {
    const push = vi.fn()
    const adapter = createAssetsToolbarAdapter({ push } as never, {
      current: initial,
    })

    adapter.navigate(
      effect({ ...initial, status: 'retired', view: 'card' }, [
        'status',
        'view',
      ]),
    )

    expect(push).toHaveBeenCalledWith('/assets?status=retired&view=card')
  })
})
