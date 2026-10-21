import { describe, expect, it } from 'vitest'

import { safeInternalPath } from './safe-path'

/**
 * This is a security guard, so the cases that matter are the ones it must
 * REFUSE: every value that begins with a slash but still leaves the origin. A
 * mutation relaxing the regex to a bare `^/` reopens the open redirect, and one
 * of the rejection cases below reddens.
 */
describe('safeInternalPath', () => {
  it('keeps a plain same-origin path', () => {
    expect(safeInternalPath('/assets', '/dashboard')).toBe('/assets')
    expect(safeInternalPath('/', '/dashboard')).toBe('/')
  })

  it('preserves the query and fragment of an internal path', () => {
    expect(
      safeInternalPath('/assets?status=retired&sort=value:asc', '/x'),
    ).toBe('/assets?status=retired&sort=value:asc')
  })

  it('refuses an absolute URL', () => {
    expect(safeInternalPath('https://evil.com', '/dashboard')).toBe(
      '/dashboard',
    )
    expect(safeInternalPath('http://evil.com/assets', '/dashboard')).toBe(
      '/dashboard',
    )
  })

  it('refuses a protocol-relative URL', () => {
    // `//evil.com` — the browser reads it as `https://evil.com`.
    expect(safeInternalPath('//evil.com', '/dashboard')).toBe('/dashboard')
  })

  it('refuses a backslash-smuggled off-site redirect', () => {
    // `/\evil.com` — some browsers normalise `\` to `/`, making it `//evil.com`.
    expect(safeInternalPath('/\\evil.com', '/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('/\\/evil.com', '/dashboard')).toBe('/dashboard')
  })

  it('refuses a non-path or empty value', () => {
    expect(safeInternalPath(null, '/dashboard')).toBe('/dashboard')
    expect(safeInternalPath(undefined, '/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('', '/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('assets', '/dashboard')).toBe('/dashboard')
  })
})
