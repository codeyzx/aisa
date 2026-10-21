// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { clearUserBrowserData, USER_DATA_PREFIX } from './user-browser-data'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('clearUserBrowserData', () => {
  it("removes every entry under the user prefix and keeps everyone else's", () => {
    localStorage.setItem(`${USER_DATA_PREFIX}tanya-aisa:riwayat:u1`, '[]')
    localStorage.setItem(`${USER_DATA_PREFIX}tanya-aisa:riwayat:u2`, '[]')
    sessionStorage.setItem(`${USER_DATA_PREFIX}tanya-aisa:aktif`, '{}')
    localStorage.setItem('theme', 'dark')
    sessionStorage.setItem('other', '1')

    clearUserBrowserData()

    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(sessionStorage.length).toBe(1)
    expect(sessionStorage.getItem('other')).toBe('1')
  })
})
