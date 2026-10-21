import { describe, expect, it } from 'vitest'

import { SECURE_COOKIE_ATTRIBUTES } from './cookie-options'

describe('SECURE_COOKIE_ATTRIBUTES', () => {
  it('keeps the shared auth-cookie safety baseline', () => {
    expect(SECURE_COOKIE_ATTRIBUTES).toEqual({
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
  })
})
