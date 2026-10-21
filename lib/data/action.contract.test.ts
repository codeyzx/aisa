import { describe, expect, it } from 'vitest'

import { settleAction } from './action.contract'

describe('settleAction', () => {
  it('preserves resolved action results', async () => {
    await expect(
      settleAction(async () => ({ ok: true as const, data: 'ok' })),
    ).resolves.toEqual({
      ok: true,
      data: 'ok',
    })
  })

  it('normalizes a rejected transport', async () => {
    await expect(
      settleAction(async () => Promise.reject(new Error('transport failed'))),
    ).resolves.toEqual({
      ok: false,
      error: 'Tidak dapat menghubungi server. Coba lagi.',
      code: 'unavailable',
    })
  })
})
