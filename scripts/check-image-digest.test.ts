import { describe, expect, it } from 'vitest'

import { isDigestPinned } from './check-image-digest.ts'

const DIGEST = `sha256:${'a'.repeat(64)}`

describe('isDigestPinned', () => {
  it('accepts a digest-pinned reference', () => {
    expect(isDigestPinned(`ghcr.io/you/aixel-app@${DIGEST}`)).toBe(true)
  })

  it('accepts a tag ALONGSIDE the digest — the bytes are still fixed', () => {
    expect(isDigestPinned(`ghcr.io/you/aixel-app:v1.4.2@${DIGEST}`)).toBe(true)
  })

  it.each([
    ['a moving tag', 'ghcr.io/you/aixel-app:latest'],
    [
      'a version tag — repointable like any other',
      'ghcr.io/you/aixel-app:v1.4.2',
    ],
    ['no tag at all, which means latest', 'ghcr.io/you/aixel-app'],
  ])('rejects %s', (_label, ref) => {
    expect(isDigestPinned(ref)).toBe(false)
  })

  it('rejects a truncated digest — the shape a copy-paste produces', () => {
    expect(isDigestPinned('ghcr.io/you/aixel-app@sha256:abc123')).toBe(false)
  })

  it('rejects an uppercase digest, which docker does not mint', () => {
    expect(isDigestPinned(`ghcr.io/you/app@sha256:${'A'.repeat(64)}`)).toBe(
      false,
    )
  })

  it('rejects a digest with anything after it', () => {
    // Anchored at the end on purpose: `…@sha256:<64>:latest` would otherwise
    // read as pinned while naming a tag docker resolves instead.
    expect(isDigestPinned(`ghcr.io/you/app@${DIGEST}:latest`)).toBe(false)
  })

  it('ignores surrounding whitespace, which a shell variable often carries', () => {
    expect(isDigestPinned(`  ghcr.io/you/app@${DIGEST}  `)).toBe(true)
  })
})
