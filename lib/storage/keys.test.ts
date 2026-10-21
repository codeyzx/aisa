import { describe, expect, it } from 'vitest'

import {
  buildKey,
  filenameFromKey,
  isStorageKeyForOwner,
  parseStorageKey,
  promoteKey,
} from './keys'

/**
 * `filenameFromKey` inverts `buildKey`'s layout, so the two are tested together:
 * the property that matters is that a key built here reads its name back, for any
 * filename — including names full of the `-` the UUID prefix is also made of,
 * which a naive `split('-')` would get wrong.
 */
describe('filenameFromKey', () => {
  it('recovers the sanitized name a real buildKey embedded', () => {
    const key = buildKey({
      prefix: 'uploads',
      ownerId: 'abc123',
      filename: 'report.pdf',
    })
    expect(filenameFromKey(key)).toBe('report.pdf')
  })

  it('survives a name that itself contains hyphens', () => {
    // `laporan Q3 (final).pdf` sanitizes to `laporan-Q3--final-.pdf` — five
    // hyphens in the NAME, on top of the four in the UUID. Slicing a fixed UUID
    // width is exact here where splitting on `-` would keep only the last group.
    const key = buildKey({
      prefix: 'uploads',
      ownerId: 'abc123',
      filename: 'laporan Q3 (final).pdf',
    })
    expect(filenameFromKey(key)).toBe('laporan-Q3--final-.pdf')
  })

  it('falls back to the last segment when there is no UUID prefix', () => {
    // A key that did not come from buildKey (an old shape, a hand-written one)
    // must not read back as an empty string — better the raw segment than blank.
    expect(filenameFromKey('uploads/uid/plain.txt')).toBe('plain.txt')
    expect(filenameFromKey('bare')).toBe('bare')
  })
})

/**
 * `promoteKey` moves a submitted upload across the staging → durable boundary.
 * The properties that matter: staging keys land under `assets/` with the rest of
 * the key intact, a durable key passes through unchanged (an edit that keeps its
 * attachment must not move it twice), and a foreign prefix throws rather than
 * silently promoting a key from an unknown namespace.
 */
describe('promoteKey', () => {
  it('moves a staging key under the durable prefix, keeping the remainder', () => {
    expect(promoteKey('uploads/uid/abc-report.pdf')).toBe(
      'assets/uid/abc-report.pdf',
    )
  })

  it('preserves a real buildKey remainder byte-for-byte', () => {
    const key = buildKey({
      prefix: 'uploads',
      ownerId: 'abc123',
      filename: 'report.pdf',
    })
    const promoted = promoteKey(key)
    expect(promoted).toBe(`assets/${key.slice('uploads/'.length)}`)
    // The move must not disturb the embedded name — download still reads it back.
    expect(filenameFromKey(promoted)).toBe('report.pdf')
  })

  it('passes a durable key through unchanged (idempotent)', () => {
    expect(promoteKey('assets/uid/abc-report.pdf')).toBe(
      'assets/uid/abc-report.pdf',
    )
  })

  it('throws on a key under any other prefix', () => {
    expect(() => promoteKey('exports/uid/abc-report.pdf')).toThrow()
    expect(() => promoteKey('bare')).toThrow()
  })
})

describe('parseStorageKey', () => {
  it('accepts the exact layout buildKey produces', () => {
    const key = buildKey({
      prefix: 'uploads',
      ownerId: 'uid123',
      filename: 'report.pdf',
    })
    expect(parseStorageKey(key)).toMatchObject({
      prefix: 'uploads',
      ownerId: 'uid123',
      filename: 'report.pdf',
    })
    expect(isStorageKeyForOwner(key, 'uploads', 'uid123')).toBe(true)
  })

  it('rejects foreign namespaces, owners, and malformed shapes', () => {
    const key = 'uploads/uid123/123e4567-e89b-42d3-a456-426614174000-report.pdf'
    expect(isStorageKeyForOwner(key, 'assets', 'uid123')).toBe(false)
    expect(isStorageKeyForOwner(key, 'uploads', 'other')).toBe(false)
    expect(parseStorageKey('uploads/uid123/extra/file.pdf')).toBeNull()
    expect(parseStorageKey('uploads/uid123/not-a-uuid-report.pdf')).toBeNull()
  })
})
